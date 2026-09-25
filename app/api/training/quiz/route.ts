import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get('task_id')
  if (!taskId) return Response.json({ error: 'task_id is required' }, { status: 400 })
  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })
  const { data, error } = await supabase.schema('ops').rpc('get_sop_quiz', { p_task_id: taskId })
  if (error) return Response.json({ error: error.message, code: error.code }, { status: httpStatusFor(error) })
  return Response.json(data)
}

export async function POST(req: Request) {
  let body: { task_id?: string; answers?: Record<string, string> }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.task_id || !body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
    return Response.json({ error: 'task_id and answer selections are required' }, { status: 400 })
  }
  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })
  const { data, error } = await supabase.schema('ops').rpc('submit_sop_quiz', {
    p_task_id: body.task_id, p_answers: body.answers,
  })
  if (error) return Response.json({ error: error.message, code: error.code }, { status: httpStatusFor(error) })
  return Response.json(data)
}

