import { useEffect, useRef, useState } from 'react'
import { Coins, Database, Info, Lock, Moon, RotateCcw, Scale, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Zap } from 'lucide-react'
import { Avatar, api, cx } from '../App.jsx'

const ROLE = { FRONT_DESK_LEAD: 'Front desk lead', ROOM_ATTENDANT: 'Room attendant', HOUSEKEEPING_SUPERVISOR: 'Housekeeping supervisor', SOMMELIER: 'Sommelier', GENERAL_MANAGER: 'General manager' }
export const ACCENTS = [
  { key: 'blue', hex: '#0a84ff' }, { key: 'violet', hex: '#8b5cf6' }, { key: 'pink', hex: '#ec4899' },
  { key: 'wine', hex: '#b3395b' }, { key: 'green', hex: '#22b35e' }, { key: 'orange', hex: '#f28c28' },
]

export default function LeftRail({ ctx, onOpenMia, theme, setTheme, accent, setAccent }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    const esc = (e) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [])
  const { ov } = ctx
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const tools = [
    { key: 'info', icon: Info, label: 'Workspace info' },
    { key: 'billing', icon: Coins, label: 'Usage & tokens' },
    { key: 'gdpr', icon: Scale, label: 'Privacy & GDPR' },
    { key: 'settings', icon: SlidersHorizontal, label: 'Workspace settings' },
  ]

  return (
    <nav ref={ref} className="relative z-30 hidden w-[72px] shrink-0 flex-col items-center border-r border-line bg-panel/80 py-4 backdrop-blur-xl sm:flex">
      <button onClick={() => ctx.go('home')} title="SmartStay OS" className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#5e5ce6] via-[#8b5cf6] to-[#bf5af2] shadow-[0_10px_24px_-10px_#8b5cf6] transition hover:scale-105">
        <Sparkles className="size-5 text-white" />
      </button>

      <div className="mt-6 flex flex-col items-center gap-2.5">
        <div className="eyebrow !text-[9px] !tracking-[0.1em]">Team</div>
        {ov.staff.map((s) => (
          <div key={s.id} className="group relative">
            <Avatar name={s.display_name} size={36} online className="ring-2 ring-panel transition group-hover:scale-105" />
            <Tip>{s.display_name}<span className="block text-[10.5px] font-normal text-fg-3">{ROLE[s.role] || s.role} · on shift</span></Tip>
          </div>
        ))}
      </div>

      <div className="my-5 h-px w-8 bg-line" />
      <div className="flex flex-col items-center gap-1.5">
        {tools.map((t) => (
          <div key={t.key} className="group relative">
            <button onClick={() => toggle(t.key)} aria-label={t.label} className={cx('icon-btn', open === t.key && 'bg-fg/[0.08] text-fg')}>
              <t.icon className="size-[18px]" />
            </button>
            {open !== t.key && <Tip>{t.label}</Tip>}
            {open === t.key && (
              <div className="popover absolute top-0 left-full ml-3 w-72 animate-pop p-3">
                {t.key === 'info' && <InfoPanel ov={ov} live={ctx.live} />}
                {t.key === 'billing' && <UsagePanel ov={ov} steps={ctx.steps} />}
                {t.key === 'gdpr' && <PrivacyPanel ov={ov} />}
                {t.key === 'settings' && <SettingsPanel ctx={ctx} theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} close={() => setOpen(null)} />}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <button onClick={onOpenMia} className="group relative block rounded-full transition hover:scale-105" aria-label="Quick chat with Mia">
          <Avatar name="Mia" size={42} gradient={['#ff6fa5', '#8b5cf6']} className="ring-2 ring-[#bf5af2]/50 shadow-[0_10px_24px_-8px_#bf5af2]"
            badge={<span className="absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-full bg-amber-300 ring-2 ring-panel"><Sparkles className="size-2.5 text-amber-900" /></span>} />
          {ctx.session?.state === 'RUNNING' && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[#bf5af2]/40" />}
          <Tip>Ask Mia<span className="block text-[10.5px] font-normal text-fg-3">Open quick chat</span></Tip>
        </button>
      </div>
    </nav>
  )
}

function Tip({ children }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-lg bg-elev px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-fg opacity-0 shadow-xl ring-1 ring-line transition-opacity duration-150 group-hover:opacity-100">
      {children}
    </span>
  )
}

function Row({ k, v, mono }) {
  return <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]"><span className="text-fg-3">{k}</span><span className={cx('truncate text-right text-fg', mono && 'font-mono text-[11px]')}>{v}</span></div>
}
function PanelTitle({ icon: I, children }) {
  return <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><I className="size-4 text-accent" />{children}</div>
}

function InfoPanel({ ov, live }) {
  const p = ov.property
  return (
    <>
      <PanelTitle icon={Info}>Workspace</PanelTitle>
      <Row k="Property" v={p.name} />
      <Row k="Code" v={p.property_code} mono />
      <Row k="Region" v={p.region} />
      <Row k="Timezone" v={p.timezone} />
      <Row k="Space ID" v={`…${p.id.slice(-12)}`} mono />
      <Row k="Event stream" v={live} />
      <div className="mt-2 rounded-xl bg-fg/[0.04] p-2.5 text-[11.5px] text-fg-2">
        <div className="flex items-center gap-1.5 font-medium text-fg"><Lock className="size-3.5 text-emerald-400" /> Tenant isolation</div>
        Row-level security {ov.isolation.rls}; API role {ov.isolation.db_role}.
      </div>
    </>
  )
}

function UsagePanel({ ov, steps }) {
  return (
    <>
      <PanelTitle icon={Coins}>Usage & tokens</PanelTitle>
      <div className="rounded-xl bg-gradient-to-br from-[#5e5ce6] to-[#bf5af2] p-3 text-white">
        <div className="text-[11px] opacity-80">Plan</div>
        <div className="text-base font-semibold">Local MVP runtime</div>
        <div className="mt-2 text-[11px] opacity-80">LLM tokens billed</div>
        <div className="text-xl font-semibold tabular-nums">0</div>
      </div>
      <div className="mt-2">
        <Row k="Planner" v="Deterministic, on-device" />
        <Row k="Steps (latest session)" v={steps.length} />
        <Row k="Events relayed" v={ov.stats.events_relayed} />
      </div>
      <p className="mt-1 text-[11px] text-fg-3">No external model is called in this build, so nothing is metered.</p>
    </>
  )
}

function PrivacyPanel({ ov }) {
  const g = ov.guest
  const sensitive = g.preferences.filter((p) => p.sensitive)
  return (
    <>
      <PanelTitle icon={Scale}>Privacy & GDPR</PanelTitle>
      <Row k="Guest profiles" v="1 active" />
      <Row k="Privacy epoch" v={g.privacy_epoch} />
      <Row k="Sensitive facts" v={`${sensitive.length} · explicit consent`} />
      <Row k="Contact verified" v={g.contact_verified_at ? 'yes' : 'no'} />
      <div className="mt-2 space-y-1.5 text-[11.5px] text-fg-2">
        <div className="flex gap-1.5"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-400" /> Allergens are staff-only; the AI uses them for safety checks, never in guest replies.</div>
        <div className="flex gap-1.5"><Database className="mt-px size-3.5 shrink-0 text-emerald-400" /> Messages are immutable; the API role cannot edit them.</div>
      </div>
    </>
  )
}

function SettingsPanel({ ctx, theme, setTheme, accent, setAccent, close }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <PanelTitle icon={SlidersHorizontal}>Workspace settings</PanelTitle>
      <div className="eyebrow mt-1 mb-1.5">Appearance</div>
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-fg/[0.05] p-1">
        {[['dark', Moon], ['light', Sun]].map(([k, I]) => (
          <button key={k} onClick={() => setTheme(k)} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium capitalize transition', theme === k ? 'bg-card text-fg shadow ring-1 ring-line' : 'text-fg-2')}>
            <I className="size-3.5" /> {k}
          </button>
        ))}
      </div>
      <div className="eyebrow mt-3 mb-1.5">Accent</div>
      <div className="flex gap-2">
        {ACCENTS.map((a) => (
          <button key={a.key} onClick={() => setAccent(a.key)} aria-label={a.key} className={cx('size-6 rounded-full transition hover:scale-110', accent === a.key && 'ring-2 ring-fg ring-offset-2 ring-offset-elev')} style={{ background: a.hex }} />
        ))}
      </div>
      <div className="eyebrow mt-3 mb-1.5">Demo data</div>
      <button disabled={busy} onClick={async () => { setBusy(true); await ctx.run(() => api('/demo/reset', {}), 'Demo data restored to the seeded state'); setBusy(false); close() }} className="btn btn-soft w-full">
        <RotateCcw className="size-3.5" /> Reset demo
      </button>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-3"><Zap className="size-3" /> Stream {ctx.live} · {ctx.ov.engine.retrieval}</div>
    </>
  )
}
