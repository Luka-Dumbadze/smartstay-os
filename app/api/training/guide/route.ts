import { Type } from '@google/genai'
import { httpStatusFor, supabaseServer } from '@/lib/supabase/server'
import { admin } from '@/lib/supabase/admin'
import { embedQuery } from '@/lib/ai/embed'
import { gemini, geminiConfigured, MODEL, withRetry } from '@/lib/ai/gemini'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchHit = {
  chunk_id: string; document_id: string; document_title: string; document_version: number; content: string; score: number
}
type Source = { chunk_id: string; ordinal: number; quote: string }

const ANSWER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sufficient: { type: Type.BOOLEAN },
    answer: { type: Type.STRING, description: 'A concise answer in Georgian, or an empty string when unsupported.' },
    source_chunk_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['sufficient', 'answer', 'source_chunk_ids'],
}

async function logEvent(input: { taskId: string; spaceId: string; staffId: string; sopId: string; sopVersion: number; type: string; evidenceCount: number }) {
  try {
    const { error } = await admin().schema('ops').from('training_events').insert({
      space_id: input.spaceId, task_id: input.taskId, target_staff_id: input.staffId, actor_staff_id: input.staffId,
      sop_document_id: input.sopId, sop_version: input.sopVersion, event_type: input.type,
      details: { evidence_count: input.evidenceCount },
    })
    if (error) console.warn('[training-guide] activity event was not saved:', error.code)
  } catch (error) {
    console.warn('[training-guide] activity event was not saved:', error instanceof Error ? error.message : 'unknown error')
  }
}

