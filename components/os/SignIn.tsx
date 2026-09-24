'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, KeyRound, Loader2, LogOut, Sparkles } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

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
    <div className="grid h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm animate-pop p-6 shadow-glass">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#5e5ce6] to-[#bf5af2] shadow-lg">
          <Sparkles className="size-6 text-white" />
        </div>
        <div className="mt-4 text-center text-[17px] font-semibold tracking-tight">Smartstay OS</div>

        {mode === 'unconfigured' && (
          <p className="mt-2 text-center text-[13px] text-fg-2">
            Supabase is not configured. Set <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then reload.
          </p>
        )}

        {mode === 'error' && (
          <div className="mt-3 flex gap-2 rounded-xl bg-rose-500/10 p-3 text-[12.5px] text-rose-200 ring-1 ring-rose-500/25">
            <AlertCircle className="mt-px size-4 shrink-0" />
            <div>
              Signed in as {knownEmail}, but the workspace could not be loaded: {detail}. Check that the SQL schema is installed and the
              Smartstay schemas are listed under Data API → Exposed schemas.
            </div>
          </div>
        )}

        {mode === 'unlinked' && (
          <div className="mt-3 space-y-3 text-[12.5px] text-fg-2">
            <p>Signed in as <span className="text-fg">{knownEmail}</span>, but this account is not linked to a staff profile yet.</p>
            <p>A general manager links it in the Supabase SQL editor:</p>
            <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] text-fg-2 ring-1 ring-line">
{`update platform.staff
   set user_id = '${userId}'
 where display_name = 'Levan Beridze';`}
            </pre>
            <button onClick={signOut} className="btn btn-soft w-full"><LogOut className="size-3.5" /> Sign out</button>
          </div>
        )}

        {(mode === 'signin' || mode === 'error') && (
          <form onSubmit={submit} className="mt-5 space-y-2.5">
            <input className="input" type="email" autoComplete="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="input" type="password" autoComplete={signUp ? 'new-password' : 'current-password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <div className="flex items-center gap-1.5 text-[12px] text-rose-300"><AlertCircle className="size-3.5" /> {error}</div>}
            {info && <div className="text-[12px] text-emerald-300">{info}</div>}
            <button disabled={busy} className="btn btn-primary w-full py-2.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} {signUp ? 'Create staff account' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setSignUp((v) => !v)} className="w-full text-center text-[12px] text-fg-3 hover:text-fg-2">
              {signUp ? 'Have an account? Sign in' : 'New staff member? Create an account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
