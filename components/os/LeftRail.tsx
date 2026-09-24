'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Lock, RefreshCw, Scale, Send, ShieldCheck, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { Avatar, ROLE_LABEL, cx, type OsContext } from './ui'

type ToolKey = 'info' | 'telegram' | 'privacy' | 'settings'

/** Left navigation rail: logo, live team presence (Supabase Realtime Presence), workspace tools, Mia quick assistant. */
export default function LeftRail({ ctx, onOpenMia }: { ctx: OsContext; onOpenMia: () => void }) {
  const [open, setOpen] = useState<ToolKey | null>(null)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [])
  const { snap } = ctx
  const running = snap.sessions.some((s) => s.state === 'RUNNING')
  const tools: { key: ToolKey; icon: LucideIcon; label: string }[] = [
    { key: 'info', icon: Info, label: 'Workspace info' },
    { key: 'telegram', icon: Send, label: 'Telegram channel' },
    { key: 'privacy', icon: Scale, label: 'Privacy & GDPR' },
    { key: 'settings', icon: SlidersHorizontal, label: 'Workspace settings' },
  ]
  const staff = [...snap.staff].sort((a, b) => Number(ctx.online.has(b.id)) - Number(ctx.online.has(a.id)))

  return (
    <nav ref={ref} className="relative z-30 hidden w-[72px] shrink-0 flex-col items-center border-r border-line bg-panel/80 py-4 backdrop-blur-xl sm:flex">
      <button onClick={() => ctx.actions.go('home')} title="Smartstay OS"
        className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#5e5ce6] via-[#8b5cf6] to-[#bf5af2] shadow-[0_10px_24px_-10px_#8b5cf6] transition hover:scale-105">
        <Sparkles className="size-5 text-white" />
      </button>

      <div className="mt-6 flex flex-col items-center gap-2.5">
        <div className="eyebrow !text-[9px] !tracking-[0.1em]">Team</div>
        {staff.map((s) => {
          const online = ctx.online.has(s.id)
          return (
            <div key={s.id} className="group relative">
              <Avatar name={s.display_name} size={36} online={online} dim={!online} className="ring-2 ring-panel transition group-hover:scale-105" />
              <Tip>{s.display_name}{s.id === ctx.me.id ? ' (you)' : ''}<span className="block text-[10.5px] font-normal text-fg-3">{ROLE_LABEL[s.role] ?? s.role} · {online ? 'online now' : 'offline'}</span></Tip>
            </div>
          )
        })}
      </div>

      <div className="my-5 h-px w-8 bg-line" />
      <div className="flex flex-col items-center gap-1.5">
        {tools.map((t) => (
          <div key={t.key} className="group relative">
            <button onClick={() => setOpen((o) => (o === t.key ? null : t.key))} aria-label={t.label} className={cx('icon-btn', open === t.key && 'bg-white/[0.08] text-fg')}>
              <t.icon className="size-[18px]" />
            </button>
            {open !== t.key && <Tip>{t.label}</Tip>}
            {open === t.key && (
              <div className="popover absolute left-full top-0 ml-3 w-72 animate-pop p-3">
                {t.key === 'info' && <InfoPanel ctx={ctx} />}
                {t.key === 'telegram' && <TelegramPanel ctx={ctx} />}
                {t.key === 'privacy' && <PrivacyPanel ctx={ctx} />}
                {t.key === 'settings' && <SettingsPanel ctx={ctx} close={() => setOpen(null)} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <button onClick={onOpenMia} className="group relative block rounded-full transition hover:scale-105" aria-label="Quick chat with Mia">
          <Avatar name="Mia" size={42} gradient={['#ff6fa5', '#8b5cf6']} className="shadow-[0_10px_24px_-8px_#bf5af2] ring-2 ring-[#bf5af2]/50"
            badge={<span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-amber-300 ring-2 ring-panel"><Sparkles className="size-2.5 text-amber-900" /></span>} />
          {running && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[#bf5af2]/40" />}
          <Tip>Ask Mia<span className="block text-[10.5px] font-normal text-fg-3">Open quick chat</span></Tip>
        </button>
      </div>
    </nav>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-elev px-2.5 py-1.5 text-[12px] font-medium text-fg opacity-0 shadow-xl ring-1 ring-line transition-opacity duration-150 group-hover:opacity-100">
      {children}
    </span>
  )
}
function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]"><span className="text-fg-3">{k}</span><span className={cx('truncate text-right', mono && 'font-mono text-[11px]')}>{v}</span></div>
}
function Title({ icon: I, children }: { icon: LucideIcon; children: ReactNode }) {
  return <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><I className="size-4 text-accent" />{children}</div>
}

function InfoPanel({ ctx }: { ctx: OsContext }) {
  const s = ctx.snap.space
  return (
    <>
      <Title icon={Info}>Workspace</Title>
      <Row k="Property" v={s.name} />
      <Row k="Code" v={s.property_code} mono />
      <Row k="Region" v={s.region} />
      <Row k="Timezone" v={s.timezone} />
      <Row k="Space ID" v={`…${s.id.slice(-12)}`} mono />
      <Row k="Realtime" v={ctx.live} />
      <div className="mt-2 rounded-xl bg-white/[0.04] p-2.5 text-[11.5px] text-fg-2">
        <div className="flex items-center gap-1.5 font-medium text-fg"><Lock className="size-3.5 text-emerald-400" /> Tenant isolation</div>
        Forced row-level security on every table; staff write only through audited RPCs.
      </div>
    </>
  )
}

function TelegramPanel({ ctx }: { ctx: OsContext }) {
  const tg = ctx.snap.channels.find((c) => c.kind === 'telegram')
  const conversations = ctx.snap.conversations.filter((c) => c.channel_id === tg?.id && !c.external_chat_id.startsWith('sim-')).length
  return (
    <>
      <Title icon={Send}>Telegram channel</Title>
      <Row k="Bot" v={tg?.bot_username ? `@${tg.bot_username}` : 'not set'} />
      <Row k="Status" v={tg?.enabled ? 'enabled' : 'disabled'} />
      <Row k="Live conversations" v={conversations} />
      {tg?.bot_username && (
        <a href={`https://t.me/${tg.bot_username}`} target="_blank" rel="noreferrer" className="btn btn-soft mt-2 w-full"><Send className="size-3.5" /> Open bot in Telegram</a>
      )}
      <p className="mt-2 text-[11px] text-fg-3">Guests connect with a deep link from CRM → guest → “Telegram link”.</p>
    </>
  )
}

function PrivacyPanel({ ctx }: { ctx: OsContext }) {
  const sensitive = ctx.snap.preferences.filter((p) => p.sensitive).length
  return (
    <>
      <Title icon={Scale}>Privacy & GDPR</Title>
      <Row k="Guest profiles" v={ctx.snap.profiles.length} />
      <Row k="Sensitive facts" v={`${sensitive} · explicit consent`} />
      <Row k="Provisional profiles" v={ctx.snap.profiles.filter((p) => p.provisional).length} />
      <div className="mt-2 space-y-1.5 text-[11.5px] text-fg-2">
        <div className="flex gap-1.5"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-400" /> Allergens are used for safety checks and never placed in AI prompts.</div>
        <div className="flex gap-1.5"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-400" /> Messages are immutable; raw webhook payloads are hidden from staff.</div>
        <div className="flex gap-1.5"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-400" /> Guests are told they are chatting with an AI (EU AI Act Art. 50).</div>
      </div>
    </>
  )
}

function SettingsPanel({ ctx, close }: { ctx: OsContext; close: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Title icon={SlidersHorizontal}>Workspace settings</Title>
      <Row k="Signed in as" v={ctx.me.display_name} />
      <Row k="Role" v={ROLE_LABEL[ctx.me.role] ?? ctx.me.role} />
      <Row k="Live updates" v={ctx.live === 'live' ? 'Realtime' : ctx.live === 'polling' ? 'Polling (12 s)' : 'Connecting'} />
      <button disabled={busy} onClick={async () => { setBusy(true); await ctx.actions.refresh(); setBusy(false); close() }} className="btn btn-soft mt-2 w-full">
        <RefreshCw className={cx('size-3.5', busy && 'animate-spin')} /> Reload workspace data
      </button>
    </>
  )
}
