import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIONS = new Set(['SUPERVISED', 'PRACTICALLY_APPROVED', 'REJECT'])

export async function POST(req: Request) {
  let body: { task_id?: string; staff_id?: string; action?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.task_id || !body.staff_id || !body.action || !ACTIONS.has(body.action)) {
    return Response.json({ error: 'task_id, staff_id, and a valid action are required' }, { status: 400 })
  }
  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })
  const { data, error } = await supabase.schema('ops').rpc('review_sop_competency', {
    p_task_id: body.task_id, p_staff_id: body.staff_id, p_action: body.action,
  })
  if (error) return Response.json({ error: error.message, code: error.code }, { status: httpStatusFor(error) })
  return Response.json(data)
}

