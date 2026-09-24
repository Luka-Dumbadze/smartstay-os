import 'server-only'
import { admin, must } from '@/lib/supabase/admin'

/** Shape returned by contact_center.ingest_telegram_update() (db/supabase_master_schema.sql §8). */
export type IngestResult = {
  duplicate: boolean
  ignored?: boolean
  ledger_id: number
  space_id: string
  conversation_id: string
  message_id: string
  chat_id: string
  profile_id: string
  command: 'start' | 'start_bound' | null
  needs_ai: boolean
}

const API_BASE = (process.env.TELEGRAM_API_BASE?.trim() || 'https://api.telegram.org').replace(/\/+$/, '')

/** Conversations created by the console's "Simulate Guest Inquiry" use synthetic chat ids and are never sent to Telegram. */
export function isSimulatedChat(chatId: string): boolean {
  return chatId.startsWith('sim-')
}

export class TelegramError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) {
    super(message)
  }
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) throw new TelegramError('TELEGRAM_BOT_TOKEN is not set', 500)
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } }
  if (!res.ok || !json.ok) {
    throw new TelegramError(json.description || `Telegram ${method} failed (${res.status})`, res.status, json.parameters?.retry_after)
  }
  return json.result as T
}

/** Plain-text send (no parse_mode, so no MarkdownV2 escaping is needed). Returns Telegram's message_id. */
export async function sendMessage(chatId: string, text: string): Promise<number> {
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    link_preview_options: { is_disabled: true },
  })
  return result.message_id
}

export async function sendChatAction(chatId: string, action: 'typing' = 'typing'): Promise<void> {
  if (isSimulatedChat(chatId)) return
  await call('sendChatAction', { chat_id: chatId, action })
}

/** Telegram's typing indicator lasts ~5 s; repeat every 4 s until stopped. Errors are ignored (cosmetic). */
export function keepTyping(chatId: string): { stop: () => void } {
  if (isSimulatedChat(chatId) || !process.env.TELEGRAM_BOT_TOKEN) return { stop: () => {} }
  const tick = () => { sendChatAction(chatId).catch(() => {}) }
  tick()
  const timer = setInterval(tick, 4_000)
  return { stop: () => clearInterval(timer) }
}

type PendingRow = { id: string; conversation_id: string; body: string; seq: number; created_at: string }

/**
 * Sends every PENDING outbound message (AI replies, staff replies, guest notices) in per-conversation order and records
 * the outcome with contact_center.mark_delivery(). Safe to call concurrently: a message is marked SENT once.
 */
export async function flushOutbound(opts: { conversationId?: string; olderThanSeconds?: number } = {}): Promise<{ sent: number; failed: number }> {
  const db = admin()
  let q = db.schema('contact_center').from('messages')
    .select('id, conversation_id, body, seq, created_at')
    .eq('delivery_status', 'PENDING')
    .order('conversation_id').order('seq')
    .limit(50)
  if (opts.conversationId) q = q.eq('conversation_id', opts.conversationId)
  if (opts.olderThanSeconds) q = q.lt('created_at', new Date(Date.now() - opts.olderThanSeconds * 1000).toISOString())
  const pending = must(await q, 'load pending outbound') as PendingRow[]
  if (!pending.length) return { sent: 0, failed: 0 }

  const convIds = [...new Set(pending.map((m) => m.conversation_id))]
  const convs = must(
    await db.schema('contact_center').from('conversations').select('id, external_chat_id').in('id', convIds),
    'load conversations',
  ) as { id: string; external_chat_id: string }[]
  const chatOf = new Map(convs.map((c) => [c.id, c.external_chat_id]))

  let sent = 0
  let failed = 0
  const blocked = new Set<string>()             // stop a conversation at its first failure to preserve order
  for (const m of pending) {
    if (blocked.has(m.conversation_id)) continue
    const chatId = chatOf.get(m.conversation_id)
    if (!chatId) continue
    try {
      const externalId = isSimulatedChat(chatId) ? `simulated:${m.seq}` : String(await sendMessage(chatId, m.body))
      must(await db.schema('contact_center').rpc('mark_delivery', {
        p_message_id: m.id, p_ok: true, p_external_message_id: externalId,
      }), 'mark_delivery')
      sent++
    } catch (e) {
      failed++
      blocked.add(m.conversation_id)
      const retryable = e instanceof TelegramError && (e.status === 429 || e.status >= 500)
      if (!retryable) {                         // permanent (e.g. bot blocked by the user): record it for staff
        await db.schema('contact_center').rpc('mark_delivery', {
          p_message_id: m.id, p_ok: false, p_error: e instanceof Error ? e.message.slice(0, 500) : 'send failed',
        })
      }
      // retryable errors stay PENDING; the cron sweeper retries them
    }
  }
  return { sent, failed }
}

/**
 * Welcome after /start. Discloses that the guest is talking to an AI with a human available (EU AI Act Art. 50;
 * WhatsApp/Telegram good practice) and is stored as an outbound message, then sent by flushOutbound().
 */
export async function sendWelcome(result: IngestResult): Promise<void> {
  const db = admin()
  const profile = must(
    await db.schema('guest_crm').from('profiles').select('full_name, locale').eq('id', result.profile_id).single(),
    'load profile',
  ) as { full_name: string; locale: string }
  const space = must(
    await db.schema('platform').from('spaces').select('name').eq('id', result.space_id).single(),
    'load space',
  ) as { name: string }
  const first = profile.full_name.split(' ')[0]
  const bound = result.command === 'start_bound'
  const text = {
    en: `Gamarjoba, ${first}! ${bound ? `You're now connected to ${space.name} — your stay details are linked.` : `Welcome to ${space.name}.`} I'm Mia, an AI assistant. I can help with wine, amenities and hotel questions, and a member of our team can take over at any time.`,
    ka: `გამარჯობა, ${first}! ${bound ? `თქვენ დაუკავშირდით ${space.name}-ს — თქვენი ჯავშანი მიბმულია.` : `მოგესალმებით ${space.name}-ში.`} მე ვარ მია, ხელოვნური ინტელექტის ასისტენტი. ნებისმიერ დროს ჩვენი თანამშრომელი შეძლებს საუბრის გაგრძელებას.`,
    ru: `Гамарджоба, ${first}! ${bound ? `Вы подключены к ${space.name} — ваше бронирование привязано.` : `Добро пожаловать в ${space.name}.`} Я Миа, ИИ-ассистент. Сотрудник отеля может подключиться к разговору в любой момент.`,
  }[profile.locale === 'ka' || profile.locale === 'ru' ? profile.locale : 'en']
  must(await db.schema('contact_center').rpc('append_message', {
    p_conversation_id: result.conversation_id,
    p_direction: 'outbound',
    p_author_kind: 'ai',
    p_author_name: 'Mia · AI Concierge',
    p_body: text,
  }), 'append welcome')
}
