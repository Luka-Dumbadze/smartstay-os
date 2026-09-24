import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from './client'

/**
 * Request-scoped server client that acts as the signed-in staff user (JWT from the auth cookies).
 * Use it for every staff-initiated mutation so `platform.require_staff()`, role checks and RLS apply.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component render: cookies are read-only there. Token refresh is then
          // persisted by the browser client or by the next Route Handler call.
        }
      },
    },
  })
}

/** Maps PostgREST / Postgres error codes raised by the RPC layer to HTTP status codes. */
export function httpStatusFor(error: { code?: string; message?: string } | null): number {
  if (!error) return 200
  switch (error.code) {
    case '42501': return 403            // insufficient_privilege: not staff of this property / role not allowed
    case '40001': return 409            // stale expected_version
    case 'PGRST301': case 'PGRST302': return 401
    case '23P01': case '23505': return 409
    default: return 400
  }
}
