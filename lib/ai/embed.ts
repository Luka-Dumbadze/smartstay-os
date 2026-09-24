import 'server-only'
import { gemini, geminiConfigured, withRetry } from './gemini'

/** Must match kb.chunks.embedding extensions.vector(768) in db/supabase_master_schema.sql. */
export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIMENSIONS = 768

async function embed(text: string, taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT', title?: string): Promise<number[]> {
  const res = await withRetry(() =>
    gemini().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType, ...(title ? { title } : {}) },
    }),
  )
  const values = res.embeddings?.[0]?.values
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`embedding returned ${values?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}`)
  }
  // Cosine distance (<=>) is scale-invariant, so truncated MRL vectors need no re-normalisation for ranking.
  return values
}

/**
 * Query embedding for kb.search_hybrid / kb.match_documents. Returns null when Gemini is not configured or fails,
 * in which case callers fall back to the lexical leg of kb.search_hybrid (it works without embeddings).
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!geminiConfigured() || !text.trim()) return null
  try {
    return await embed(text.slice(0, 8_000), 'RETRIEVAL_QUERY')
  } catch (e) {
    console.warn('[embed] query embedding failed, using lexical search only:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Document embedding for kb.chunks backfill (throws on failure so the caller can retry that chunk). */
export async function embedDocument(text: string, title?: string): Promise<number[]> {
  return embed(text.slice(0, 8_000), 'RETRIEVAL_DOCUMENT', title)
}

/**
 * Fills kb.chunks.embedding for chunks that have none (seed data, newly approved documents). Run by the cron sweeper,
 * a few chunks per run, so vector ranking joins the lexical leg of kb.search_hybrid without a manual backfill step.
 */
export async function backfillEmbeddings(limit = 20): Promise<{ embedded: number; failed: number }> {
  if (!geminiConfigured()) return { embedded: 0, failed: 0 }
  const { admin } = await import('@/lib/supabase/admin')
  const kb = admin().schema('kb')
  const { data, error } = await kb.from('chunks').select('id, content, document_id').is('embedding', null).limit(limit)
  if (error || !data?.length) return { embedded: 0, failed: 0 }
  const titles = new Map<string, string>()
  const { data: docs } = await kb.from('documents').select('id, title').in('id', [...new Set(data.map((c) => c.document_id as string))])
  for (const d of docs ?? []) titles.set(d.id as string, d.title as string)
  let embedded = 0
  let failed = 0
  for (const c of data) {
    try {
      const values = await embedDocument(c.content as string, titles.get(c.document_id as string))
      const { error: upErr } = await kb.from('chunks')
        .update({ embedding: values, embedding_model: `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`, embedded_at: new Date().toISOString() })
        .eq('id', c.id as string)
      if (upErr) throw new Error(upErr.message)
      embedded++
    } catch (e) {
      failed++
      console.warn('[embed] backfill failed for chunk', c.id, e instanceof Error ? e.message : e)
    }
  }
  return { embedded, failed }
}
