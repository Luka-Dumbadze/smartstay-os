import { after } from 'next/server'
import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'
import { flushOutbound } from '@/lib/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIONS = new Set(['StartCleaning', 'MarkClean', 'MarkDirty'])

/** Room turnover transitions → ops.room_action() as the signed-in staff user (MarkClean needs a supervisor). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let body: { action?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.action || !ACTIONS.has(body.action)) return Response.json({ error: 'unknown action' }, { status: 400 })

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })

  const { data, error } = await supabase.schema('ops').rpc('room_action', { p_room_id: id, p_action: body.action })
  if (error) return Response.json({ error: error.message, code: error.code }, { status: httpStatusFor(error) })

  const result = data as { room: unknown; notice_message_id: string | null }
  if (result.notice_message_id) after(async () => { await flushOutbound() })   // "room ready" notice to arriving guests
  return Response.json(result)
}
