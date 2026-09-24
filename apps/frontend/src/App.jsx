import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, BedDouble, BrainCircuit, ChartColumn, Check, CircleAlert, Cloud, CodeXml, GitBranch, Headset, LayoutDashboard,
  LayoutGrid, Lock, MessageCircle, Sparkles, TrendingUp, Users, UsersRound, X, Zap,
} from 'lucide-react'
import LeftRail from './components/LeftRail.jsx'
import Header from './components/Header.jsx'
import BottomDock from './components/BottomDock.jsx'
import AppsGrid from './components/AppsGrid.jsx'
import ContactCenterView, { ChatThread } from './components/ContactCenterView.jsx'
import CrmView from './components/CrmView.jsx'
import DriveView from './components/DriveView.jsx'
import AiTeamView from './components/AiTeamView.jsx'
import OperationsView from './components/OperationsView.jsx'

// ============================================================================================ shared helpers
export const TZ = 'Asia/Tbilisi'
export const OPERATOR = { id: '6f1c2d3e-0000-4000-8000-00000000b001', name: 'Levan Beridze', role: 'Front Desk Lead' }
export const DEMO_INQUIRY = 'I want to order Saperavi 2022 and need 2 extra towels in Room 12'

export function cx(...a) { return a.filter(Boolean).join(' ') }
export function fmtTime(iso, opts = {}) {
  return iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', ...opts }).format(new Date(iso)) : ''
}
export function fmtDate(d, opts = { day: 'numeric', month: 'short' }) {
  return d ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(d.length === 10 ? d + 'T00:00:00Z' : d)) : ''
}
export async function api(path, body) {
  const res = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `${res.status} ${res.statusText}`)
  return data
}

const GRADIENTS = [['#ff9f0a', '#ff375f'], ['#5e5ce6', '#bf5af2'], ['#30d158', '#0a84ff'], ['#64d2ff', '#5e5ce6'], ['#ff6482', '#bf5af2'], ['#ffd60a', '#ff9f0a'], ['#0a84ff', '#30b0c7']]
export function initials(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() }
export function Avatar({ name, size = 32, online, badge, className, gradient }) {
  const h = [...(name || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const [a, b] = gradient || GRADIENTS[h % GRADIENTS.length]
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36), background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {initials(name)}
      {online && <span className="absolute -right-px -bottom-px size-[30%] min-h-2.5 min-w-2.5 rounded-full bg-emerald-400 ring-2 ring-panel" />}
      {badge}
    </span>
  )
}

// App registry: grid (hub) colors and dock colors follow the design spec independently.
export const APPS = [
  { key: 'contact', title: 'Contact Center', desc: 'Unifies calls, chats, email, and customer interactions', icon: Headset, color: 'bg-[#0a84ff] text-white', dockIcon: MessageCircle, dockColor: 'bg-gradient-to-br from-[#bf5af2] to-[#8944d8] text-white' },
  { key: 'crm', title: 'CRM', desc: 'Unifies customer data, history, and relationships', icon: Users, color: 'bg-[#ff9f0a] text-white', dockIcon: Users, dockColor: 'bg-gradient-to-br from-[#ffd60a] to-[#f5b400] text-white' },
  { key: 'drive', title: 'Storage', desc: 'Centralize files, media, and organizational resources', icon: Cloud, color: 'bg-[#ff453a] text-white', dockIcon: Cloud, dockColor: 'bg-gradient-to-br from-[#ff6961] to-[#e0302a] text-white' },
  { key: 'ai', title: 'AI Team', desc: 'AI agents that coordinate and execute operational workflows', icon: UsersRound, color: 'bg-[#ff375f] text-white', dockIcon: BrainCircuit, dockColor: 'bg-gradient-to-br from-[#ff6fa5] to-[#e6246b] text-white' },
  { key: 'analytics', title: 'Analytics', desc: 'Monitor organizational performance and operational intelligence', icon: ChartColumn, color: 'bg-[#30d158] text-white', dockIcon: ChartColumn, dockColor: 'bg-gradient-to-br from-[#4cd964] to-[#1fa94a] text-white' },
  { key: 'ops', title: 'Operations', desc: 'Coordinate workflows, tasks, and operational execution', icon: GitBranch, color: 'bg-[#8944d8] text-white', dockIcon: GitBranch, dockColor: 'bg-gradient-to-br from-[#7d7aff] to-[#4b47d6] text-white' },
  { key: 'builder', title: 'Builder', desc: 'Build adaptive software and operational interfaces with AI', icon: CodeXml, color: 'bg-white text-black ring-1 ring-black/10', dockIcon: CodeXml, dockColor: 'bg-white text-black' },
  { key: 'store', title: 'App Store', desc: 'Install business apps and AI tools into your workspace', icon: LayoutGrid, color: 'bg-[#0a84ff] text-white', dockIcon: LayoutGrid, dockColor: 'bg-[#0a84ff] text-white' },
]
export const HOME = { key: 'home', title: 'Apps', icon: LayoutDashboard, dockIcon: LayoutDashboard, dockColor: 'bg-gradient-to-br from-[#3a3a3c] to-[#1c1c1e] text-white ring-1 ring-white/15' }
const DOCK_ORDER = ['home', 'contact', 'crm', 'ops', 'drive', 'ai', 'analytics']

