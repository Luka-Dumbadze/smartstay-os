import { after } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { admin } from '@/lib/supabase/admin'
import { processLedgerItem } from '@/lib/ai/pipeline'
import type { IngestResult } from '@/lib/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60   // budget for the after() pipeline; the response itself returns after one DB round trip

function secretOk(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!expected) return false
  const got = Buffer.from(req.headers.get('x-telegram-bot-api-secret-token') ?? '')
  const want = Buffer.from(expected)
  return got.length === want.length && timingSafeEqual(got, want)
}

async function channelId(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_CHANNEL_ID?.trim()
  if (fromEnv) return fromEnv
  const { data } = await admin().schema('contact_center').from('channels').select('id').eq('kind', 'telegram').eq('enabled', true).limit(1)
  return data?.[0]?.id ?? null
}

/**
 * Telegram Bot API webhook. Verify the secret header, ingest the update idempotently (dedupe on update_id), answer 200
 * at once, then run the AI pipeline in after(). If the instance dies mid-pipeline, the lease on the ledger row expires
 * and /api/cron/sweep re-runs it (research/nextjs_supabase_telegram_blueprint.md §3.2).
 */
export async function POST(req: Request) {
  if (!secretOk(req)) return new Response('unauthorized', { status: 401 })

  let update: unknown
  try {
    update = await req.json()
  } catch {
    return Response.json({ ok: true, ignored: 'invalid json' })   // 2xx: a malformed body will never succeed on retry
  }

  const channel = await channelId()
  if (!channel) return new Response('telegram channel not configured', { status: 500 })

  const { data, error } = await admin().schema('contact_center').rpc('ingest_telegram_update', {
    p_channel_id: channel,
    p_update: update,
  })
  if (error) {
    console.error('[webhook] ingest failed:', error.message)
    return new Response('ingest failed', { status: 500 })         // non-2xx → Telegram redelivers; ingest is idempotent
  }

  const result = data as IngestResult
  if (!result.duplicate && !result.ignored) {
    after(async () => {
      await processLedgerItem(result)
    })
  }
  return Response.json({ ok: true })
}
