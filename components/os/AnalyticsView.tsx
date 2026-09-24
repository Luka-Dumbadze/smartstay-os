'use client'

import { Activity, BedDouble, Bot, Clock, MessageSquare, TrendingUp, Users, Zap, type LucideIcon } from 'lucide-react'
import { ViewTitle, cx, fmtDate, type OsContext } from './ui'

type Ring = { label: string; value: number; color: string; detail: string }

/** Analytics (App 6): multi-ring KPI chart plus live metrics from the analytics.* views (security_invoker, RLS-scoped). */
export default function AnalyticsView({ ctx }: { ctx: OsContext }) {
  const { snap } = ctx
  const k = snap.kpis
  const week = Date.now() - 7 * 86_400_000
  const recentTasks = snap.tasks.filter((t) => new Date(t.created_at).getTime() >= week)
  const completed = recentTasks.filter((t) => t.status === 'COMPLETED').length
  const sessions = snap.sessions.filter((s) => new Date(s.started_at).getTime() >= Date.now() - 86_400_000)
  const aiResolved = sessions.filter((s) => s.state === 'COMPLETED').length
  const rings: Ring[] = [
    { label: 'Rooms ready', value: k && k.rooms_total ? k.rooms_ready / k.rooms_total : 0, color: '#30d158', detail: `${k?.rooms_ready ?? 0}/${k?.rooms_total ?? 0}` },
    { label: 'Tasks completed (7 d)', value: recentTasks.length ? completed / recentTasks.length : 0, color: '#0a84ff', detail: `${completed}/${recentTasks.length}` },
    { label: 'AI resolved (24 h)', value: sessions.length ? aiResolved / sessions.length : 0, color: '#bf5af2', detail: `${aiResolved}/${sessions.length}` },
  ]
  const metrics: { label: string; value: string | number; icon: LucideIcon; tone: string }[] = [
    { label: 'Guests in house / arriving', value: k?.guests_in_house_or_arriving ?? 0, icon: Users, tone: 'from-[#ff9f0a] to-[#ff375f]' },
    { label: 'Open service tasks', value: k?.open_tasks ?? 0, icon: Activity, tone: 'from-[#5e5ce6] to-[#bf5af2]' },
    { label: 'Guest messages today', value: k?.inbound_today ?? 0, icon: MessageSquare, tone: 'from-[#2aabee] to-[#0a84ff]' },
    { label: 'AI sessions (24 h)', value: k?.ai_sessions_24h ?? 0, icon: Bot, tone: 'from-[#ff6fa5] to-[#8b5cf6]' },
    { label: 'Handoffs to staff (24 h)', value: k?.handoffs_24h ?? 0, icon: TrendingUp, tone: 'from-[#ffd60a] to-[#ff9f0a]' },
    { label: 'Avg. task minutes (7 d)', value: k?.avg_task_minutes_7d ?? '—', icon: Clock, tone: 'from-[#30d158] to-[#0a84ff]' },
    { label: 'Tokens (24 h)', value: (k?.tokens_24h ?? 0).toLocaleString(), icon: Zap, tone: 'from-[#64d2ff] to-[#5e5ce6]' },
    { label: 'Rooms ready', value: `${k?.rooms_ready ?? 0}/${k?.rooms_total ?? 0}`, icon: BedDouble, tone: 'from-[#4cd964] to-[#1fa94a]' },
  ]

  const days = [...new Set(snap.daily.map((d) => d.day))].sort().slice(-7)
  const byDay = days.map((day) => {
    const rows = snap.daily.filter((d) => d.day === day)
    const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((n, r) => n + Number(r.messages), 0)
    return { day, guest: sum((r) => r.author_kind === 'guest'), ai: sum((r) => r.author_kind === 'ai' && r.direction === 'outbound'), staff: sum((r) => r.author_kind === 'operator' || r.author_kind === 'system') }
  })
  const maxDay = Math.max(1, ...byDay.map((d) => d.guest + d.ai + d.staff))

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-2">
      <ViewTitle crumb={['Analytics', 'Live']} sub="Aggregated from analytics.kpis, daily_messages and task_throughput — refreshed on every realtime event" />
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="card p-5">
          <div className="eyebrow">Operational health</div>
          <div className="mt-3 flex items-center gap-5">
            <MultiRing rings={rings} />
            <div className="space-y-3">
              {rings.map((r) => (
                <div key={r.label} className="text-[12.5px]">
                  <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: r.color }} />{r.label}</div>
                  <div className="pl-[18px] text-[18px] font-semibold tabular-nums">{Math.round(r.value * 100)}% <span className="text-[11.5px] font-normal text-fg-3">{r.detail}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="card animate-rise p-4">
              <div className={cx('grid size-8 place-items-center rounded-full bg-gradient-to-br text-white', m.tone)}><m.icon className="size-4" /></div>
              <div className="mt-3 text-[22px] font-semibold tabular-nums">{m.value}</div>
              <div className="text-[11.5px] text-fg-3">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="eyebrow">Messages per day (Tbilisi)</div>
          {byDay.length === 0 ? <div className="mt-6 text-[12.5px] text-fg-3">No messages yet.</div> : (
            <div className="mt-4 flex h-44 items-end gap-3">
              {byDay.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div className="flex w-full max-w-[72px] flex-col-reverse overflow-hidden rounded-lg bg-white/[0.04]" style={{ height: `calc(${((d.guest + d.ai + d.staff) / maxDay) * 100}% - 22px)`, minHeight: 4 }}>
                    <div className="bg-[#2aabee]" style={{ flex: d.guest }} />
                    <div className="bg-[#bf5af2]" style={{ flex: d.ai }} />
                    <div className="bg-[#ff9f0a]" style={{ flex: d.staff }} />
                  </div>
                  <div className="text-[10.5px] text-fg-3">{fmtDate(d.day, { day: 'numeric', month: 'short' })}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-4 text-[11.5px] text-fg-2">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#2aabee]" /> Guests</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#bf5af2]" /> AI replies</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#ff9f0a]" /> Staff & notices</span>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3"><div className="eyebrow">Task throughput</div></div>
          <table className="w-full text-left text-[12.5px]">
            <thead><tr className="text-[11px] text-fg-3">{['Day', 'Category', 'Created', 'Completed', 'Avg min'].map((h) => <th key={h} className="px-5 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {snap.throughput.slice(0, 8).map((t) => (
                <tr key={`${t.day}-${t.category}`} className="border-t border-line/60">
                  <td className="px-5 py-2 text-fg-2">{fmtDate(t.day)}</td>
                  <td className="px-5 py-2">{t.category.replace('_', ' & ')}</td>
                  <td className="px-5 py-2 tabular-nums">{t.created}</td>
                  <td className="px-5 py-2 tabular-nums">{t.completed}</td>
                  <td className="px-5 py-2 tabular-nums">{t.avg_minutes ?? '—'}</td>
                </tr>
              ))}
              {!snap.throughput.length && <tr><td colSpan={5} className="px-5 py-6 text-center text-fg-3">No tasks yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MultiRing({ rings }: { rings: Ring[] }) {
  const size = 150
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-label="KPI rings">
      {rings.map((r, i) => {
        const radius = 64 - i * 17
        const c = 2 * Math.PI * radius
        const v = Math.min(1, Math.max(0, r.value))
        return (
          <g key={r.label}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={r.color} strokeOpacity={0.15} strokeWidth={13} />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={r.color} strokeWidth={13} strokeLinecap="round"
              strokeDasharray={`${v * c} ${c}`} style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.2,0.8,0.2,1)' }} />
          </g>
        )
      })}
    </svg>
  )
}