const readPref = (k, d) => { try { return localStorage.getItem(k) || d } catch { return d } }
const writePref = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } }
const viewFromHash = () => { const v = window.location.hash.replace(/^#\/?/, ''); return v && (v === 'home' || APPS.some((a) => a.key === v)) ? v : 'home' }

// ============================================================================================ root
export default function App() {
  const [ov, setOv] = useState(null)
  const [apiDown, setApiDown] = useState(false)
  const [steps, setSteps] = useState([])
  const [session, setSession] = useState(null)
  const [live, setLive] = useState('connecting')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const [flash, setFlash] = useState({})
  const [eventLog, setEventLog] = useState([])
  const [notes, setNotes] = useState([])
  const [view, setView] = useState(viewFromHash)
  const [theme, setTheme] = useState(() => readPref('ss.theme', 'dark'))
  const [accent, setAccent] = useState(() => readPref('ss.accent', 'blue'))
  const [miaOpen, setMiaOpen] = useState(false)
  const [ccSeen, setCcSeen] = useState(0)
  const refreshTimer = useRef(null)

  useEffect(() => { document.documentElement.dataset.theme = theme; writePref('ss.theme', theme) }, [theme])
  useEffect(() => { document.documentElement.dataset.accent = accent; writePref('ss.accent', accent) }, [accent])
  useEffect(() => {
    const on = () => setView(viewFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((key) => { window.location.hash = '/' + key; setView(key) }, [])

  const toast = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const d = await api('/overview')
      setOv(d); setApiDown(false)
      setSession((s) => (s && d.session && s.id === d.session.id ? { ...s, ...d.session } : d.session))
      setSteps((cur) => (d.session && cur.length && cur[0]?.session_id === d.session.id && cur.length > d.steps.length ? cur : d.steps))
    } catch {
      setApiDown(true)
    }
  }, [])
  const scheduleRefresh = useCallback(() => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(refresh, 120) }, [refresh])
  useEffect(() => { refresh() }, [refresh])

  const notify = useCallback((n) => setNotes((l) => [{ id: Math.random().toString(36).slice(2), at: new Date().toISOString(), read: false, ...n }, ...l].slice(0, 30)), [])

  useEffect(() => {
    const es = new EventSource('/api/stream')
    es.addEventListener('hello', () => setLive('live'))
    es.onopen = () => setLive('live')
    es.onerror = () => setLive('reconnecting')
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      const d = ev.data || {}
      setEventLog((l) => [{ ...ev, n: m.lastEventId }, ...l].slice(0, 60))
      if (ev.type === 'agent.step') {
        setSteps((cur) => (cur.length && cur[0].session_id !== d.session_id ? [d] : cur.some((s) => s.id === d.id) ? cur : [...cur, d]))
        return
      }
      if (ev.type === 'agent.session') {
        if (d.phase === 'started') { setSteps([]); setSession(d) } else {
          setSession(d)
          if (d.state === 'HANDED_TO_HUMAN') notify({ tone: 'alert', title: 'Operator required', body: 'Mia handed a guest conversation to the front desk', view: 'contact' })
        }
        scheduleRefresh(); return
      }
      if (ev.type === 'message.created' && d.direction === 'inbound') notify({ tone: 'info', title: `New WhatsApp message · ${d.author_name}`, body: d.body, view: 'contact' })
      if (ev.type === 'task.created') notify({ tone: 'warn', title: 'New service task', body: `${d.title} · room ${d.room_number}`, view: 'ops' })
      if (ev.type === 'task.updated' && d.status === 'COMPLETED') notify({ tone: 'ok', title: 'Task attested complete', body: `${d.title} · ${d.by}`, view: 'ops' })
      if (ev.type === 'room.updated') {
        setFlash((f) => ({ ...f, ['room:' + d.number]: Date.now() }))
        notify({ tone: d.cleaning_state === 'CLEAN' ? 'ok' : 'muted', title: `Room ${d.number} · ${String(d.cleaning_state).toLowerCase()}`, body: `${d.by || 'Staff'} updated turnover status`, view: 'ops' })
      }
      if (ev.type === 'task.created' || ev.type === 'task.updated') setFlash((f) => ({ ...f, ['task:' + d.id]: Date.now() }))
      if (ev.type === 'demo.reset') { setSteps([]); setSession(null); setNotes([]); setCcSeen(0) }
      scheduleRefresh()
    }
    return () => es.close()
  }, [scheduleRefresh, notify])

  const run = useCallback(async (fn, ok) => {
    try { const r = await fn(); if (ok) toast(ok); scheduleRefresh(); return r } catch (e) { toast(e.message, 'error') }
  }, [toast, scheduleRefresh])

  const simulate = useCallback(async (text = DEMO_INQUIRY) => {
    if (busy || !text.trim()) return
    setBusy(true)
    try { await api('/chat/send', { text: text.trim() }); scheduleRefresh() } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }, [busy, toast, scheduleRefresh])

  const inboundCount = ov ? ov.messages.filter((m) => m.direction === 'inbound').length : 0
  useEffect(() => { if (view === 'contact' || miaOpen) setCcSeen(inboundCount) }, [view, miaOpen, inboundCount])
  const unreadChats = Math.max(0, inboundCount - ccSeen)

  const ctx = useMemo(() => ({ ov, steps, session, live, busy, flash, eventLog, unreadChats, simulate, run, toast, go, refresh, openMia: () => setMiaOpen(true) }),
    [ov, steps, session, live, busy, flash, eventLog, unreadChats, simulate, run, toast, go, refresh])

  if (!ov) return <Boot apiDown={apiDown} onRetry={refresh} />

  const current = APPS.find((a) => a.key === view) || HOME
  return (
    <div className="flex h-full min-h-[640px] overflow-hidden">
      <LeftRail ctx={ctx} onOpenMia={() => setMiaOpen(true)} theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header ctx={ctx} current={current} theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent}
          notes={notes} markRead={() => setNotes((l) => l.map((n) => ({ ...n, read: true })))} clearNotes={() => setNotes([])} />
        <main key={view} className="min-h-0 flex-1 animate-fade overflow-y-auto px-4 pb-28 sm:px-6">
          {view === 'home' && <AppsGrid ctx={ctx} />}
          {view === 'contact' && <ContactCenterView ctx={ctx} />}
          {view === 'crm' && <CrmView ctx={ctx} />}
          {view === 'drive' && <DriveView ctx={ctx} />}
          {view === 'ai' && <AiTeamView ctx={ctx} />}
          {view === 'ops' && <OperationsView ctx={ctx} />}
          {view === 'analytics' && <AnalyticsView ctx={ctx} />}
          {view === 'builder' && <NotInstalled app={current} ctx={ctx} />}
          {view === 'store' && <AppStoreView ctx={ctx} />}
        </main>
      </div>
      <BottomDock items={DOCK_ORDER.map((k) => (k === 'home' ? HOME : APPS.find((a) => a.key === k)))} active={view} onSelect={go}
        badges={{ contact: unreadChats, ops: ov.stats.pending_requests }} />
      {miaOpen && <MiaDrawer ctx={ctx} onClose={() => setMiaOpen(false)} />}
      <Toasts toasts={toasts} />
    </div>
  )
}

