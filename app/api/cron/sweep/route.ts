import { timingSafeEqual } from 'node:crypto'
import { admin, must } from '@/lib/supabase/admin'
import { processLedgerItem, resultFromLedger } from '@/lib/ai/pipeline'
import { flushOutbound } from '@/lib/telegram'
import { backfillEmbeddings } from '@/lib/ai/embed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

type LedgerRow = {
  id: number
  status: string
  attempts: number
  message_id: string | null
  payload: { message?: { text?: string }; business_message?: { text?: string } }
}

/**
 * Vercel Cron (vercel.json, every minute): re-claims ledger rows whose lease expired or that failed and went back to
 * RECEIVED, re-runs them through the same idempotent path, retries PENDING outbound messages older than 20 s, and embeds
 * knowledge chunks that have no vector yet (gemini-embedding-001, 768 dims).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response('unauthorized', { status: 401 })
  const started = Date.now()
  const cc = admin().schema('contact_center')

  const rows = must(await cc.rpc('claim_updates', { p_limit: 5 }), 'claim_updates') as LedgerRow[]
  const outcome: Record<string, number> = { done: 0, skipped: 0, failed: 0, exhausted: 0, unresolvable: 0 }
  for (const row of rows) {
    if (row.status === 'FAILED') { outcome.exhausted++; continue }            // max attempts reached: left for staff review
    const result = await resultFromLedger(row)
    if (!result) {
      await cc.rpc('finish_update', { p_ledger_id: row.id, p_ok: true, p_error: 'no message to process' })
      outcome.unresolvable++
      continue
    }
    outcome[await processLedgerItem(result, true)]++
    if (Date.now() - started > 240_000) break
  }

  const delivery = await flushOutbound({ olderThanSeconds: 20 })
  const embeddings = Date.now() - started < 200_000 ? await backfillEmbeddings(20) : { embedded: 0, failed: 0 }
  return Response.json({ ok: true, reclaimed: rows.length, ...outcome, delivery, embeddings, ms: Date.now() - started })
}
