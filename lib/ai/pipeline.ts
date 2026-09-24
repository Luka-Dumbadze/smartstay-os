import 'server-only'
import { Type, type GenerateContentResponseUsageMetadata } from '@google/genai'
import { admin, must } from '@/lib/supabase/admin'
import { flushOutbound, keepTyping, sendWelcome, type IngestResult } from '@/lib/telegram'
import { MODEL, THINKING, gemini, geminiConfigured, withRetry } from './gemini'
import { embedQuery } from './embed'

/*
 * Mia → Sommelier → Operations Coordinator, as specified in research/nextjs_supabase_telegram_blueprint.md §6.2.
 * The model classifies and phrases; SQL and code enforce: prices, allergens, task creation, the dispatch gate and
 * evidence validity are checked outside the model. Sensitive CRM facts never enter a prompt.
 */

type Intent = { kind: 'wine_order' | 'wine_info' | 'amenity' | 'policy' | 'other'; query?: string; item?: string; quantity?: number }
type Evidence = {
  chunk_id: string; document: string; version: number; approved_by: string | null
  structured: { item?: string; price_gel?: number; unit?: string; allergens?: string[]; topic?: string; notes?: string }
  content: string; content_sha256: string; allergen_conflict?: boolean
}
type GuestContext = {
  profile: { id: string; full_name: string; locale: string; loyalty_tier: string | null; provisional: boolean }
  stay: { id: string; room_number: string; room_id: string; arrival: string; departure: string; status: string } | null
  preferences: { domain: string; label: string; value: string }[]
  sensitive: { label: string; value: string }[]
}
type Session = { id: string; state: string; space_id: string }
type Agent = { key: string; thinking_level: 'low' | 'medium' | 'high'; instructions: string; enabled: boolean }
type HitRow = {
  chunk_id: string; document_title: string; document_version: number; approved_by: string | null
  content: string; structured: Evidence['structured']; content_sha256: string; score: number
}

const INTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ['wine_order', 'wine_info', 'amenity', 'policy', 'other'] },
          query: { type: Type.STRING, description: 'English search keywords for the hotel knowledge base' },
          item: { type: Type.STRING, description: 'wine name or amenity item, e.g. "Saperavi 2022" or "towels"' },
          quantity: { type: Type.INTEGER },
        },
        required: ['kind'],
      },
    },
  },
  required: ['intents'],
}

const REPLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    cited_chunk_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['reply', 'cited_chunk_ids'],
}

const CLASSIFY_PROMPT = `You are Mia, the front-desk concierge of a Georgian wine resort. Classify the guest message into intents.
Kinds: wine_order = the guest wants a wine brought or ordered; wine_info = asks about a wine, its price or allergens;
amenity = needs an in-room item (towels, pillows, bathrobes, toiletries) — set item and quantity;
policy = asks about hotel rules (checkout, late checkout, tasting or tour cancellation, amenities);
other = anything else (transport, bookings, complaints, small talk). Return one entry per distinct request.
The guest may write in Georgian, Russian or English. Always return English search keywords in "query".`

const COMPOSE_PROMPT = `You are Mia, the AI concierge of the hotel. Write ONE reply to the guest in the same language they used.
Rules: use ONLY the FACTS for any price, allergen or policy statement and cite the chunk_id of every fact you use;
never invent prices, availability or times; never say a request is already done, delivered or completed — staff confirm
completion; say what has been arranged ("I've asked housekeeping…"). If a wine order needs a charge, say the front desk
will confirm the room charge. Mention allergens only as listed in the facts. No markdown, at most 600 characters, warm and concise.`

const COMPLETION_CLAIM = /\b(has|have|was|were) been (delivered|completed|done|brought)\b|\balready (delivered|done|in your room)\b/i

function num(n: number | undefined, fallback: number) {
  return Number.isFinite(n) && (n as number) > 0 ? Math.min(Math.floor(n as number), 20) : fallback
}

/** Every "NN GEL" / "NN ლარი" / "NN лари" in the reply must equal a cited price. */
function pricesGrounded(reply: string, cited: Evidence[]): boolean {
  const allowed = new Set(cited.map((e) => e.structured.price_gel).filter((p): p is number => typeof p === 'number'))
  const found = [...reply.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:GEL|₾|ლარ|лари|лар)/gi)].map((m) => Number(m[1].replace(',', '.')))
  return found.every((p) => allowed.has(p))
}