export async function POST(req: Request) {
  let body: { task_id?: string; question?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const taskId = body.task_id?.trim()
  const question = body.question?.trim()
  if (!taskId || !question) return Response.json({ error: 'task_id and question are required' }, { status: 400 })
  if (question.length > 500) return Response.json({ error: 'question must be 500 characters or fewer' }, { status: 400 })

  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return Response.json({ error: 'sign in required' }, { status: 401 })

  const { data: task, error: taskError } = await supabase.schema('ops').from('tasks')
    .select('id,space_id,category,required_sop_document_id,required_sop_version')
    .eq('id', taskId).maybeSingle()
  if (taskError) return Response.json({ error: taskError.message }, { status: httpStatusFor(taskError) })
  if (!task) return Response.json({ error: 'task not found in your property' }, { status: 404 })
  if (task.category !== 'housekeeping' || !task.required_sop_document_id || !task.required_sop_version) {
    return Response.json({ error: 'this task has no housekeeping SOP assigned' }, { status: 409 })
  }
  const { data: staff, error: staffError } = await supabase.schema('platform').from('staff').select('id')
    .eq('space_id', task.space_id).eq('user_id', auth.user.id).eq('enabled', true).maybeSingle()
  if (staffError) return Response.json({ error: staffError.message }, { status: httpStatusFor(staffError) })
  if (!staff) return Response.json({ error: 'enabled staff membership is required' }, { status: 403 })

  const { data: document, error: documentError } = await supabase.schema('kb').from('documents')
    .select('id,title,version,kind,state')
    .eq('space_id', task.space_id).eq('id', task.required_sop_document_id).maybeSingle()
  if (documentError) return Response.json({ error: documentError.message }, { status: httpStatusFor(documentError) })
  if (!document || document.kind !== 'SOP' || document.version !== task.required_sop_version || document.state !== 'APPROVED_ACTIVE') {
    return Response.json({
      error: 'The task SOP is no longer the current approved version. Open Knowledge and ask a supervisor before proceeding.',
      outdated: true,
    }, { status: 409 })
  }

  const eventBase = {
    taskId, spaceId: task.space_id, staffId: staff.id, sopId: document.id, sopVersion: document.version,
  }
  await logEvent({ ...eventBase, type: 'QUESTION_ASKED', evidenceCount: 0 })
  const embedding = await embedQuery(question)
  const { data: found, error: searchError } = await supabase.schema('kb').rpc('search_hybrid', {
    query_text: question.slice(0, 500),
    p_space_id: task.space_id,
    query_embedding: embedding,
    match_count: 30,
  })
  if (searchError) {
    await logEvent({ ...eventBase, type: 'AI_ABSTAINED', evidenceCount: 0 })
    return Response.json({
      answer: null, abstained: true, reason: 'search_unavailable',
      source: { title: document.title, version: document.version }, sources: [],
      fallback: 'Use the approved SOP and ask your supervisor. No answer was generated.',
    })
  }

  const hits = ((found ?? []) as SearchHit[])
    .filter((hit) => hit.document_id === document.id && hit.document_version === document.version)
    .slice(0, 5)
  const sourceIds = hits.map((hit) => hit.chunk_id)
  const { data: chunks, error: chunksError } = sourceIds.length
    ? await supabase.schema('kb').from('chunks').select('id,ordinal,content').eq('space_id', task.space_id).in('id', sourceIds)
    : { data: [], error: null }
  const chunkMap = new Map((chunks ?? []).map((chunk) => [chunk.id as string, chunk]))
  const sources: Source[] = hits.flatMap((hit) => {
    const chunk = chunkMap.get(hit.chunk_id)
    return chunk ? [{ chunk_id: hit.chunk_id, ordinal: chunk.ordinal as number, quote: String(chunk.content).slice(0, 900) }] : []
  })

  if (chunksError || !hits.length || !sources.length) {
    await logEvent({ ...eventBase, type: 'AI_ABSTAINED', evidenceCount: 0 })
    return Response.json({
      answer: null, abstained: true, reason: 'no_matching_evidence',
      source: { title: document.title, version: document.version }, sources: [],
      fallback: 'The approved SOP is available, but it does not contain evidence for this question. Ask your supervisor.',
    })
  }

  if (!geminiConfigured()) {
    await logEvent({ ...eventBase, type: 'AI_UNAVAILABLE', evidenceCount: sources.length })
    return Response.json({
      answer: null, abstained: true, reason: 'ai_unavailable',
      source: { title: document.title, version: document.version }, sources,
      fallback: 'AI is unavailable. Read the cited approved SOP section and ask your supervisor; no instructions were generated.',
    })
  }

  const context = sources.map((source) => ({
    chunk_id: source.chunk_id, section: source.ordinal, approved_sop_excerpt: source.quote,
  }))
  try {
    const response = await withRetry(() => gemini().models.generateContent({
      model: MODEL,
      contents: JSON.stringify({ staff_question: question, approved_sop_evidence: context }),
      config: {
        systemInstruction: "You are SmartStay's housekeeping SOP guide. The employee asked in Georgian. Answer in concise Georgian only.\nUse only the supplied excerpts from the one current approved SOP version. Do not add general housekeeping advice, assumptions, or facts.\nIf the excerpts do not directly answer the question, return sufficient=false, answer empty, source_chunk_ids empty.\nOtherwise return a short practical explanation and source_chunk_ids containing only identifiers of excerpts that directly support it.\nNever decide competency, task eligibility, room state, or room release. A supervisor makes those decisions.",
        responseMimeType: 'application/json',
        responseSchema: ANSWER_SCHEMA,
      },
    }))
    const parsed = JSON.parse(response.text ?? '{}') as { sufficient?: boolean; answer?: string; source_chunk_ids?: string[] }
    const allowed = new Set(sources.map((source) => source.chunk_id))
    const cited = (parsed.source_chunk_ids ?? []).filter((id) => allowed.has(id))
    const answer = parsed.answer?.trim() ?? ''
    if (!parsed.sufficient || !answer || !cited.length || (parsed.source_chunk_ids ?? []).some((id) => !allowed.has(id))) {
      await logEvent({ ...eventBase, type: 'AI_ABSTAINED', evidenceCount: sources.length })
      return Response.json({
        answer: null, abstained: true, reason: 'insufficient_evidence',
        source: { title: document.title, version: document.version }, sources,
        fallback: 'The approved SOP does not provide enough evidence to answer safely. Ask your supervisor.',
      })
    }
    const citedSources = sources.filter((source) => cited.includes(source.chunk_id))
    await logEvent({ ...eventBase, type: 'AI_ANSWERED', evidenceCount: citedSources.length })
    return Response.json({
      answer, abstained: false, source: { title: document.title, version: document.version }, sources: citedSources,
    })
  } catch (error) {
    console.warn('[training-guide] model unavailable; returning approved-source fallback:', error instanceof Error ? error.message : 'unknown error')
    await logEvent({ ...eventBase, type: 'AI_UNAVAILABLE', evidenceCount: sources.length })
    return Response.json({
      answer: null, abstained: true, reason: 'ai_unavailable',
      source: { title: document.title, version: document.version }, sources,
      fallback: 'AI is unavailable. Read the cited approved SOP section and ask your supervisor; no instructions were generated.',
    })
  }
}
