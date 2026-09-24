import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Project URL without a trailing `/rest/v1` — supabase-js appends the service paths itself, so a URL copied from the
 * Data API settings page (`https://<ref>.supabase.co/rest/v1/`) would otherwise produce `/rest/v1/rest/v1/...`.
 */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey())
}

let browserClient: SupabaseClient | null = null

/** Browser client (anon key + the signed-in staff session from cookies). All reads are filtered by RLS. */
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) browserClient = createBrowserClient(supabaseUrl(), supabaseAnonKey())
  return browserClient
}
