'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js'
import { Check, CircleAlert, Loader2, Lock, Sparkles, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import LeftRail from './LeftRail'
import Header, { type Note } from './Header'
import BottomDock from './BottomDock'
import AppsGrid from './AppsGrid'
import ContactCenterView, { ChatThread } from './ContactCenterView'
import CrmView from './CrmView'
import OperationsView from './OperationsView'
import DriveView from './DriveView'
import AiTeamView from './AiTeamView'
import AnalyticsView from './AnalyticsView'
import { APPS, HOME_APP, Avatar, cx, type OsActions, type OsContext, type Snapshot, type Staff, type ViewKey } from './ui'

const VIEWS: ViewKey[] = ['home', 'contact', 'crm', 'ops', 'drive', 'ai', 'analytics', 'builder', 'store']
const DOCK: ViewKey[] = ['home', 'contact', 'crm', 'ops', 'drive', 'ai', 'analytics']

function viewFromHash(): ViewKey {
  if (typeof window === 'undefined') return 'home'
  const v = window.location.hash.replace(/^#\/?/, '') as ViewKey
  return VIEWS.includes(v) ? v : 'home'
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(`${what}: ${error.message}`)
  return data ?? []
}

/** Loads the property snapshot through the browser client (RLS: only this staff member's properties are visible). */
async function loadSnapshot(sb: SupabaseClient, spaceId: string): Promise<Snapshot> {
  const p = sb.schema('platform'), cc = sb.schema('contact_center'), crm = sb.schema('guest_crm'), ops = sb.schema('ops'),
    kb = sb.schema('kb'), ai = sb.schema('ai_team'), an = sb.schema('analytics')
  const [space, staff, rooms, tasks, channels, conversations, chapters, messages, profiles, identities, stays, preferences,
    documents, chunks, agents, sessions, kpis, daily, throughput] = await Promise.all([
    rows(p.from('spaces').select('id, property_code, name, region, timezone, lifecycle').eq('id', spaceId), 'spaces'),
    rows(p.from('staff').select('id, space_id, display_name, role, user_id, enabled').eq('space_id', spaceId).order('display_name'), 'staff'),
    rows(ops.from('rooms').select('id, number, room_type, floor, cleaning_state, version, updated_at').eq('space_id', spaceId).order('number'), 'rooms'),
    rows(ops.from('tasks').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(200), 'tasks'),
    rows(cc.from('channels').select('id, kind, display_name, bot_username, enabled').eq('space_id', spaceId), 'channels'),
    rows(cc.from('conversations').select('*').eq('space_id', spaceId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(100), 'conversations'),
    rows(cc.from('chapters').select('id, conversation_id, number, title, stay_id, opened_at, closed_at').eq('space_id', spaceId), 'chapters'),
    rows(cc.from('messages').select('id, conversation_id, chapter_id, seq, direction, author_kind, author_name, body, evidence, session_id, external_message_id, delivery_status, delivery_error, created_at')
      .eq('space_id', spaceId).order('created_at', { ascending: false }).limit(1000), 'messages'),
    rows(crm.from('profiles').select('id, full_name, locale, phone_e164, email, contact_verified_at, loyalty_tier, provisional, created_at').eq('space_id', spaceId).order('full_name'), 'profiles'),
    rows(crm.from('identities').select('id, profile_id, channel, external_id, username, verified_at').eq('space_id', spaceId), 'identities'),
    rows(crm.from('stays').select('id, profile_id, room_id, arrival_date, departure_date, status, source').eq('space_id', spaceId).order('arrival_date'), 'stays'),
    rows(crm.from('preferences').select('id, profile_id, domain, label, value, sensitive, basis, evidence, status').eq('space_id', spaceId).eq('status', 'active'), 'preferences'),
    rows(kb.from('documents').select('id, doc_key, title, kind, folder, version, state, approved_by, approved_at, valid_during').eq('space_id', spaceId).order('title'), 'documents'),
    rows(kb.from('chunks').select('id, document_id, ordinal, content, structured, content_sha256, embedded_at, embedding_model').eq('space_id', spaceId).order('ordinal'), 'chunks'),
    rows(ai.from('agents').select('id, key, display_name, role, persona, instructions, model, thinking_level, enabled').eq('space_id', spaceId), 'agents'),
    rows(ai.from('sessions').select('*').eq('space_id', spaceId).order('started_at', { ascending: false }).limit(50), 'sessions'),
    rows(an.from('kpis').select('*').eq('space_id', spaceId), 'kpis'),
    rows(an.from('daily_messages').select('day, author_kind, direction, messages').eq('space_id', spaceId).order('day', { ascending: false }).limit(200), 'daily_messages'),
    rows(an.from('task_throughput').select('day, category, created, completed, avg_minutes').eq('space_id', spaceId).order('day', { ascending: false }).limit(100), 'task_throughput'),
  ])
  const recent = (sessions as Snapshot['sessions']).slice(0, 12).map((s) => s.id)
  const steps = recent.length
    ? await rows(ai.from('steps').select('id, session_id, seq, agent_key, kind, title, detail, created_at').in('session_id', recent).order('seq'), 'steps')
    : []
  if (!space.length) throw new Error('property not visible — is this account linked to platform.staff?')
  return {
    space: space[0], staff, rooms, tasks, channels, conversations, chapters, messages: (messages as Snapshot['messages']).reverse(),
    profiles, identities, stays, preferences, documents, chunks, agents, sessions, steps, kpis: (kpis[0] as Snapshot['kpis']) ?? null,
    daily, throughput,
  } as Snapshot
}

type Keyed = { id: string }
function upsert<T extends Keyed>(list: T[], row: T, prepend = false): T[] {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return prepend ? [row, ...list] : [...list, row]
  const next = list.slice(); next[i] = { ...list[i], ...row }; return next
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' }

export default function OsShell({ me, email }: { me: Staff; email: string }) {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const spaceId = me.space_id
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<ViewKey>('home')
  const [live, setLive] = useState<OsContext['live']>('connecting')
  const [online, setOnline] = useState<Set<string>>(() => new Set([me.id]))
  const [notes, setNotes] = useState<Note[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [flash, setFlash] = useState<Record<string, number>>({})
  const [miaOpen, setMiaOpen] = useState(false)
  const [seenInbound, setSeenInbound] = useState<number | null>(null)
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const load = useCallback(async () => {
    try { setSnap(await loadSnapshot(supabase, spaceId)); setLoadError(null) }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)) }
  }, [supabase, spaceId])

  const later = useCallback((key: string, fn: () => void, ms = 400) => {
    clearTimeout(debounce.current[key]); debounce.current[key] = setTimeout(fn, ms)
  }, [])

  const refreshAnalytics = useCallback(async () => {
    const an = supabase.schema('analytics')
    const [k, d, t] = await Promise.all([
      an.from('kpis').select('*').eq('space_id', spaceId),
      an.from('daily_messages').select('day, author_kind, direction, messages').eq('space_id', spaceId).order('day', { ascending: false }).limit(200),
      an.from('task_throughput').select('day, category, created, completed, avg_minutes').eq('space_id', spaceId).order('day', { ascending: false }).limit(100),
    ])
    setSnap((s) => s && ({ ...s, kpis: (k.data?.[0] as Snapshot['kpis']) ?? s.kpis, daily: (d.data as Snapshot['daily']) ?? s.daily, throughput: (t.data as Snapshot['throughput']) ?? s.throughput }))
  }, [supabase, spaceId])

  const notify = useCallback((n: Omit<Note, 'id' | 'at' | 'read'>) => {
    setNotes((l) => [{ id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), read: false, ...n }, ...l].slice(0, 40))
  }, [])

  // ---------------------------------------------------------------- initial load, hash routing
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setView(viewFromHash())
    const on = () => setView(viewFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((v: ViewKey) => { window.location.hash = `/${v}`; setView(v) }, [])

  // ---------------------------------------------------------------- realtime: postgres_changes (RLS-filtered) + presence
  useEffect(() => {
    const filter = `space_id=eq.${spaceId}`
    const channel = supabase.channel(`space:${spaceId}`, { config: { presence: { key: me.id } } })
    const apply = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const table = payload.table
      const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown> & Keyed
      if (!row?.id) return
      setSnap((s) => {
        if (!s) return s
        switch (table) {
          case 'messages': return { ...s, messages: upsert(s.messages, row as unknown as Snapshot['messages'][number]) }
          case 'conversations': return { ...s, conversations: upsert(s.conversations, row as unknown as Snapshot['conversations'][number], true) }
          case 'tasks': return { ...s, tasks: upsert(s.tasks, row as unknown as Snapshot['tasks'][number], true) }
          case 'rooms': return { ...s, rooms: upsert(s.rooms, row as unknown as Snapshot['rooms'][number]) }
          case 'sessions': return { ...s, sessions: upsert(s.sessions, row as unknown as Snapshot['sessions'][number], true) }
          case 'steps': return { ...s, steps: upsert(s.steps, row as unknown as Snapshot['steps'][number]) }
          default: return s
        }
      })
      if (table === 'messages' && payload.eventType === 'INSERT' && row.direction === 'inbound') {
        notify({ tone: 'info', title: `New Telegram message · ${String(row.author_name)}`, body: String(row.body), view: 'contact' })
      }
      if (table === 'tasks') {
        setFlash((f) => ({ ...f, [`task:${row.id}`]: Date.now() }))
        if (payload.eventType === 'INSERT') notify({ tone: 'warn', title: 'New service task', body: String(row.title), view: 'ops' })
        if (payload.eventType === 'UPDATE' && row.status === 'COMPLETED') notify({ tone: 'ok', title: 'Task attested complete', body: String(row.title), view: 'ops' })
      }
      if (table === 'rooms') {
        setFlash((f) => ({ ...f, [`room:${row.id}`]: Date.now() }))
        notify({ tone: row.cleaning_state === 'CLEAN' ? 'ok' : 'muted', title: `Room ${String(row.number)} · ${String(row.cleaning_state).toLowerCase()}`, body: 'Turnover status changed', view: 'ops' })
      }
      if (table === 'sessions' && row.state === 'HANDED_TO_HUMAN') {
        notify({ tone: 'alert', title: 'Operator required', body: 'Mia handed a conversation to the front desk', view: 'contact' })
      }
      if (table === 'conversations' && payload.eventType === 'INSERT') later('full', load, 800)   // new guest: chapters/profile too
      if (table === 'messages' || table === 'tasks' || table === 'rooms' || table === 'sessions') later('analytics', refreshAnalytics, 700)
    }
    for (const [schema, table] of [['contact_center', 'messages'], ['contact_center', 'conversations'], ['ops', 'tasks'], ['ops', 'rooms'], ['ai_team', 'sessions'], ['ai_team', 'steps']] as const) {
      channel.on('postgres_changes', { event: '*', schema, table, filter }, apply)
    }
    channel.on('presence', { event: 'sync' }, () => setOnline(new Set([me.id, ...Object.keys(channel.presenceState())])))
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setLive('live')
        await channel.track({ staff_id: me.id, name: me.display_name, online_at: new Date().toISOString() })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setLive('polling')
      }
    })
    const fallback = setTimeout(() => setLive((l) => (l === 'connecting' ? 'polling' : l)), 10_000)
    return () => { clearTimeout(fallback); supabase.removeChannel(channel) }
  }, [supabase, spaceId, me.id, me.display_name, notify, later, load, refreshAnalytics])

  // Realtime unavailable → keep the console current by polling.
  useEffect(() => {
    if (live !== 'polling') return
    const t = setInterval(load, 12_000)
    return () => clearInterval(t)
  }, [live, load])

  // ---------------------------------------------------------------- actions
  const post = useCallback(async <T,>(path: string, body: unknown, okMessage?: string): Promise<T | null> => {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast(json.error ?? `Request failed (${res.status})`, 'error'); return null }
      if (okMessage) toast(okMessage)
      if (live !== 'live') later('full', load, 300)
      return json as T
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Network error', 'error')
      return null
    }
  }, [toast, live, later, load])

  const actions: OsActions = useMemo(() => ({ post, go, toast, refresh: load }), [post, go, toast, load])

  const inbound = snap ? snap.messages.filter((m) => m.direction === 'inbound').length : 0
  useEffect(() => { if (snap && (seenInbound === null || view === 'contact' || miaOpen)) setSeenInbound(inbound) }, [snap, inbound, view, miaOpen, seenInbound])
  const unread = seenInbound === null ? 0 : Math.max(0, inbound - seenInbound)

  if (!snap) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="card w-full max-w-sm animate-pop p-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#5e5ce6] to-[#bf5af2]"><Sparkles className="size-6 text-white" /></div>
          {loadError ? (
            <>
              <div className="mt-4 text-[15px] font-semibold">Workspace could not be loaded</div>
              <p className="mt-1.5 text-[12.5px] text-fg-2">{loadError}</p>
              <p className="mt-2 text-[12px] text-fg-3">Check that db/supabase_master_schema.sql is installed and the Smartstay schemas are exposed in Data API settings.</p>
              <button onClick={load} className="btn btn-primary mt-4">Retry</button>
            </>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-fg-2"><Loader2 className="size-4 animate-spin" /> Loading Chateau Telavi…</div>
          )}
        </div>
      </div>
    )
  }

  const ctx: OsContext = { snap, me, live, online, actions }
  const openTasks = snap.tasks.filter((t) => ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status)).length
  const current = APPS.find((a) => a.key === view) ?? HOME_APP

  return (
    <div className="flex h-full overflow-hidden">
      <LeftRail ctx={ctx} onOpenMia={() => setMiaOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header ctx={ctx} title={current.key === 'home' ? 'Workspace' : current.title} email={email} notes={notes}
          onReadAll={() => setNotes((l) => l.map((n) => ({ ...n, read: true })))} onClear={() => setNotes([])} />
        <main key={view} className="min-h-0 flex-1 animate-fade overflow-y-auto px-4 pb-28 sm:px-6">
          {view === 'home' && <AppsGrid ctx={ctx} unread={unread} />}
          {view === 'contact' && <ContactCenterView ctx={ctx} />}
          {view === 'crm' && <CrmView ctx={ctx} />}
          {view === 'ops' && <OperationsView ctx={ctx} flash={flash} />}
          {view === 'drive' && <DriveView ctx={ctx} />}
          {view === 'ai' && <AiTeamView ctx={ctx} />}
          {view === 'analytics' && <AnalyticsView ctx={ctx} />}
          {(view === 'builder' || view === 'store') && <NotInstalled appKey={view} onBack={() => go('home')} />}
        </main>
      </div>
      <BottomDock items={DOCK.map((k) => (k === 'home' ? HOME_APP : APPS.find((a) => a.key === k)!))} active={view} onSelect={go}
        badges={{ contact: unread, ops: openTasks }} />
      {miaOpen && <MiaDrawer ctx={ctx} onClose={() => setMiaOpen(false)} />}
      <div className="pointer-events-none fixed bottom-28 right-5 z-50 flex w-80 flex-col-reverse gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="glass flex animate-slide-in items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[12.5px]">
            {t.tone === 'error' ? <CircleAlert className="mt-px size-4 shrink-0 text-rose-400" /> : <Check className="mt-px size-4 shrink-0 text-emerald-400" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NotInstalled({ appKey, onBack }: { appKey: ViewKey; onBack: () => void }) {
  const app = APPS.find((a) => a.key === appKey)!
  const Icon = app.icon
  return (
    <div className="grid h-full place-items-center">
      <div className="card max-w-md animate-pop p-8 text-center">
        <div className={cx('mx-auto grid size-16 place-items-center rounded-full', app.color)}><Icon className="size-7" /></div>
        <div className="mt-4 text-lg font-semibold">{app.title}</div>
        <p className="mt-1 text-[13px] text-fg-2">{app.desc}.</p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-fg-3"><Lock className="size-3.5" /> Not installed in this workspace.</p>
        <button onClick={onBack} className="btn btn-soft mt-5">Back to Apps</button>
      </div>
    </div>
  )
}

function MiaDrawer({ ctx, onClose }: { ctx: OsContext; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const conversation = ctx.snap.conversations[0] ?? null
  return (
    <div className="fixed inset-0 z-40 flex animate-fade justify-end bg-black/30 backdrop-blur-xs" onClick={onClose}>
      <aside className="glass m-3 flex w-full max-w-[440px] animate-slide-in flex-col overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name="Mia" size={36} gradient={['#ff6fa5', '#8b5cf6']} badge={<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-300 ring-2 ring-card"><Sparkles className="size-2.5 text-amber-900" /></span>} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold">Mia · Front-Desk Concierge</div>
            <div className="truncate text-[11.5px] text-fg-3">Quick chat · latest conversation</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <ChatThread ctx={ctx} conversation={conversation} compact />
      </aside>
    </div>
  )
}