export async function runPipeline(x: IngestResult): Promise<void> {
  const db = admin()
  const cc = db.schema('contact_center')
  const team = db.schema('ai_team')

  // Serialise per conversation: if an older session is still running, leave this update for the sweeper.
  const running = must(await team.from('sessions').select('id, trigger_message_id')
    .eq('conversation_id', x.conversation_id).eq('state', 'RUNNING').neq('trigger_message_id', x.message_id)
    .gte('started_at', new Date(Date.now() - 120_000).toISOString()), 'check running sessions') as { id: string }[]
  if (running.length) throw new Error('conversation busy: another AI session is running')

  // Only the newest guest message is answered; earlier unanswered ones are included as context.
  const trigger = must(await cc.from('messages').select('id, seq, body').eq('id', x.message_id).single(), 'load trigger') as { id: string; seq: number; body: string }
  const newer = must(await cc.from('messages').select('id').eq('conversation_id', x.conversation_id)
    .eq('direction', 'inbound').gt('seq', trigger.seq).limit(1), 'check newer') as { id: string }[]
  if (newer.length) return

  const session = must(await team.rpc('start_session', { p_conversation_id: x.conversation_id, p_trigger_message_id: x.message_id }), 'start_session') as Session
  if (session.state !== 'RUNNING') return                                   // idempotent re-run: already handled

  const agents = new Map((must(await team.from('agents').select('key, thinking_level, instructions, enabled').eq('space_id', x.space_id), 'load agents') as Agent[]).map((a) => [a.key, a]))
  const thinking = (key: string, fallback: 'low' | 'medium' | 'high') => THINKING[agents.get(key)?.thinking_level ?? fallback]

  const step = async (agent: string, kind: string, title: string, detail: Record<string, unknown> = {}, usage?: GenerateContentResponseUsageMetadata) => {
    const { error } = await team.rpc('log_step', {
      p_session_id: session.id, p_agent_key: agent, p_kind: kind, p_title: title.slice(0, 200), p_detail: detail,
      p_input_tokens: usage?.promptTokenCount ?? 0, p_output_tokens: usage?.candidatesTokenCount ?? 0,
      p_thinking_tokens: usage?.thoughtsTokenCount ?? 0,
    })
    if (error) console.warn('[pipeline] log_step failed:', error.message)
  }

  const handoff = async (reason: string, guestText: string, room?: { room_id: string | null }) => {
    await step('mia', 'GUARDRAIL', 'Handing the conversation to the front desk', { reason })
    must(await db.schema('ops').rpc('create_task', {
      p_conversation_id: x.conversation_id, p_session_id: session.id, p_category: 'front_desk',
      p_title: 'Guest needs a personal reply', p_detail: `Guest wrote: "${guestText.slice(0, 300)}" — ${reason}`,
      p_room_id: room?.room_id ?? null, p_priority: 'URGENT', p_due_in: '10 minutes',
    }), 'create handoff task')
    const res = must(await cc.rpc('dispatch_ai_reply', {
      p_session_id: session.id,
      p_body: 'Thank you — I have passed your message to our front desk team, and a colleague will reply to you personally in a few minutes.',
      p_evidence: [],
    }), 'dispatch handoff') as { sent: boolean }
    await team.from('sessions').update({ state: 'HANDED_TO_HUMAN' }).eq('id', session.id)
    if (!res.sent) await step('mia', 'GUARDRAIL', 'Staff owns the conversation: handoff stored as a private draft')
  }

  const typing = keepTyping(x.chat_id)
  try {
    const history = must(await cc.from('messages').select('author_kind, direction, body')
      .eq('conversation_id', x.conversation_id).neq('direction', 'internal').lte('seq', trigger.seq)
      .order('seq', { ascending: false }).limit(8), 'load history') as { author_kind: string; direction: string; body: string }[]
    const guestText = trigger.body
    await step('mia', 'THOUGHT', 'Reading the guest message', { channel: 'telegram', chars: guestText.length })

    const ctx = must(await db.schema('guest_crm').rpc('guest_context', { p_profile_id: x.profile_id }), 'guest_context') as GuestContext
    await step('mia', 'TOOL_RESULT', `CRM: ${ctx.profile.full_name}${ctx.stay ? ` · room ${ctx.stay.room_number}` : ''}${ctx.profile.loyalty_tier ? ` · ${ctx.profile.loyalty_tier}` : ''}`, {
      tool: 'guest_crm.guest_context', preferences: ctx.preferences.map((p) => `${p.label}: ${p.value}`),
      sensitive_facts: `${ctx.sensitive.length} (safety checks only, not sent to the model)`,
    })

    if (!geminiConfigured()) return await handoff('AI model not configured', guestText, ctx.stay ?? undefined)

    // 1 · Mia classifies (structured output)
    const cls = await withRetry(() => gemini().models.generateContent({
      model: MODEL,
      contents: guestText,
      config: {
        systemInstruction: CLASSIFY_PROMPT, responseMimeType: 'application/json', responseSchema: INTENT_SCHEMA,
        thinkingConfig: { thinkingLevel: THINKING.low },
      },
    }))
    let intents: Intent[] = []
    try { intents = (JSON.parse(cls.text ?? '{}').intents ?? []) as Intent[] } catch { intents = [] }
    await step('mia', 'DECISION', `Classified ${intents.length} intent${intents.length === 1 ? '' : 's'}`, {
      model: MODEL, intents: intents.map((i) => i.kind),
    }, cls.usageMetadata)
    const actionable = intents.filter((i) => i.kind !== 'other')
    if (!actionable.length) return await handoff('no supported intent', guestText, ctx.stay ?? undefined)

    // 2 · Sommelier / Mia retrieve approved knowledge (hybrid lexical + vector, approved and valid now)
    const evidence: Evidence[] = []
    const allergensAvoided = ctx.sensitive.map((s) => s.value.toLowerCase())
    for (const intent of actionable.filter((i) => i.kind !== 'amenity')) {
      const agentKey = intent.kind.startsWith('wine') ? 'sommelier' : 'mia'
      const query = (intent.query || intent.item || guestText).slice(0, 300)
      if (agentKey === 'sommelier') await step('mia', 'HANDOFF', 'Handing off to Sommelier', { from: 'Mia', to: 'Sommelier', reason: 'cellar question' })
      const vector = await embedQuery(query)
      await step(agentKey, 'TOOL_CALL', 'Searching approved knowledge', { tool: 'kb.search_hybrid', query, mode: vector ? 'hybrid' : 'lexical' })
      const hits = must(await db.schema('kb').rpc('search_hybrid', {
        query_text: query, p_space_id: x.space_id, query_embedding: vector, match_count: 3,
      }), 'search_hybrid') as HitRow[]
      const wanted = intent.kind.startsWith('wine')
        ? hits.find((h) => h.structured?.item && (!intent.item || h.structured.item.toLowerCase().includes(intent.item.toLowerCase().split(' ')[0])))
          ?? hits.find((h) => h.structured?.item)
        : hits.find((h) => h.structured?.topic) ?? hits[0]
      if (!wanted) {
        await step(agentKey, 'GUARDRAIL', 'No approved entry matches — abstaining', { query })
        continue
      }
      const conflict = (wanted.structured.allergens ?? []).some((a) => allergensAvoided.some((s) => s.includes(a.toLowerCase()) || a.toLowerCase().includes(s)))
      const ev: Evidence = {
        chunk_id: wanted.chunk_id, document: wanted.document_title, version: wanted.document_version, approved_by: wanted.approved_by,
        structured: wanted.structured, content: wanted.content, content_sha256: wanted.content_sha256, allergen_conflict: conflict,
      }
      if (!evidence.some((e) => e.chunk_id === ev.chunk_id)) evidence.push(ev)
      await step(agentKey, 'TOOL_RESULT', wanted.structured.item
        ? `${wanted.structured.item} · ${wanted.structured.price_gel} GEL / ${wanted.structured.unit ?? 'item'}`
        : `${wanted.document_title} v${wanted.document_version}`, {
        citation: { item: wanted.structured.item ?? wanted.document_title, price_gel: wanted.structured.price_gel ?? null, unit: wanted.structured.unit ?? null,
          allergens: wanted.structured.allergens ?? [], document: wanted.document_title, document_version: wanted.document_version,
          approved_by: wanted.approved_by, chunk_id: wanted.chunk_id, content_sha256: wanted.content_sha256, quote: wanted.content },
        score: Number(wanted.score?.toFixed?.(4) ?? wanted.score),
      })
      if (wanted.structured.allergens) {
        await step(agentKey, 'GUARDRAIL', conflict ? 'Allergen conflict — staff confirmation required' : 'Allergen check passed', {
          wine_allergens: wanted.structured.allergens, guest_avoidance: `${allergensAvoided.length} sensitive item(s)`, conflict,
        })
      }
    }

    // 3 · Operations Coordinator creates tasks (never completes them)
    const tasks: string[] = []
    const roomId = ctx.stay?.room_id ?? null
    const roomNo = ctx.stay?.room_number
    for (const intent of actionable) {
      if (intent.kind === 'amenity') {
        const qty = num(intent.quantity, 1)
        const item = (intent.item || 'amenities').toLowerCase()
        await step('mia', 'HANDOFF', 'Handing off to Operations Coordinator', { from: 'Mia', to: 'Operations Coordinator', reason: 'housekeeping request' })
        const t = must(await db.schema('ops').rpc('create_task', {
          p_conversation_id: x.conversation_id, p_session_id: session.id, p_category: 'housekeeping',
          p_title: `Deliver ${qty} ${item}`, p_detail: `${qty} x ${item}${roomNo ? ` to room ${roomNo}` : ''}`,
          p_room_id: roomId, p_quantity: qty, p_due_in: '30 minutes',
        }), 'create housekeeping task') as { id: string; title: string }
        tasks.push(t.title)
        await step('coordinator', 'TOOL_RESULT', `Task queued · ${t.title}`, { tool: 'ops.create_task', task_id: t.id, sla: '30 min' })
      }
      if (intent.kind === 'wine_order') {
        const wine = evidence.find((e) => e.structured.item)
        if (!wine) continue
        await step('sommelier', 'HANDOFF', 'Handing off to Operations Coordinator', { from: 'Sommelier', to: 'Operations Coordinator', reason: 'bottle delivery' })
        const t = must(await db.schema('ops').rpc('create_task', {
          p_conversation_id: x.conversation_id, p_session_id: session.id, p_category: 'food_beverage',
          p_title: `Deliver ${wine.structured.item}`,
          p_detail: `1 x ${wine.structured.unit ?? 'bottle'} (${wine.structured.price_gel} GEL)${roomNo ? ` to room ${roomNo}` : ''}. Front desk confirms the room charge.${wine.allergen_conflict ? ' ALLERGEN CONFLICT — check with guest.' : ''}`,
          p_room_id: roomId, p_quantity: 1, p_requires_confirmation: true, p_due_in: '45 minutes',
        }), 'create F&B task') as { id: string; title: string }
        tasks.push(t.title)
        await step('coordinator', 'TOOL_RESULT', `Task queued · ${t.title}`, { tool: 'ops.create_task', task_id: t.id, requires_staff_confirmation: true })
      }
    }

    // 4 · Mia composes from facts only; deterministic checks before the dispatch gate
    const facts = evidence.map((e) => ({
      chunk_id: e.chunk_id, source: `${e.document} v${e.version}`, text: e.content,
      ...(e.structured.item ? { item: e.structured.item, price_gel: e.structured.price_gel, unit: e.structured.unit, allergens: e.structured.allergens } : {}),
      ...(e.allergen_conflict ? { allergen_conflict: 'conflicts with a guest allergy on file — say staff will check before serving' } : {}),
    }))
    const payload = {
      guest_message: guestText,
      earlier_messages: history.reverse().slice(0, -1).map((m) => `${m.author_kind}: ${m.body}`),
      guest: { first_name: ctx.profile.full_name.split(' ')[0], loyalty_tier: ctx.profile.loyalty_tier, room: roomNo ?? null },
      preferences: ctx.preferences.map((p) => `${p.label}: ${p.value}`),
      facts,
      arranged_tasks: tasks,
      unsupported_requests: intents.filter((i) => i.kind === 'other').map((i) => i.query ?? i.item ?? 'other request'),
    }
    let reply = ''
    let cited: Evidence[] = []
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      const res = await withRetry(() => gemini().models.generateContent({
        model: MODEL,
        contents: JSON.stringify(payload) + (attempt ? '\nYour previous draft broke a rule (unlisted price or a completion claim). Fix it.' : ''),
        config: {
          systemInstruction: `${COMPOSE_PROMPT}\n${agents.get('mia')?.instructions ?? ''}`,
          responseMimeType: 'application/json', responseSchema: REPLY_SCHEMA, thinkingConfig: { thinkingLevel: thinking('mia', 'medium') },
        },
      }))
      let parsed: { reply?: string; cited_chunk_ids?: string[] } = {}
      try { parsed = JSON.parse(res.text ?? '{}') } catch { parsed = {} }
      const draft = (parsed.reply ?? '').trim()
      const draftCited = evidence.filter((e) => (parsed.cited_chunk_ids ?? []).includes(e.chunk_id))
      const citedOk = (parsed.cited_chunk_ids ?? []).every((id) => evidence.some((e) => e.chunk_id === id))
      const ok = Boolean(draft) && citedOk && pricesGrounded(draft, draftCited.length ? draftCited : evidence) && !COMPLETION_CLAIM.test(draft)
      await step('mia', ok ? 'REPLY' : 'GUARDRAIL', ok ? 'Composed grounded reply' : 'Draft rejected by grounding check', {
        chars: draft.length, cited: draftCited.length, attempt: attempt + 1,
      }, res.usageMetadata)
      if (ok) { reply = draft; cited = draftCited.length ? draftCited : evidence }
    }
    if (!reply) return await handoff('reply failed grounding checks twice', guestText, ctx.stay ?? undefined)

    await step('mia', 'GUARDRAIL', 'Dispatch gate: conversation owner and evidence validity re-checked in the database', { evidence_items: cited.length })
    const res = must(await cc.rpc('dispatch_ai_reply', {
      p_session_id: session.id, p_body: reply,
      p_evidence: cited.map((e) => ({ chunk_id: e.chunk_id, document: e.document, version: e.version, content_sha256: e.content_sha256 })),
    }), 'dispatch_ai_reply') as { sent: boolean; reason: string | null }
    if (!res.sent) await step('mia', 'GUARDRAIL', `Reply stored as a private draft (${res.reason})`)
  } catch (e) {
    await team.rpc('fail_session', { p_session_id: session.id, p_error: e instanceof Error ? e.message : String(e) })
    throw e
  } finally {
    typing.stop()
  }
}

