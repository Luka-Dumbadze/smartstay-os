import { after } from 'next/server'
import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'
import { flushOutbound } from '@/lib/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIONS = new Set(['ClaimTask', 'StartTask', 'AttestCompleted', 'ReleaseTask', 'CancelTask'])

/** One-click staff task actions → ops.task_action() as the signed-in staff user (assignee + role checks in SQL). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let body: { action?: string; expected_version?: number }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.action || !ACTIONS.has(body.action)) return Response.json({ error: 'unknown action' }, { status: 400 })

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })

  const { data, error } = await supabase.schema('ops').rpc('task_action', {
    p_task_id: id,
    p_action: body.action,
    p_expected_version: typeof body.expected_version === 'number' ? body.expected_version : null,
  })
  if (error) return Response.json({ error: error.message, code: error.code }, { status: httpStatusFor(error) })

  const result = data as { task: { conversation_id: string | null }; notice_message_id: string | null }
  if (result.notice_message_id && result.task.conversation_id) {
    const conversationId = result.task.conversation_id
    after(async () => { await flushOutbound({ conversationId }) })   // "Done: …" notice to the guest
  }
  return Response.json(result)
}