function Boot({ apiDown, onRetry }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="card w-full max-w-sm animate-pop p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#5e5ce6] to-[#bf5af2] shadow-lg"><Sparkles className="size-6 text-white" /></div>
        <div className="mt-4 text-[15px] font-semibold">SmartStay OS</div>
        {apiDown ? (
          <>
            <p className="mt-1.5 text-[13px] text-fg-2">The backend on <span className="font-mono">localhost:8000</span> is not reachable. Start it with <span className="font-mono">./run.sh</span>.</p>
            <button onClick={onRetry} className="btn btn-primary mt-4">Retry</button>
          </>
        ) : <p className="mt-1.5 text-[13px] text-fg-2">Connecting to your workspace…</p>}
      </div>
    </div>
  )
}

// ============================================================================================ Mia quick-chat drawer
function MiaDrawer({ ctx, onClose }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex animate-fade justify-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="glass m-3 flex w-full max-w-[440px] animate-slide-in flex-col overflow-hidden rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name="Mia" size={36} gradient={['#ff6fa5', '#8b5cf6']} badge={<span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-300 ring-2 ring-card"><Sparkles className="size-2.5 text-amber-900" /></span>} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold">Mia · Front-Desk Concierge</div>
            <div className="truncate text-[11.5px] text-fg-3">Quick chat · {ctx.ov.guest.full_name} on WhatsApp</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <ChatThread ctx={ctx} compact />
      </aside>
    </div>
  )
}

