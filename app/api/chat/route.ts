import { after } from 'next/server'
import { randomInt } from 'node:crypto'
import { admin, must } from '@/lib/supabase/admin'
import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'
import { processLedgerItem } from '@/lib/ai/pipeline'
import { flushOutbound, type IngestResult } from '@/lib/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Body =
  | { action: 'takeover' | 'release'; conversation_id: string }
  | { action: 'reply'; conversation_id: string; text: string }
  | { action: 'simulate'; text: string; profile_id?: string }

const fail = (message: string, status: number) => Response.json({ error: message }, { status })

/**
 * Staff Contact Center actions. takeover / release / reply run as the signed-in staff user (RPCs check membership and
 * conversation ownership); the resulting outbound message is sent to Telegram server-side. `simulate` injects a
 * synthetic guest message through the same ingest → pipeline path as a real Telegram update (no Telegram delivery).
 */
export async function POST(req: Request) {
  let body: Body
  try { body = (await req.json()) as Body } catch { return fail('invalid json', 400) }

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('sign in required', 401)
  const cc = supabase.schema('contact_center')

  if (body.action === 'takeover' || body.action === 'release') {
    const { data, error } = await cc.rpc('set_control', { p_conversation_id: body.conversation_id, p_mode: body.action === 'takeover' ? 'operator' : 'ai' })
    if (error) return fail(error.message, httpStatusFor(error))
    return Response.json({ conversation: data })
  }

  if (body.action === 'reply') {
    const text = body.text?.trim()
    if (!text) return fail('text required', 400)
    const { data, error } = await cc.rpc('operator_reply', { p_conversation_id: body.conversation_id, p_body: text.slice(0, 4096) })
    if (error) return fail(error.message, httpStatusFor(error))
    const delivery = await flushOutbound({ conversationId: body.conversation_id })
    return Response.json({ message: data, delivery })
  }

  if (body.action === 'simulate') {
    const text = body.text?.trim()
    if (!text) return fail('text required', 400)
    // Staff check as the user (RLS): only staff of a property may simulate for it.
    const { data: me, error: meErr } = await supabase.schema('platform').from('staff').select('space_id, display_name').eq('user_id', auth.user.id).eq('enabled', true).limit(1)
    if (meErr || !me?.length) return fail('not a staff member', 403)
    const spaceId = me[0].space_id as string
    const db = admin()

    const channel = must(await db.schema('contact_center').from('channels').select('id').eq('space_id', spaceId).eq('kind', 'telegram').limit(1), 'load channel') as { id: string }[]
    if (!channel.length) return fail('no telegram channel for this property', 400)

    // Simulated guest: the requested profile, else the guest with the earliest active stay.
    let profileId = body.profile_id
    if (!profileId) {
      const stays = must(await db.schema('guest_crm').from('stays').select('profile_id').eq('space_id', spaceId).in('status', ['BOOKED', 'IN_HOUSE']).order('arrival_date').limit(1), 'load stays') as { profile_id: string }[]
      profileId = stays[0]?.profile_id
    }
    if (!profileId) return fail('no guest to simulate', 400)
    const profile = must(await db.schema('guest_crm').from('profiles').select('id, full_name, space_id, locale').eq('id', profileId).single(), 'load profile') as { id: string; full_name: string; space_id: string; locale: string }
    if (profile.space_id !== spaceId) return fail('guest belongs to another property', 403)

    const simId = `sim-${profile.id.slice(-12)}`
    must(await db.schema('guest_crm').from('identities').upsert(
      { space_id: spaceId, profile_id: profile.id, channel: 'telegram', external_id: simId, username: 'simulator', verified_at: new Date().toISOString() },
      { onConflict: 'space_id,channel,external_id', ignoreDuplicates: true },
    ), 'link simulator identity')

    const [first, ...rest] = profile.full_name.split(' ')
    const update = {
      update_id: Date.now() * 1000 + randomInt(1000),
      message: {
        message_id: randomInt(1, 2 ** 31 - 1),
        date: Math.floor(Date.now() / 1000),
        chat: { id: simId, type: 'private', first_name: first },
        from: { id: simId, is_bot: false, first_name: first, last_name: rest.join(' ') || undefined, language_code: profile.locale },
        text: text.slice(0, 4096),
      },
    }
    const result = must(await db.schema('contact_center').rpc('ingest_telegram_update', { p_channel_id: channel[0].id, p_update: update }), 'ingest simulated update') as IngestResult
    if (!result.duplicate && !result.ignored) after(async () => { await processLedgerItem(result) })
    return Response.json({ ok: true, conversation_id: result.conversation_id, message_id: result.message_id, needs_ai: result.needs_ai })
  }

  return fail('unknown action', 400)
}
