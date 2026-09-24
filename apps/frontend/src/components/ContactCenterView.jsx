import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, Building2, Camera, Check, CheckCheck, ChevronDown, CircleAlert, Clock, FileCheck2, Hand, Hash, Inbox, Loader2, Lock, Mail,
  MessageCircle, MessageSquare, Phone, Play, Search, Send, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react'
import { APPS, Avatar, DEMO_INQUIRY, OPERATOR, api, cx, fmtDate, fmtTime } from '../App.jsx'

export const CHANNELS = {
  instagram: { label: 'Instagram', icon: Camera, dot: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]' },
  messenger: { label: 'Messenger', icon: MessageCircle, dot: 'bg-gradient-to-br from-[#00b2ff] to-[#a033ff]' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, dot: 'bg-[#25d366]' },
  telegram: { label: 'Telegram', icon: Send, dot: 'bg-[#2aabee]' },
  phone: { label: 'Phone', icon: Phone, dot: 'bg-[#30d158]' },
  email: { label: 'Email', icon: Mail, dot: 'bg-[#8e8e93]' },
}
export const STATUS = {
  ai: { label: 'AI Replying', cls: 'tone-ai', icon: Sparkles },
  resolved: { label: 'Resolved', cls: 'tone-ok', icon: Check },
  operator_required: { label: 'Operator required', cls: 'tone-alert', icon: CircleAlert },
  operator_live: { label: 'Operator live', cls: 'tone-info', icon: Hand },
  ai_active: { label: 'AI active', cls: 'tone-violet', icon: Bot },
}
// Secondary quick actions (the primary "Simulate Guest Inquiry" button sends DEMO_INQUIRY). Values imported from App.jsx
// are only read at render time: App.jsx imports this module, so its constants are not initialised at module load.
const QUICK = [
  { label: 'Late checkout', icon: Clock, text: 'Hi! Could I get a late checkout on Sunday?' },
  { label: 'Tasting policy', icon: FileCheck2, text: "Can I cancel tomorrow's cellar tasting without a fee?" },
  { label: 'Unsupported ask', icon: CircleAlert, text: 'Can you book me a helicopter to Tbilisi airport?' },
]
const AGENT_NAME = { mia: 'Mia', sommelier: 'Sommelier', ops: 'Operations Coordinator' }

// Preview threads that show the multi-channel inbox; they are static and never sent to the backend.
const t = (m) => new Date(Date.now() - m * 60000).toISOString()
const SAMPLES = [
  { id: 's1', name: 'Dianne Russell', channel: 'instagram', note: 'Garden Suite · arriving Fri', status: 'ai', unread: 2, at: t(4),
    messages: [['guest', 'Hi! Is the spa open late on Saturdays?', 6], ['ai', 'Hello Dianne! Let me check the current spa schedule for you.', 4], ['guest', 'Also, can I book a couples massage?', 4]] },
  { id: 's2', name: 'Ahmed Al-Farsi', channel: 'phone', note: 'Villa 2 · VIP', status: 'operator_required', unread: 1, at: t(12),
    messages: [['guest', 'Call summary: needs an airport transfer at 04:00 tomorrow, two large suitcases.', 13], ['system', 'Transport requests outside 06:00-23:00 need a staff member. Routed to the front desk.', 12]] },
  { id: 's3', name: 'Marco Bellini', channel: 'telegram', note: 'Room 305 · in-house', status: 'resolved', unread: 0, at: t(38),
    messages: [['guest', 'The qvevri tasting was wonderful, thank you!', 41], ['ai', "So glad you enjoyed it, Marco! I've noted your interest in amber wines for your next visit.", 38]] },
  { id: 's4', name: 'Sophie Laurent', channel: 'email', note: 'Group enquiry · 12 guests', status: 'ai', unread: 0, at: t(64),
    messages: [['guest', 'Could we get a quote for a private cellar dinner for 12 people in October?', 70], ['ai', 'Thank you, Sophie - I am preparing the group dinner options and our events team will confirm pricing.', 64]] },
  { id: 's5', name: 'Hannah Weber', channel: 'messenger', note: 'Room 108 · checked out', status: 'resolved', unread: 0, at: t(180),
    messages: [['guest', 'I think I left a scarf in my room', 200], ['operator', 'Hi Hannah, we found it! Housekeeping will post it to your home address today.', 180]] },
]

function liveStatus(ov, session) {
  if (ov.conversation.state === 'OPERATOR_LOCKED') return 'operator_live'
  if (session?.state === 'RUNNING') return 'ai'
  if (session?.state === 'HANDED_TO_HUMAN') return 'operator_required'
  if (session?.state === 'COMPLETED') return 'resolved'
  return 'ai_active'
}