// ============================================================================================ Analytics (live figures from /api/overview)
function AnalyticsView({ ctx }) {
  const { ov, steps } = ctx
  const byStatus = ['QUEUED', 'CLAIMED', 'IN_PROGRESS', 'COMPLETED'].map((s) => ({ s, n: ov.tasks.filter((t) => t.status === s).length }))
  const maxTask = Math.max(1, ...byStatus.map((x) => x.n))
  const count = (k) => ov.messages.filter((m) => m.author_kind === k && m.direction !== 'internal').length
  const byAuthor = ['guest', 'ai', 'operator', 'system'].map((k) => ({ k, n: count(k) }))
  const totalMsgs = byAuthor.reduce((a, b) => a + b.n, 0) || 1
  const ready = ov.stats.rooms_ready / Math.max(1, ov.stats.rooms_total)
  const staffSide = count('ai') + count('operator')
  const kpis = [
    { label: 'Active guests', value: ov.stats.active_guests, icon: Users, tone: 'from-[#ff9f0a] to-[#ff375f]' },
    { label: 'Open requests', value: ov.stats.pending_requests, icon: Activity, tone: 'from-[#5e5ce6] to-[#bf5af2]' },
    { label: 'Rooms ready', value: `${ov.stats.rooms_ready}/${ov.stats.rooms_total}`, icon: BedDouble, tone: 'from-[#30d158] to-[#0a84ff]' },
    { label: 'Events relayed', value: ov.stats.events_relayed, icon: Zap, tone: 'from-[#64d2ff] to-[#5e5ce6]' },
  ]
  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <ViewTitle crumb={['Analytics', 'Today']} sub="Live figures from the operational database, updated by the event stream." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card animate-rise p-4">
            <div className={cx('grid size-9 place-items-center rounded-full bg-gradient-to-br text-white', k.tone)}><k.icon className="size-4" /></div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{k.value}</div>
            <div className="text-[12px] text-fg-3">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="eyebrow">Room readiness</div>
          <div className="mt-4 flex items-center gap-5">
            <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-fg/10" />
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round" stroke="#30d158"
                strokeDasharray={`${ready * 97.4} 97.4`} style={{ transition: 'stroke-dasharray 600ms ease' }} />
            </svg>
            <div className="space-y-1.5 text-[12.5px]">
              {ov.rooms.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className={cx('size-2 rounded-full', r.cleaning_state === 'CLEAN' ? 'bg-emerald-400' : r.cleaning_state === 'CLEANING' ? 'bg-amber-400' : 'bg-rose-400')} />
                  Room {r.number} <span className="text-fg-3">{r.cleaning_state.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="eyebrow">Service tasks by status</div>
          <div className="mt-4 space-y-3">
            {byStatus.map(({ s, n }) => (
              <div key={s}>
                <div className="flex justify-between text-[12px]"><span className="text-fg-2 capitalize">{s.replace('_', ' ').toLowerCase()}</span><span className="tabular-nums">{n}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/[0.07]"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(n / maxTask) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="eyebrow">Conversation mix</div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-fg/[0.07]">
            {byAuthor.map(({ k, n }) => <div key={k} className={cx('h-full transition-all duration-500', { guest: 'bg-[#0a84ff]', ai: 'bg-[#bf5af2]', operator: 'bg-[#ff9f0a]', system: 'bg-fg/30' }[k])} style={{ width: `${(n / totalMsgs) * 100}%` }} />)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            {byAuthor.map(({ k, n }) => <div key={k} className="flex justify-between rounded-lg bg-fg/[0.04] px-2.5 py-1.5"><span className="text-fg-2">{{ guest: 'Guest', ai: 'AI', operator: 'Operator', system: 'System' }[k]}</span><span className="tabular-nums">{n}</span></div>)}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-fg-2">
            <TrendingUp className="size-4 shrink-0 text-emerald-400" />
            {staffSide ? `AI wrote ${Math.round((count('ai') / staffSide) * 100)}% of staff-side replies` : 'No replies yet'} · {steps.length} steps in the latest AI session
          </div>
        </div>
      </div>
    </div>
  )
}

function AppStoreView({ ctx }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <ViewTitle crumb={['App Store', 'Installed']} sub="Apps available in the Chateau Telavi workspace." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.filter((a) => a.key !== 'store').map((a) => (
          <div key={a.key} className="card flex items-center gap-4 p-4">
            <div className={cx('grid size-12 shrink-0 place-items-center rounded-full', a.color)}><a.icon className="size-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{a.title}</div>
              <div className="line-clamp-2 text-[12px] text-fg-3">{a.desc}</div>
            </div>
            {a.key !== 'builder' ? <button onClick={() => ctx.go(a.key)} className="btn btn-soft">Open</button>
              : <span className="pill tone-muted"><Lock className="size-3" /> Not in MVP</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function NotInstalled({ app, ctx }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="card max-w-md animate-pop p-8 text-center">
        <div className={cx('mx-auto grid size-16 place-items-center rounded-full', app.color)}><app.icon className="size-7" /></div>
        <div className="mt-4 text-lg font-semibold">{app.title}</div>
        <p className="mt-1 text-[13px] text-fg-2">{app.desc}.</p>
        <p className="mt-3 text-[12.5px] text-fg-3">This app is not part of the local MVP runtime yet - nothing here is connected to the backend.</p>
        <button onClick={() => ctx.go('home')} className="btn btn-soft mt-5">Back to Apps</button>
      </div>
    </div>
  )
}

export function ViewTitle({ crumb, sub, right }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[22px] font-semibold tracking-tight">
          {crumb.map((c, i) => (
            <span key={c} className={cx('flex items-center gap-1.5', i > 0 && 'text-fg-3')}>{i > 0 && <span className="font-normal text-fg-3">›</span>}{c}</span>
          ))}
        </div>
        {sub && <div className="mt-0.5 text-[13px] text-fg-3">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed right-5 bottom-28 z-50 flex w-80 flex-col-reverse gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass flex animate-slide-in items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[12.5px] shadow-xl">
          {t.tone === 'error' ? <CircleAlert className="mt-px size-4 shrink-0 text-rose-400" /> : <Check className="mt-px size-4 shrink-0 text-emerald-400" />}
          <span className="text-fg">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