/** Everything that happens after a Telegram update (or a simulated one) was ingested and its ledger row claimed. */
export async function handleIngested(x: IngestResult): Promise<void> {
  if (x.command === 'start' || x.command === 'start_bound') {
    const conv = must(await admin().schema('contact_center').from('conversations').select('state').eq('id', x.conversation_id).single(), 'load conversation') as { state: string }
    if (conv.state === 'AI_ACTIVE') await sendWelcome(x)
  } else if (x.needs_ai) {
    await runPipeline(x)
  }
  await flushOutbound({ conversationId: x.conversation_id })
}

/** Rebuilds the ingest result for a ledger row re-claimed by the cron sweeper. */
export async function resultFromLedger(row: { id: number; message_id: string | null; payload: { message?: { text?: string }; business_message?: { text?: string } } }): Promise<IngestResult | null> {
  if (!row.message_id) return null
  const db = admin()
  const msg = must(await db.schema('contact_center').from('messages').select('conversation_id, space_id').eq('id', row.message_id).single(), 'load ledger message') as { conversation_id: string; space_id: string }
  const conv = must(await db.schema('contact_center').from('conversations').select('external_chat_id, profile_id, state').eq('id', msg.conversation_id).single(), 'load ledger conversation') as { external_chat_id: string; profile_id: string; state: string }
  const text = row.payload.message?.text ?? row.payload.business_message?.text ?? ''
  const command = /^\/start(\s|$)/.test(text) ? 'start' as const : null
  return {
    duplicate: false, ledger_id: row.id, space_id: msg.space_id, conversation_id: msg.conversation_id, message_id: row.message_id,
    chat_id: conv.external_chat_id, profile_id: conv.profile_id, command, needs_ai: conv.state === 'AI_ACTIVE' && !command,
  }
}

/** Claim → handle → finish, shared by the webhook's after(), the console's simulator and the cron sweeper. */
export async function processLedgerItem(x: IngestResult, alreadyClaimed = false): Promise<'done' | 'skipped' | 'failed'> {
  const cc = admin().schema('contact_center')
  if (!alreadyClaimed) {
    const claimed = must(await cc.rpc('claim_update', { p_ledger_id: x.ledger_id }), 'claim_update') as boolean
    if (!claimed) return 'skipped'
  }
  try {
    await handleIngested(x)
    must(await cc.rpc('finish_update', { p_ledger_id: x.ledger_id, p_ok: true }), 'finish_update')
    return 'done'
  } catch (e) {
    console.error('[pipeline] update', x.ledger_id, 'failed:', e instanceof Error ? e.message : e)
    await cc.rpc('finish_update', { p_ledger_id: x.ledger_id, p_ok: false, p_error: e instanceof Error ? e.message.slice(0, 500) : 'failed' })
    return 'failed'
  }
}
