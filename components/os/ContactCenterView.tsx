'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Bot, Building2, Camera, Check, CheckCheck, ChevronDown, CircleAlert, Clock, FileCheck2, Hand, Hash, Inbox, Loader2, Lock, Mail,
  MessageCircle, MessageSquare, Phone, Play, Search, Send, ShieldCheck, Sparkles, UserRound, Wine, type LucideIcon,
} from 'lucide-react'
import { DEMO_INQUIRY } from './AppsGrid'
import { APPS, Avatar, Empty, cx, fmtDate, fmtTime, type Conversation, type Message, type OsContext, type Snapshot } from './ui'

type Status = 'ai' | 'resolved' | 'operator_required' | 'operator_live' | 'ai_active'
const STATUS: Record<Status, { label: string; cls: string; icon: LucideIcon }> = {
  ai: { label: 'AI Replying', cls: 'tone-ai', icon: Sparkles },
  resolved: { label: 'Resolved', cls: 'tone-ok', icon: Check },
  operator_required: { label: 'Operator required', cls: 'tone-alert', icon: UserRound },
  operator_live: { label: 'Operator live', cls: 'tone-info', icon: Hand },
  ai_active: { label: 'AI active', cls: 'tone-violet', icon: Bot },
}
const CHANNELS: { key: string; label: string; icon: LucideIcon; dot: string }[] = [
  { key: 'telegram', label: 'Telegram', icon: Send, dot: 'bg-[#2aabee]' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, dot: 'bg-[#25d366]' },
  { key: 'instagram', label: 'Instagram', icon: Camera, dot: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]' },
  { key: 'messenger', label: 'Messenger', icon: MessageCircle, dot: 'bg-gradient-to-br from-[#00b2ff] to-[#a033ff]' },
  { key: 'phone', label: 'Phone', icon: Phone, dot: 'bg-[#30d158]' },
  { key: 'email', label: 'Email', icon: Mail, dot: 'bg-[#8e8e93]' },
]
const QUICK: { label: string; icon: LucideIcon; text: string }[] = [
  { label: 'Late checkout', icon: Clock, text: 'Hi! Could I get a late checkout on Sunday?' },
  { label: 'Tasting policy', icon: FileCheck2, text: "Can I cancel tomorrow's cellar tasting without a fee?" },
  { label: 'Wine price', icon: Wine, text: 'How much is the Saperavi 2022 and does it contain any allergens?' },
  { label: 'Unsupported ask', icon: CircleAlert, text: 'Can you book me a helicopter to Tbilisi airport?' },
]
const AGENT_NAME: Record<string, string> = { mia: 'Mia', sommelier: 'Sommelier', coordinator: 'Operations Coordinator' }

export function conversationStatus(snap: Snapshot, c: Conversation): Status {
  if (c.state === 'OPERATOR_LOCKED') return 'operator_live'
  const s = snap.sessions.filter((x) => x.conversation_id === c.id).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  if (s?.state === 'RUNNING') return 'ai'
  const urgent = snap.tasks.some((t) => t.conversation_id === c.id && t.category === 'front_desk' && ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status))
  if (urgent || s?.state === 'HANDED_TO_HUMAN' || s?.state === 'FAILED') return 'operator_required'
  if (s?.state === 'COMPLETED') return 'resolved'
  return 'ai_active'
}

function guestName(snap: Snapshot, c: Conversation) {
  return snap.profiles.find((p) => p.id === c.profile_id)?.full_name ?? 'Unknown guest'
}

