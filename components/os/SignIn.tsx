'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, KeyRound, LogOut } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button, Card, Input } from './primitives'

type Props = {
  mode: 'signin' | 'unlinked' | 'unconfigured' | 'error'
  email?: string
  userId?: string
  detail?: string
}

/** Staff sign-in (Supabase Auth, email + password) and the states around it. */
export default function SignIn({ mode, email: knownEmail, userId, detail }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signUp, setSignUp] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    const supabase = supabaseBrowser()
    const res = signUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    if (signUp && !res.data.session) { setInfo('Account created. Confirm the email, then sign in.'); return }
    router.refresh()
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut()
    router.refresh()
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-app-bg px-4 py-8">
      <Card className="w-full max-w-sm p-5">
        <div className="flex items-center gap-3 border-b border-border-muted pb-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-control border border-border bg-accent-subtle text-accent">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-tight text-foreground">Smartstay</div>
            <div className="text-[11px] text-foreground-muted">AI-Native Hotel Operating System</div>
          </div>
        </div>

        {mode === 'unconfigured' && (
          <p className="mt-4 text-[12px] leading-5 text-foreground-secondary">
            Supabase is not configured. Set <code className="font-mono text-[11px] text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-[11px] text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then reload.
          </p>
        )}

        {mode === 'error' && (
          <div role="alert" className="mt-4 flex gap-2 rounded-control border border-destructive/30 bg-destructive/10 p-2.5 text-[11.5px] leading-5 text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div>
              Signed in as {knownEmail}, but the workspace could not be loaded: {detail}. Check that the SQL schema is installed and the
              Smartstay schemas are listed under Data API → Exposed schemas.
            </div>
          </div>
        )}

        {mode === 'unlinked' && (
          <div className="mt-4 space-y-3 text-[12px] leading-5 text-foreground-secondary">
            <p>Signed in as <span className="text-foreground">{knownEmail}</span>, but this account is not linked to a staff profile yet.</p>
            <p>A general manager links it in the Supabase SQL editor:</p>
            <pre className="overflow-x-auto rounded-control border border-border-muted bg-control p-3 font-mono text-[10.5px] leading-5 text-foreground-secondary">
              {'update platform.staff' + '\n' + '   set user_id = ' + "'" + userId + "'" + '\n' + " where display_name = 'Levan Beridze';"}
            </pre>
            <Button onClick={signOut} variant="secondary" className="w-full">
              <LogOut aria-hidden="true" className="size-3.5" />
              Sign out
            </Button>
          </div>
        )}

        {(mode === 'signin' || mode === 'error') && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="smartstay-email" className="block text-[11px] font-medium text-foreground-secondary">Work email</label>
              <Input
                id="smartstay-email"
                type="email"
                autoComplete="email"
                placeholder="name@hotel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="smartstay-password" className="block text-[11px] font-medium text-foreground-secondary">Password</label>
              <Input
                id="smartstay-password"
                type="password"
                autoComplete={signUp ? 'new-password' : 'current-password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <div role="alert" className="flex items-center gap-1.5 text-[11px] text-destructive"><AlertCircle aria-hidden="true" className="size-3.5" /> {error}</div>}
            {info && <div role="status" className="text-[11px] text-success">{info}</div>}
            <Button type="submit" variant="primary" loading={busy} disabled={busy} className="w-full">
              {!busy && <KeyRound aria-hidden="true" className="size-3.5" />}
              {signUp ? 'Create staff account' : 'Sign in'}
            </Button>
            <Button type="button" variant="subtle" onClick={() => setSignUp((value) => !value)} className="w-full text-foreground-muted">
              {signUp ? 'Have an account? Sign in' : 'New staff member? Create an account'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