export default function ContactCenterView({ ctx }) {
  const { ov, session } = ctx
  const [channel, setChannel] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [selected, setSelected] = useState('live')
  const [q, setQ] = useState('')
  const last = ov.messages[ov.messages.length - 1]
  const liveConv = {
    id: 'live', live: true, name: ov.guest.full_name, channel: ov.conversation.channel, note: `Room ${ov.guest.room_number} · ${ov.guest.loyalty_tier} · ${ov.guest.stay_status.toLowerCase().replace('_', '-')}`,
    status: liveStatus(ov, session), unread: ctx.unreadChats, at: last?.created_at, snippet: last?.body,
  }
  const convs = [liveConv, ...SAMPLES.map((s) => ({ ...s, snippet: s.messages[s.messages.length - 1][1] }))]
  const shown = convs.filter((c) => (!channel || c.channel === channel) && (!statusFilter || c.status === statusFilter || (statusFilter === 'ai' && c.status === 'ai_active'))
    && (!q || (c.name + c.snippet).toLowerCase().includes(q.toLowerCase())))
  const current = convs.find((c) => c.id === selected) || liveConv
  const counts = Object.fromEntries(Object.keys(CHANNELS).map((k) => [k, convs.filter((c) => c.channel === k).reduce((a, c) => a + (c.unread || 0), 0)]))

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 pt-1 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[210px_340px_minmax(0,1fr)]">
      {/* Business apps + inbox filters */}
      <aside className="card hidden flex-col overflow-y-auto p-3 xl:flex">
        <div className="eyebrow px-2 pt-1 pb-2">Business Apps</div>
        {APPS.filter((a) => a.key !== 'store').map((a) => (
          <button key={a.key} onClick={() => ctx.go(a.key)} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[12.5px] transition', a.key === 'contact' ? 'bg-fg/[0.07] font-semibold' : 'text-fg-2 hover:bg-fg/[0.04] hover:text-fg')}>
            <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', a.color)}><a.icon className="size-3.5" /></span>{a.title}
          </button>
        ))}
        <div className="eyebrow px-2 pt-5 pb-2">Inbox</div>
        {[[null, 'All conversations', Inbox, convs.length], ['ai', 'AI handling', Sparkles, convs.filter((c) => ['ai', 'ai_active'].includes(c.status)).length],
          ['operator_required', 'Needs operator', CircleAlert, convs.filter((c) => c.status === 'operator_required').length], ['resolved', 'Resolved', Check, convs.filter((c) => c.status === 'resolved').length]].map(([k, label, I, n]) => (
          <button key={label} onClick={() => setStatusFilter(k)} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[12.5px] transition', statusFilter === k ? 'bg-accent/15 font-semibold text-accent' : 'text-fg-2 hover:bg-fg/[0.04]')}>
            <I className="size-4" /><span className="flex-1">{label}</span><span className="text-[11px] tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </aside>

      {/* Conversation list */}
      <section className="card flex min-h-[420px] flex-col overflow-hidden">
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[15px] font-semibold">Conversations</div>
            <span className="text-[11.5px] text-fg-3">{shown.length} of {convs.length}</span>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guests or messages" className="input py-2 pl-9 text-[13px]" />
          </label>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {Object.entries(CHANNELS).map(([k, c]) => (
              <button key={k} onClick={() => setChannel((x) => (x === k ? null : k))}
                className={cx('flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[11.5px] font-medium ring-1 transition',
                  channel === k ? 'bg-fg text-canvas ring-transparent' : 'text-fg-2 ring-line hover:bg-fg/[0.05]')}>
                <span className={cx('grid size-5 place-items-center rounded-full text-white', c.dot)}><c.icon className="size-3" /></span>
                {c.label}
                {counts[k] > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#ff453a] px-1 text-[10px] font-bold text-white">{counts[k]}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {shown.length === 0 && <div className="px-3 py-10 text-center text-[12.5px] text-fg-3">No conversations match these filters.</div>}
          {shown.map((c) => <ConvCard key={c.id} c={c} active={current.id === c.id} onClick={() => setSelected(c.id)} />)}
        </div>
      </section>

      {/* Transcript */}
      <section className="card flex min-h-[520px] min-w-0 flex-col overflow-hidden">
        <TranscriptHeader ctx={ctx} conv={current} />
        {current.live ? <ChatThread ctx={ctx} /> : <SampleThread conv={current} />}
      </section>
    </div>
  )
}

function ConvCard({ c, active, onClick }) {
  const ch = CHANNELS[c.channel] || CHANNELS.whatsapp
  const st = STATUS[c.status]
  return (
    <button onClick={onClick} className={cx('flex w-full animate-rise gap-3 rounded-xl p-2.5 text-left transition', active ? 'bg-accent/[0.12] ring-1 ring-accent/30' : 'hover:bg-fg/[0.04]')}>
      <span className="relative">
        <Avatar name={c.name} size={40} />
        <span className={cx('absolute -right-0.5 -bottom-0.5 grid size-[18px] place-items-center rounded-full text-white ring-2 ring-card', ch.dot)}><ch.icon className="size-2.5" /></span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold">{c.name}</span>
          {c.live && <span className="pill tone-info py-0 text-[9.5px]">LIVE</span>}
          <span className="ml-auto shrink-0 text-[10.5px] text-fg-3">{fmtTime(c.at)}</span>
        </span>
        <span className="block truncate text-[11px] text-fg-3">{c.note}</span>
        <span className="mt-0.5 block truncate text-[12px] text-fg-2">{c.snippet}</span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <span className={cx('pill py-0.5 text-[10.5px]', st.cls)}><st.icon className={cx('size-3', c.status === 'ai' && 'animate-pulse-soft')} /> {st.label}</span>
          {c.unread > 0 && <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{c.unread}</span>}
        </span>
      </span>
    </button>
  )
}

function TranscriptHeader({ ctx, conv }) {
  const [chapterOpen, setChapterOpen] = useState(false)
  const { ov } = ctx
  const ch = CHANNELS[conv.channel] || CHANNELS.whatsapp
  const st = STATUS[conv.status]
  const staffMode = ov.conversation.state === 'OPERATOR_LOCKED'
  const toggle = () => ctx.run(() => api('/conversations/control', { mode: staffMode ? 'ai' : 'operator', staff_id: OPERATOR.id }),
    staffMode ? 'Mia is handling the conversation again' : 'You took over - Mia will only draft privately')
  const chapter = conv.live ? `Stay ${fmtDate(ov.guest.arrival_date)} – ${fmtDate(ov.guest.departure_date)}` : 'Current enquiry'
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <Avatar name={conv.name} size={38} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[14px] font-semibold">{conv.name}</div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
          <span className={cx('size-2 rounded-full', ch.dot)} /> {ch.label}
          {conv.live && <> · {ov.guest.phone_e164.replace(/(\+\d{3})(\d{3})(\d{3})(\d+)/, '$1 $2 $3 $4')}</>}
        </div>
      </div>
      <div className="relative">
        <button onClick={() => setChapterOpen((o) => !o)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-fg-2 ring-1 ring-line transition hover:bg-fg/[0.05]">
          <Hash className="size-3.5" /> Chapter 1 <ChevronDown className={cx('size-3.5 transition', chapterOpen && 'rotate-180')} />
        </button>
        {chapterOpen && (
          <div className="popover absolute top-full left-0 mt-1.5 w-64 animate-pop">
            <div className="eyebrow px-2.5 pt-1.5 pb-1">Semantic chapters</div>
            <button onClick={() => setChapterOpen(false)} className="flex w-full items-center gap-2 rounded-lg bg-fg/[0.05] px-2.5 py-2 text-left text-[12.5px]">
              <Hash className="size-3.5 text-accent" /><span className="flex-1">Chapter 1 · {chapter}</span><Check className="size-3.5 text-emerald-400" />
            </button>
            <div className="px-2.5 py-2 text-[11px] text-fg-3">Chapters group a guest's dialogue by stay. Earlier stays appear here once they exist.</div>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className={cx('pill', st.cls)}><st.icon className={cx('size-3', conv.status === 'ai' && 'animate-pulse-soft')} /> {st.label}</span>
        {conv.live && (
          <button onClick={toggle} title={staffMode ? 'Hand back to Mia' : 'Take over: lock the AI and reply yourself'}
            className={cx('flex items-center gap-2 rounded-full py-1 pr-1 pl-2.5 text-[11.5px] font-semibold ring-1 transition-all', staffMode ? 'bg-blue-500/12 text-blue-600 ring-blue-500/30 dark:text-blue-300' : 'text-fg-2 ring-line hover:bg-fg/[0.05]')}>
            {staffMode ? <><Hand className="size-3.5" /> Operator</> : <><Bot className="size-3.5" /> AI</>}
            <span className={cx('relative h-5 w-9 rounded-full transition-colors duration-300', staffMode ? 'bg-blue-500' : 'bg-fg/15')}>
              <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all duration-300', staffMode ? 'left-[18px]' : 'left-0.5')} />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// Live thread for the backend conversation (also used by the Mia quick-chat drawer).
export function ChatThread({ ctx, compact }) {
  const { ov, busy, session, steps } = ctx
  const [text, setText] = useState('')
  const scroller = useRef(null)
  const staffMode = ov.conversation.state === 'OPERATOR_LOCKED'
  const running = session?.state === 'RUNNING'
  const lastStep = steps[steps.length - 1]
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [ov.messages.length, busy, steps.length])

  const submit = async (e) => {
    e.preventDefault()
    const v = text.trim(); if (!v) return
    setText('')
    if (staffMode) await ctx.run(() => api('/chat/operator', { text: v, staff_id: OPERATOR.id }))
    else await ctx.simulate(v)
  }

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        <DayDivider label={`Today · ${ov.guest.full_name.split(' ')[0]}'s arrival day`} />
        {ov.messages.map((m) => <Bubble key={m.id} m={m} onEvidence={() => ctx.go('ai')} />)}
        {(busy || running) && !staffMode && (
          <div className="flex animate-rise items-center gap-2">
            <span className="flex gap-1 rounded-2xl rounded-bl-md bg-fg/[0.06] px-3 py-2.5">
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-[#bf5af2]" style={{ animationDelay: `${i * 120}ms` }} />)}
            </span>
            <span className="text-[11.5px] text-fg-3">Mia is replying…</span>
          </div>
        )}
      </div>

      {running && lastStep && (
        <button onClick={() => ctx.go('ai')} className="mx-3 mb-2 flex animate-fade items-center gap-2 rounded-xl bg-cyan-500/10 px-3 py-2 text-left text-[12px] ring-1 ring-cyan-500/25">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-cyan-500" />
          <span className="font-semibold text-cyan-700 dark:text-cyan-300">{AGENT_NAME[lastStep.agent_key] || lastStep.agent_key}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{lastStep.title}</span>
          {!compact && <span className="shrink-0 text-accent">Reasoning ›</span>}
        </button>
      )}

      <div className="space-y-2.5 border-t border-line p-3">
        {staffMode ? (
          <div className="flex items-start gap-2 rounded-xl bg-blue-500/10 px-3 py-2 text-[11.5px] text-blue-700 ring-1 ring-blue-500/20 dark:text-blue-200">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> AI locked. You are replying as {ov.conversation.owner_name || OPERATOR.name}; Mia's suggestions appear as private drafts.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => ctx.simulate(DEMO_INQUIRY)} disabled={busy} className="btn btn-primary">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Simulate Guest Inquiry
            </button>
            {QUICK.map((qa) => (
              <button key={qa.label} onClick={() => ctx.simulate(qa.text)} disabled={busy} title={qa.text}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] text-fg-2 ring-1 ring-line transition hover:bg-fg/[0.05] hover:text-fg disabled:opacity-40">
                <qa.icon className="size-3" /> {qa.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy && !staffMode}
            placeholder={staffMode ? `Reply to ${ov.guest.full_name.split(' ')[0]}…` : 'Type as the guest to simulate a message…'} className="input" />
          <button disabled={!text.trim() || (busy && !staffMode)} aria-label="Send" className="btn btn-primary size-10 shrink-0 rounded-full p-0"><Send className="size-4" /></button>
        </form>
      </div>
    </>
  )
}

function SampleThread({ conv }) {
  return (
    <>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        <DayDivider label="Preview conversation" />
        {conv.messages.map(([kind, body, ago], i) => (
          <Bubble key={i} m={{ direction: kind === 'guest' ? 'inbound' : 'outbound', author_kind: kind, body, created_at: new Date(Date.now() - ago * 60000).toISOString(),
            author_name: kind === 'ai' ? 'Mia · AI Concierge' : kind === 'operator' ? 'Front desk' : 'Chateau Telavi', evidence: [] }} />
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-xl bg-fg/[0.04] px-3 py-2.5 text-[12px] text-fg-3 ring-1 ring-line">
          <Lock className="size-3.5 shrink-0" /> Sample thread for the multi-channel inbox preview - only the WhatsApp thread with Nino is connected to the live backend.
        </div>
      </div>
    </>
  )
}

function DayDivider({ label }) {
  return <div className="flex items-center gap-3 py-1 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase"><span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" /></div>
}

function Bubble({ m, onEvidence }) {
  if (m.direction === 'internal') {
    return (
      <div className="mx-auto max-w-[92%] animate-rise rounded-2xl border border-dashed border-[#bf5af2]/50 bg-[#bf5af2]/[0.06] px-3.5 py-2.5 text-[12.5px]">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-[#bf5af2] uppercase"><Sparkles className="size-3" /> Private AI draft · not sent</div>
        <div className="text-fg-2">{m.body}</div>
      </div>
    )
  }
  const inbound = m.direction === 'inbound'
  const kind = m.author_kind
  return (
    <div className={cx('flex animate-rise', inbound ? 'justify-start' : 'justify-end')}>
      <div className={cx('max-w-[82%] rounded-[20px] px-3.5 py-2 text-[13.5px] leading-relaxed',
        inbound ? 'rounded-bl-md bg-fg/[0.07] text-fg'
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
          {fmtTime(m.created_at)} {!inbound && <CheckCheck className="size-3" />}
        </div>
      </div>
    </div>
  )
}