/** Contact Center: inbox filters, channel pills, live conversation list with AI/Operator status, transcript and takeover. */
export default function ContactCenterView({ ctx }: { ctx: OsContext }) {
  const { snap } = ctx
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [q, setQ] = useState('')

  const telegramIds = new Set(snap.channels.filter((c) => c.kind === 'telegram').map((c) => c.id))
  const withStatus = snap.conversations.map((c) => ({ c, status: conversationStatus(snap, c) }))
  const shown = withStatus.filter(({ c, status }) => {
    if (filter !== 'all' && status !== filter && !(filter === 'ai' && status === 'ai_active')) return false
    if (!q) return true
    const last = snap.messages.filter((m) => m.conversation_id === c.id).at(-1)?.body ?? ''
    return `${guestName(snap, c)} ${last}`.toLowerCase().includes(q.toLowerCase())
  })
  const current = snap.conversations.find((c) => c.id === selected) ?? shown[0]?.c ?? null
  const count = (s: Status | 'all') => (s === 'all' ? withStatus.length : withStatus.filter((x) => x.status === s || (s === 'ai' && x.status === 'ai_active')).length)

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 pt-1 lg:grid-cols-[330px_minmax(0,1fr)] xl:grid-cols-[210px_330px_minmax(0,1fr)]">
      <aside className="card hidden flex-col overflow-y-auto p-3 xl:flex">
        <div className="eyebrow px-2 pb-2 pt-1">Business Apps</div>
        {APPS.filter((a) => a.installed).map((a) => (
          <button key={a.key} onClick={() => ctx.actions.go(a.key)} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[12.5px] transition', a.key === 'contact' ? 'bg-white/[0.07] font-semibold' : 'text-fg-2 hover:bg-white/[0.04] hover:text-fg')}>
            <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', a.color)}><a.icon className="size-3.5" /></span>{a.title}
          </button>
        ))}
        <div className="eyebrow px-2 pb-2 pt-5">Inbox</div>
        {([['all', 'All conversations', Inbox], ['ai', 'AI handling', Sparkles], ['operator_required', 'Needs operator', CircleAlert], ['operator_live', 'Operator live', Hand], ['resolved', 'Resolved', Check]] as [Status | 'all', string, LucideIcon][]).map(([k, label, I]) => (
          <button key={k} onClick={() => setFilter(k)} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[12.5px] transition', filter === k ? 'bg-accent/15 font-semibold text-accent' : 'text-fg-2 hover:bg-white/[0.04]')}>
            <I className="size-4" /><span className="flex-1">{label}</span><span className="text-[11px] tabular-nums opacity-70">{count(k)}</span>
          </button>
        ))}
      </aside>

      <section className="card flex min-h-[420px] flex-col overflow-hidden">
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[15px] font-semibold">Conversations</div>
            <span className="text-[11.5px] text-fg-3">{shown.length} of {withStatus.length}</span>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guests or messages" className="input py-2 pl-9 text-[13px]" />
          </label>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {CHANNELS.map((ch) => {
              const connected = ch.key === 'telegram' && telegramIds.size > 0
              const n = connected ? snap.conversations.length : 0
              return (
                <span key={ch.key} title={connected ? 'Connected' : 'Not connected in this workspace'}
                  className={cx('flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11.5px] font-medium ring-1', connected ? 'bg-white/[0.06] text-fg ring-white/15' : 'text-fg-3 opacity-60 ring-line')}>
                  <span className={cx('grid size-5 place-items-center rounded-full text-white', ch.dot)}><ch.icon className="size-3" /></span>
                  {ch.label}
                  {connected && n > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{n}</span>}
                </span>
              )
            })}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {shown.length === 0 && (
            <Empty icon={Inbox} title="No conversations yet">Guests appear here when they message the Telegram bot, or press “Simulate Guest Inquiry”.</Empty>
          )}
          {shown.map(({ c, status }) => {
            const last = snap.messages.filter((m) => m.conversation_id === c.id).at(-1)
            const st = STATUS[status]
            const profile = snap.profiles.find((p) => p.id === c.profile_id)
            const stay = snap.stays.find((s) => s.profile_id === c.profile_id && ['BOOKED', 'IN_HOUSE'].includes(s.status))
            const room = snap.rooms.find((r) => r.id === stay?.room_id)
            const simulated = c.external_chat_id.startsWith('sim-')
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cx('flex w-full animate-rise gap-3 rounded-xl p-2.5 text-left transition', current?.id === c.id ? 'bg-accent/[0.12] ring-1 ring-accent/30' : 'hover:bg-white/[0.04]')}>
                <span className="relative">
                  <Avatar name={guestName(snap, c)} size={40} />
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-[#2aabee] text-white ring-2 ring-card"><Send className="size-2.5" /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{guestName(snap, c)}</span>
                    {simulated && <span className="pill tone-muted py-0 text-[9.5px]">SIM</span>}
                    <span className="ml-auto shrink-0 text-[10.5px] text-fg-3">{fmtTime(last?.created_at ?? c.last_message_at)}</span>
                  </span>
                  <span className="block truncate text-[11px] text-fg-3">
                    {room ? `Room ${room.number}` : 'No active stay'}{profile?.loyalty_tier ? ` · ${profile.loyalty_tier}` : ''}{profile?.provisional ? ' · new contact' : ''}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-fg-2">{last?.body ?? '—'}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <span className={cx('pill py-0.5 text-[10.5px]', st.cls)}><st.icon className={cx('size-3', status === 'ai' && 'animate-pulse-soft')} /> {st.label}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="card flex min-h-[520px] min-w-0 flex-col overflow-hidden">
        {current ? <Transcript ctx={ctx} conversation={current} /> : (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-sm text-center">
              <Sparkles className="mx-auto mb-2 size-6 text-[#bf5af2]" />
              <div className="text-[14px] font-semibold">No conversation selected</div>
              <p className="mt-1 text-[12.5px] text-fg-3">Message the hotel&apos;s Telegram bot, or simulate a guest inquiry to see Mia, the Sommelier and the Operations Coordinator work.</p>
              <SimulateBar ctx={ctx} profileId={null} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Transcript({ ctx, conversation }: { ctx: OsContext; conversation: Conversation }) {
  const { snap } = ctx
  const [chapterOpen, setChapterOpen] = useState(false)
  const status = STATUS[conversationStatus(snap, conversation)]
  const identity = snap.identities.find((i) => i.profile_id === conversation.profile_id && i.channel === 'telegram' && !i.external_id.startsWith('sim-'))
  const chapters = snap.chapters.filter((c) => c.conversation_id === conversation.id).sort((a, b) => a.number - b.number)
  const [chapterId, setChapterId] = useState<string | 'all'>('all')
  const chapter = chapters.find((c) => c.id === chapterId)
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <Avatar name={guestName(snap, conversation)} size={38} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] font-semibold">{guestName(snap, conversation)}</div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
            <span className="size-2 rounded-full bg-[#2aabee]" /> Telegram{identity?.username ? ` · @${identity.username}` : ''}{conversation.external_chat_id.startsWith('sim-') ? ' · simulated' : ''}
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setChapterOpen((o) => !o)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-fg-2 ring-1 ring-line transition hover:bg-white/[0.05]">
            <Hash className="size-3.5" /> {chapter ? `Chapter ${chapter.number}` : chapters.length ? `Chapter ${chapters.at(-1)!.number}` : 'Chapter 1'} <ChevronDown className={cx('size-3.5 transition', chapterOpen && 'rotate-180')} />
          </button>
          {chapterOpen && (
            <div className="popover absolute left-0 top-full z-30 mt-1.5 w-72 animate-pop">
              <div className="eyebrow px-2.5 pb-1 pt-1.5">Semantic chapters</div>
              <button onClick={() => { setChapterId('all'); setChapterOpen(false) }} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-white/[0.05]', chapterId === 'all' && 'bg-white/[0.05]')}>
                <Hash className="size-3.5 text-fg-3" /><span className="flex-1">All chapters</span>{chapterId === 'all' && <Check className="size-3.5 text-emerald-400" />}
              </button>
              {chapters.map((c) => (
                <button key={c.id} onClick={() => { setChapterId(c.id); setChapterOpen(false) }} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-white/[0.05]', chapterId === c.id && 'bg-white/[0.05]')}>
                  <Hash className="size-3.5 text-accent" /><span className="flex-1">Chapter {c.number} · {c.title}</span>{chapterId === c.id && <Check className="size-3.5 text-emerald-400" />}
                </button>
              ))}
              <div className="px-2.5 py-2 text-[11px] text-fg-3">Chapters group a guest&apos;s dialogue by stay.</div>
            </div>
          )}
        </div>
        <span className={cx('pill ml-auto', status.cls)}><status.icon className="size-3" /> {status.label}</span>
      </div>
      <ChatThread ctx={ctx} conversation={conversation} chapterId={chapterId === 'all' ? null : chapterId} />
    </>
  )
}

/** Transcript + reasoning ticker + takeover bar + composer. Also used by the Mia quick-chat drawer. */
export function ChatThread({ ctx, conversation, chapterId = null, compact = false }: {
  ctx: OsContext; conversation: Conversation | null; chapterId?: string | null; compact?: boolean
}) {
  const { snap, me } = ctx
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const messages = useMemo(() => conversation
    ? snap.messages.filter((m) => m.conversation_id === conversation.id && (!chapterId || m.chapter_id === chapterId)).sort((a, b) => a.seq - b.seq)
    : [], [snap.messages, conversation, chapterId])
  const session = conversation ? snap.sessions.filter((s) => s.conversation_id === conversation.id).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] : undefined
  const running = session?.state === 'RUNNING'
  const lastStep = running ? snap.steps.filter((s) => s.session_id === session!.id).sort((a, b) => a.seq - b.seq).at(-1) : undefined
  const locked = conversation?.state === 'OPERATOR_LOCKED'
  const mine = locked && conversation?.owner_staff_id === me.id
  const owner = snap.staff.find((s) => s.id === conversation?.owner_staff_id)
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [messages.length, running, lastStep?.id])

  async function toggle() {
    if (!conversation) return
    setBusy(true)
    await ctx.actions.post('/api/chat', { action: locked ? 'release' : 'takeover', conversation_id: conversation.id },
      locked ? 'Mia is handling the conversation again' : 'You took over — Mia is paused for this conversation')
    setBusy(false)
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    setBusy(true)
    if (mine && conversation) {
      const r = await ctx.actions.post('/api/chat', { action: 'reply', conversation_id: conversation.id, text: v })
      if (r) setText('')
    } else {
      const r = await ctx.actions.post('/api/chat', { action: 'simulate', text: v, profile_id: conversation?.profile_id ?? undefined })
      if (r) setText('')
    }
    setBusy(false)
  }

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {!conversation && <Empty icon={MessageCircle} title="No conversation yet">Simulate a guest inquiry to start one.</Empty>}
        {messages.length > 0 && <DayDivider label={`${fmtDate(messages[0].created_at, { weekday: 'short', day: 'numeric', month: 'short' })}`} />}
        {messages.map((m) => <Bubble key={m.id} m={m} onEvidence={() => ctx.actions.go('ai')} />)}
        {running && !locked && (
          <div className="flex animate-rise items-center gap-2">
            <span className="flex gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-2.5">
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-[#bf5af2]" style={{ animationDelay: `${i * 120}ms` }} />)}
            </span>
            <span className="text-[11.5px] text-fg-3">Mia is replying…</span>
          </div>
        )}
      </div>

      {running && lastStep && (
        <button onClick={() => ctx.actions.go('ai')} className="mx-3 mb-2 flex animate-fade items-center gap-2 rounded-xl bg-cyan-500/10 px-3 py-2 text-left text-[12px] ring-1 ring-cyan-500/25">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-cyan-400" />
          <span className="font-semibold text-cyan-300">{AGENT_NAME[lastStep.agent_key] ?? lastStep.agent_key}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{lastStep.title}</span>
          {!compact && <span className="shrink-0 text-accent">Reasoning ›</span>}
        </button>
      )}

      <div className="space-y-2.5 border-t border-line p-3">
        {conversation && (
          <div className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ring-1', locked ? 'bg-blue-500/10 text-blue-200 ring-blue-500/25' : 'bg-white/[0.03] text-fg-2 ring-line')}>
            {locked ? <Lock className="size-3.5 shrink-0" /> : <Bot className="size-3.5 shrink-0" />}
            <span className="min-w-0 flex-1">
              {locked ? (mine ? 'You are handling this conversation. Mia is paused; a reply she had in progress is kept as a private draft.' : `${owner?.display_name ?? 'A colleague'} is handling this conversation. Mia is paused.`) : 'Mia (AI) is handling this conversation.'}
            </span>
            <button onClick={toggle} disabled={busy || (locked && !mine)} role="switch" aria-checked={locked}
              className={cx('flex items-center gap-2 rounded-full py-1 pl-2.5 pr-1 text-[11.5px] font-semibold ring-1 transition', locked ? 'bg-blue-500/15 ring-blue-500/30' : 'ring-line hover:bg-white/[0.05]')}>
              {locked ? 'Hand back to Mia' : 'Take over'}
              <span className={cx('relative h-5 w-9 rounded-full transition-colors duration-300', locked ? 'bg-blue-500' : 'bg-white/15')}>
                <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all duration-300', locked ? 'left-[18px]' : 'left-0.5')} />
              </span>
            </button>
          </div>
        )}
        {!mine && <SimulateBar ctx={ctx} profileId={conversation?.profile_id ?? null} />}
        <form onSubmit={submit} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy || (locked && !mine)} className="input"
            placeholder={mine ? `Reply to ${conversation ? guestName(snap, conversation).split(' ')[0] : 'guest'} on Telegram…` : 'Type as the guest to simulate a message…'} />
          <button disabled={!text.trim() || busy || (locked && !mine)} aria-label="Send" className="btn btn-primary size-10 shrink-0 rounded-full p-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </>
  )
}

function SimulateBar({ ctx, profileId }: { ctx: OsContext; profileId: string | null }) {
  const [busy, setBusy] = useState(false)
  async function send(text: string) {
    setBusy(true)
    await ctx.actions.post('/api/chat', { action: 'simulate', text, profile_id: profileId ?? undefined }, 'Simulated guest message sent')
    setBusy(false)
  }
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 first:mt-0">
      <button onClick={() => send(DEMO_INQUIRY)} disabled={busy} className="btn btn-primary">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Simulate Guest Inquiry
      </button>
      {QUICK.map((q) => (
        <button key={q.label} onClick={() => send(q.text)} disabled={busy} title={q.text}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] text-fg-2 ring-1 ring-line transition hover:bg-white/[0.05] hover:text-fg disabled:opacity-40">
          <q.icon className="size-3" /> {q.label}
        </button>
      ))}
    </div>
  )
}

