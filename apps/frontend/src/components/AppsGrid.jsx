import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Ellipsis, Info, Play, Sparkles } from 'lucide-react'
import { APPS, OPERATOR, TZ, cx } from '../App.jsx'

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function AppsGrid({ ctx }) {
  const { ov, session } = ctx
  const open = ov.tasks.filter((t) => ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status)).length
  const live = {
    contact: ctx.unreadChats ? `${ctx.unreadChats} unread` : ov.conversation.state === 'OPERATOR_LOCKED' ? 'Operator live' : 'AI active',
    crm: `${ov.stats.active_guests} guest in house`,
    drive: '2 approved documents',
    ai: session?.state === 'RUNNING' ? 'Reasoning…' : `${ov.agents.filter((a) => a.enabled).length} agents active`,
    analytics: `${ov.stats.events_relayed} events today`,
    ops: open ? `${open} open task${open === 1 ? '' : 's'}` : `${ov.stats.rooms_ready}/${ov.stats.rooms_total} rooms ready`,
    builder: 'Not in the MVP runtime',
    store: `${APPS.length - 2} apps installed`,
  }
  return (
    <div className="mx-auto max-w-6xl pt-4 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-fg-3">{greeting()}, {OPERATOR.name.split(' ')[0]}</div>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-[32px]">Apps</h1>
        </div>
        <button onClick={() => { ctx.go('contact'); ctx.simulate() }} disabled={ctx.busy} className="btn btn-primary px-4 py-2">
          <Play className="size-3.5" /> Simulate Guest Inquiry
        </button>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {APPS.map((a, i) => <AppCard key={a.key} app={a} i={i} status={live[a.key]} onOpen={() => ctx.go(a.key)} />)}
      </div>
      {session?.state === 'RUNNING' && (
        <button onClick={() => ctx.go('ai')} className="card card-hover mt-5 flex w-full animate-rise items-center gap-3 px-4 py-3 text-left">
          <Sparkles className="size-4 text-[#bf5af2]" />
          <span className="text-[13px]">The AI team is working on a guest request</span>
          <span className="shimmer-line h-1 flex-1 rounded-full" />
          <span className="text-[12px] text-accent">Watch reasoning</span>
        </button>
      )}
    </div>
  )
}

function AppCard({ app, i, status, onOpen }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const Icon = app.icon
  return (
    <div ref={ref} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      style={{ animationDelay: `${i * 35}ms` }}
      className="group relative flex min-h-[184px] animate-rise cursor-pointer flex-col rounded-2xl bg-[#1c1c1e] p-5 ring-1 ring-white/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#252528] hover:shadow-[0_18px_40px_-20px_rgb(0_0_0/0.9)] light:bg-card light:ring-line light:hover:bg-card-hover">
      <div className="flex items-start justify-between">
        <div className={cx('grid size-12 place-items-center rounded-full shadow-lg transition-transform duration-300 group-hover:scale-105', app.color)}>
          <Icon className="size-[22px]" strokeWidth={2.1} />
        </div>
        <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m) }} aria-label={`${app.title} menu`}
          className="grid size-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white light:text-fg-3 light:hover:bg-fg/[0.06]">
          <Ellipsis className="size-[18px]" />
        </button>
      </div>
      <div className="mt-auto pt-6">
        <div className="text-[15px] font-semibold text-white light:text-fg">{app.title}</div>
        <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-white/55 light:text-fg-3">{app.desc}</div>
        {status && <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-white/70 light:text-fg-2"><span className="size-1.5 rounded-full bg-emerald-400" />{status}</div>}
      </div>
      {menu && (
        <div className="popover absolute top-14 right-4 w-44 animate-pop" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenu(false); onOpen() }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] hover:bg-fg/[0.06]"><ArrowUpRight className="size-4" /> Open</button>
          <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11.5px] text-fg-3"><Info className="mt-px size-3.5 shrink-0" /> {app.desc}</div>
        </div>
      )}
    </div>
  )
}
