import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/ai/embed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Storage/RAG search for staff: embeds the query with gemini-embedding-001 (768 dims) and runs kb.search_hybrid as the
 * signed-in user (RLS: only their property's approved, currently valid knowledge). Falls back to lexical ranking when
 * no embedding is available.
 */
export async function POST(req: Request) {
  let body: { query?: string; space_id?: string; limit?: number }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const query = body.query?.trim()
  if (!query || !body.space_id) return Response.json({ error: 'query and space_id required' }, { status: 400 })

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })

  const embedding = await embedQuery(query)
  const { data, error } = await supabase.schema('kb').rpc('search_hybrid', {
    query_text: query.slice(0, 500),
    p_space_id: body.space_id,
    query_embedding: embedding,
    match_count: Math.min(Math.max(body.limit ?? 6, 1), 20),
  })
  if (error) return Response.json({ error: error.message }, { status: httpStatusFor(error) })
  return Response.json({ mode: embedding ? 'hybrid' : 'lexical', results: data ?? [] })
}