function DayDivider({ label }: { label: string }) {
  return <div className="flex items-center gap-3 py-1 text-[10.5px] font-medium uppercase tracking-wide text-fg-3"><span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" /></div>
}

function Bubble({ m, onEvidence }: { m: Message; onEvidence: () => void }) {
  if (m.direction === 'internal') {
    return (
      <div className="mx-auto max-w-[92%] animate-rise rounded-2xl border border-dashed border-[#bf5af2]/50 bg-[#bf5af2]/[0.06] px-3.5 py-2.5 text-[12.5px]">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#bf5af2]"><Sparkles className="size-3" /> Private AI draft · not sent</div>
        <div className="whitespace-pre-wrap text-fg-2">{m.body}</div>
      </div>
    )
  }
  const inbound = m.direction === 'inbound'
  const kind = m.author_kind
  const Delivery = m.delivery_status === 'SENT' ? CheckCheck : m.delivery_status === 'FAILED' ? CircleAlert : Clock
  return (
    <div className={cx('flex animate-rise', inbound ? 'justify-start' : 'justify-end')}>
      <div className={cx('max-w-[82%] rounded-[20px] px-3.5 py-2 text-[13.5px] leading-relaxed',
        inbound ? 'rounded-bl-md bg-white/[0.07] text-fg'
          : kind === 'ai' ? 'rounded-br-md bg-gradient-to-br from-[#7d5cf6] to-[#4f6bf5] text-white shadow-[0_10px_24px_-14px_#6d5cf6]'
            : kind === 'operator' ? 'rounded-br-md bg-accent text-white'
              : 'rounded-br-md bg-card text-fg ring-1 ring-line')}>
        {!inbound && (
          <div className={cx('mb-0.5 flex items-center gap-1 text-[10.5px] font-semibold', kind === 'system' ? 'text-fg-3' : 'text-white/80')}>
            {kind === 'ai' ? <Sparkles className="size-3" /> : kind === 'operator' ? <UserRound className="size-3" /> : <Building2 className="size-3" />} {m.author_name}
          </div>
        )}
        <div className="whitespace-pre-wrap">{m.body}</div>
        <div className={cx('mt-1 flex items-center justify-end gap-1.5 text-[10px]', inbound || kind === 'system' ? 'text-fg-3' : 'text-white/70')}>
          {m.evidence?.length > 0 && (
            <button onClick={onEvidence} className="inline-flex items-center gap-0.5 hover:underline" title="View grounding in AI Team">
              <ShieldCheck className="size-3" /> {m.evidence.length} source{m.evidence.length > 1 ? 's' : ''}
            </button>
          )}
          {fmtTime(m.created_at)}
          {!inbound && <span title={m.delivery_error ?? m.delivery_status}><Delivery className={cx('size-3', m.delivery_status === 'FAILED' && 'text-rose-300')} /></span>}
        </div>
      </div>
    </div>
  )
}
