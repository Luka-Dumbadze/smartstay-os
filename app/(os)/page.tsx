import OsShell from '@/components/os/OsShell'
import SignIn from '@/components/os/SignIn'
import type { Staff } from '@/components/os/ui'
import { supabaseConfigured } from '@/lib/supabase/client'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Entry point of the Web OS. Resolves the signed-in Supabase Auth user to a platform.staff membership (RLS-filtered),
 * then hands over to the client shell, which loads the property snapshot and subscribes to Realtime.
 */
export default async function OsPage() {
  if (!supabaseConfigured()) {
    return <SignIn mode="unconfigured" />
  }
  const supabase = await supabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return <SignIn mode="signin" />

  const { data: memberships, error } = await supabase
    .schema('platform').from('staff')
    .select('id, space_id, display_name, role, user_id, enabled')
    .eq('user_id', auth.user.id).eq('enabled', true)
  if (error) return <SignIn mode="error" email={auth.user.email ?? undefined} detail={error.message} />
  const staff = (memberships ?? []) as Staff[]
  if (!staff.length) return <SignIn mode="unlinked" email={auth.user.email ?? undefined} userId={auth.user.id} />

  const preferred = process.env.NEXT_PUBLIC_DEFAULT_SPACE_ID
  const me = staff.find((s) => s.space_id === preferred) ?? staff[0]
  return <OsShell me={me} email={auth.user.email ?? ''} />
}
