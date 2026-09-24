import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl } from './client'

let adminClient: SupabaseClient | null = null

/**
 * Service-role client (BYPASSRLS). Server-only: used by the Telegram webhook, the cron sweeper and the AI pipeline.
 * Never import this module from a client component — `server-only` turns that into a build error.
 */
export function admin(): SupabaseClient {
  if (!adminClient) {
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
    if (!supabaseUrl() || !key) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    adminClient = createClient(supabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }
  return adminClient
}

/** Throws the PostgREST error (with its code) so callers can map it; returns data otherwise. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    const err = new Error(`${what}: ${res.error.message}`) as Error & { code?: string }
    err.code = res.error.code
    throw err
  }
  return res.data as T
}
