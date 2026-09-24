'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Ellipsis, Info, Loader2, Play, Sparkles } from 'lucide-react'
import { APPS, TZ, cx, type AppDef, type OsContext } from './ui'

export const DEMO_INQUIRY = 'I want to order Saperavi 2022 and need 2 extra towels in Room 12'

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Apps Hub: the eight workspace apps in a 4 × 2 grid with a live status line per app. */
export default function AppsGrid({ ctx, unread }: { ctx: OsContext; unread: number }) {
  const { snap } = ctx
  const [busy, setBusy] = useState(false)
  const [hello, setHello] = useState('Welcome')
  useEffect(() => setHello(greeting()), [])
  const open = snap.tasks.filter((t) => ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status)).length
  const ready = snap.rooms.filter((r) => r.cleaning_state === 'CLEAN').length
  const running = snap.sessions.some((s) => s.state === 'RUNNING')
  const live: Partial<Record<AppDef['key'], string>> = {
    contact: unread ? `${unread} unread` : `${snap.conversations.length} conversation${snap.conversations.length === 1 ? '' : 's'}`,
    crm: `${snap.profiles.length} guest profile${snap.profiles.length === 1 ? '' : 's'}`,
    drive: `${snap.documents.filter((d) => d.state === 'APPROVED_ACTIVE').length} approved documents`,
    ai: running ? 'Reasoning…' : `${snap.agents.filter((a) => a.enabled).length} agents active`,
    analytics: `${snap.kpis?.inbound_today ?? 0} guest messages today`,
    ops: open ? `${open} open task${open === 1 ? '' : 's'}` : `${ready}/${snap.rooms.length} rooms ready`,
    builder: 'Not installed',
    store: `${APPS.filter((a) => a.installed).length} apps installed`,
  }

  async function simulate() {
    setBusy(true)
    ctx.actions.go('contact')
    await ctx.actions.post('/api/chat', { action: 'simulate', text: DEMO_INQUIRY }, 'Guest inquiry sent — watch the AI team work')
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-6xl pt-4 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-fg-3">{hello}, {ctx.me.display_name.split(' ')[0]}</div>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-[32px]">Apps</h1>
        </div>
        <button onClick={simulate} disabled={busy} className="btn btn-primary px-4 py-2">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Simulate Guest Inquiry
        </button>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {APPS.map((a, i) => <AppCard key={a.key} app={a} i={i} status={live[a.key]} onOpen={() => ctx.actions.go(a.key)} />)}
      </div>
      {running && (
        <button onClick={() => ctx.actions.go('ai')} className="card mt-5 flex w-full animate-rise items-center gap-3 px-4 py-3 text-left transition hover:bg-card-hover">
          <Sparkles className="size-4 text-[#bf5af2]" />
          <span className="text-[13px]">The AI team is working on a guest request</span>
          <span className="shimmer-line h-1 flex-1 rounded-full" />
          <span className="text-[12px] text-accent">Watch reasoning</span>
        </button>
      )}
    </div>
  )
}

function AppCard({ app, i, status, onOpen }: { app: AppDef; i: number; status?: string; onOpen: () => void }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const Icon = app.icon
  return (
    <div ref={ref} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ animationDelay: `${i * 35}ms` }}
      className="group relative flex min-h-[184px] animate-rise cursor-pointer flex-col rounded-2xl bg-[#1c1c1e] p-5 ring-1 ring-white/[0.06] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#252528] hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]">
      <div className="flex items-start justify-between">
        <div className={cx('grid size-12 place-items-center rounded-full shadow-lg transition-transform duration-300 group-hover:scale-105', app.color)}>
          <Icon className="size-[22px]" strokeWidth={2.1} />
        </div>
        <button onClick={(e) => { e.stopPropagation(); setMenu((m) => !m) }} aria-label={`${app.title} menu`}
          className="grid size-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white">
          <Ellipsis className="size-[18px]" />
        </button>
      </div>
      <div className="mt-auto pt-6">
        <div className="text-[15px] font-semibold text-white">{app.title}</div>
        <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-white/55">{app.desc}</div>
        {status && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-white/70">
            <span className={cx('size-1.5 rounded-full', app.installed ? 'bg-emerald-400' : 'bg-fg-3')} />{status}
          </div>
        )}
      </div>
      {menu && (
        <div className="popover absolute right-4 top-14 w-48 animate-pop" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenu(false); onOpen() }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] hover:bg-white/[0.06]"><ArrowUpRight className="size-4" /> Open</button>
          <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11.5px] text-fg-3"><Info className="mt-px size-3.5 shrink-0" /> {app.desc}</div>
        </div>
      )}
    </div>
  )
}
