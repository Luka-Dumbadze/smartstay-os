import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft, BadgeCheck, Brain, Database, FileCheck2, Gavel, Hash, Loader2, MessageSquareText, Pencil, ScrollText, ShieldCheck,
  Sparkles, Wine, Workflow, Wrench, X,
} from 'lucide-react'
import { TZ, ViewTitle, cx, fmtTime } from '../App.jsx'

const MODEL = 'Gemini 3.8 Flash (High Thinking)'
const PROFILE = {
  mia: { role: 'Customer Advisor', icon: Sparkles, gradient: 'from-[#ff6fa5] to-[#8b5cf6]', text: 'text-pink-500 dark:text-pink-300',
    prompt: 'You are Mia, the front-desk concierge of Chateau Telavi Wine Resort. Greet guests warmly (Gamarjoba!), keep replies short, and personalise them with CRM preferences.',
    rules: 'Only state facts found in approved, currently valid knowledge.\nNever claim a service is completed - staff attest completion.\nHand unsupported requests to the front desk.\nIf a staff member owns the conversation, write private drafts only.' },
  sommelier: { role: 'Cellar Specialist', icon: Wine, gradient: 'from-[#ffb340] to-[#b3395b]', text: 'text-amber-600 dark:text-amber-300',
    prompt: 'You are the Chateau Telavi sommelier. Recommend wines from the approved Cellar & Wine List and explain them in one or two sentences.',
    rules: 'Quote prices exactly as listed.\nAlways check allergens against the guest\'s sensitive facts before recommending.\nAbstain if no approved entry matches.' },
  ops: { role: 'Task Dispatcher', icon: Workflow, gradient: 'from-[#30d158] to-[#0a84ff]', text: 'text-emerald-600 dark:text-emerald-300',
    prompt: 'You are the operations coordinator. Turn guest requests into precise housekeeping and F&B tasks with room, quantity and SLA.',
    rules: 'Charges require front-desk confirmation.\nUse the Guest Services Policy for SLAs.\nNever mark a task complete.' },
}
const STEP_KIND = {
  THOUGHT: { icon: Brain, label: 'Reasoning', tone: 'tone-muted' },
  DECISION: { icon: Gavel, label: 'Decision', tone: 'tone-info' },
  TOOL_CALL: { icon: Wrench, label: 'Tool call', tone: 'tone-warn' },
  TOOL_RESULT: { icon: Database, label: 'Tool result', tone: 'tone-ok' },
  HANDOFF: { icon: ArrowRightLeft, label: 'Handoff', tone: 'tone-violet' },
  GUARDRAIL: { icon: ShieldCheck, label: 'Guardrail', tone: 'tone-ok' },
  REPLY: { icon: MessageSquareText, label: 'Reply', tone: 'tone-ai' },
}
const readDrafts = () => { try { return JSON.parse(localStorage.getItem('ss.agentDrafts') || '{}') } catch { return {} } }
const writeDrafts = (d) => { try { localStorage.setItem('ss.agentDrafts', JSON.stringify(d)) } catch { /* storage unavailable */ } }

export default function AiTeamView({ ctx }) {
  const { ov, steps, session } = ctx
  const [enabled, setEnabled] = useState(() => Object.fromEntries(ov.agents.map((a) => [a.key, a.enabled])))
  const [editing, setEditing] = useState(null)
  const [drafts, setDrafts] = useState(readDrafts)
  const running = session?.state === 'RUNNING'
  const activeAgent = running && steps.length ? steps[steps.length - 1].agent_key : null
  const citation = useMemo(() => [...steps].reverse().find((s) => s.detail?.citation)?.detail.citation, [steps])

  const toggle = (a) => {
    setEnabled((e) => ({ ...e, [a.key]: !e[a.key] }))
    ctx.toast(`${a.key === 'mia' ? 'Mia' : a.display_name}: availability switch is a UI preview - the backend keeps every agent enabled`, 'ok')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pt-2">
      <ViewTitle crumb={['AI Team', 'Agents']} sub="Digital employees that coordinate guest service across the resort"
        right={<span className={cx('pill', running ? 'tone-ai' : 'tone-muted')}>{running ? <><Loader2 className="size-3 animate-spin" /> Session running</> : <>Idle · {ov.agents.length} agents</>}</span>} />

      <div className="grid gap-4 md:grid-cols-3">
        {ov.agents.map((a, i) => {
          const p = PROFILE[a.key] || PROFILE.mia
          const on = enabled[a.key]
          const working = activeAgent === a.key
          return (
            <div key={a.key} style={{ animationDelay: `${i * 50}ms` }}
              className={cx('glass relative animate-rise overflow-hidden rounded-2xl p-5 transition-all duration-300', working && 'ring-2 ring-[#bf5af2]/60 shadow-[0_20px_50px_-20px_#bf5af2]')}>
              <div className={cx('pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br opacity-20 blur-2xl', p.gradient)} />
              <div className="flex items-start justify-between">
                <div className="relative">
                  <div className={cx('grid size-16 place-items-center rounded-full bg-gradient-to-br text-white shadow-lg ring-4 ring-card', p.gradient)}>
                    <span className="text-xl font-semibold">{(a.key === 'mia' ? 'Mia' : a.display_name)[0]}</span>
                  </div>
                  <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full bg-card ring-2 ring-card"><p.icon className={cx('size-3.5', p.text)} /></span>
                  {working && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[#bf5af2]/50" />}
                </div>
                <Switch on={on} onChange={() => toggle(a)} label={`Toggle ${a.display_name}`} />
              </div>
              <dl className="mt-4 space-y-2.5 text-[12.5px]">
                <Field k="Name"><span className="text-[15px] font-semibold">{a.key === 'mia' ? 'Mia' : a.display_name}</span></Field>
                <Field k="Role">{p.role}</Field>
                <Field k="Status">
                  <span className={cx('pill', !on ? 'tone-muted' : working ? 'tone-ai' : 'tone-ok')}>
                    <span className={cx('size-1.5 rounded-full', !on ? 'bg-fg-3' : working ? 'animate-pulse-soft bg-cyan-400' : 'bg-emerald-400')} />
                    {!on ? 'Paused' : working ? 'Working' : 'Active'}
                  </span>
                </Field>
                <Field k="Model">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#4285f4]/15 via-[#9b72cb]/15 to-[#d96570]/15 px-2 py-1 text-[11.5px] font-semibold ring-1 ring-[#9b72cb]/30">
                    <Sparkles className="size-3 text-[#9b72cb]" /> {MODEL}
                  </span>
                </Field>
              </dl>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditing({ agent: a, tab: 'prompt' })} className="btn btn-soft flex-1"><Pencil className="size-3.5" /> Edit prompt</button>
                <button onClick={() => setEditing({ agent: a, tab: 'rules' })} className="btn btn-outline flex-1"><ScrollText className="size-3.5" /> Instructions</button>
              </div>
              {drafts[a.key] && <div className="mt-2 text-[10.5px] text-amber-600 dark:text-amber-300">Unsaved local draft · not deployed</div>}
            </div>
          )
        })}
      </div>
      <div className="text-[11.5px] text-fg-3">Model shown is the configured assignment. This local build executes the team with {ov.engine.planner}; retrieval uses {ov.engine.retrieval}.</div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ReasoningFeed steps={steps} session={session} running={running} />
        <div className="space-y-4">
          <CitationCard c={citation} />
          <EventTicker events={ctx.eventLog} />
        </div>
      </div>

      {editing && <InstructionEditor edit={editing} drafts={drafts} onClose={() => setEditing(null)}
        onSave={(key, val) => { const d = { ...drafts, [key]: val }; setDrafts(d); writeDrafts(d); setEditing(null); ctx.toast('Draft saved in this browser - deploying prompts is not part of the MVP') }} />}
    </div>
  )
}

function Field({ k, children }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-fg-3">{k}</dt><dd className="min-w-0 truncate text-right">{children}</dd></div>
}

function Switch({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={cx('relative h-6 w-11 rounded-full transition-colors duration-300', on ? 'bg-[#30d158]' : 'bg-fg/20')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-300', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function ReasoningFeed({ steps, session, running }) {
  const scroller = useRef(null)
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [steps.length])
  const state = { RUNNING: ['tone-ai', 'thinking'], COMPLETED: ['tone-ok', 'replied'], HANDED_TO_HUMAN: ['tone-info', 'handed to staff'], FAILED: ['tone-alert', 'failed'] }[session?.state] || ['tone-muted', 'idle']
  return (
    <section className="card flex max-h-[620px] min-h-[360px] flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Brain className="size-4 text-[#bf5af2]" />
        <span className="text-[14px] font-semibold">Live reasoning</span>
        <span className={cx('pill', state[0])}>{running && <span className="size-1.5 animate-pulse-soft rounded-full bg-cyan-400" />}{state[1]}</span>
        {session && <span className="ml-auto font-mono text-[11px] text-fg-3">session …{String(session.id).slice(-6)}</span>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {steps.length === 0 ? (
          <div className="grid h-full place-items-center py-10 text-center text-fg-3">
            <div className="max-w-xs"><Sparkles className="mx-auto mb-2 size-6 text-[#bf5af2]" /><div className="text-[13px] font-medium text-fg">Waiting for a guest message</div>
              <div className="mt-1 text-[12px]">Simulate a guest inquiry to watch Mia consult CRM memory, the approved cellar list and operations.</div></div>
          </div>
        ) : (
          <ol className="relative space-y-2.5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
            {steps.map((s) => <StepRow key={s.id} s={s} />)}
            {running && <li className="flex items-center gap-3 pl-1"><span className="grid size-6 place-items-center rounded-full bg-card ring-1 ring-line"><Loader2 className="size-3.5 animate-spin text-cyan-400" /></span><span className="shimmer-line h-1.5 flex-1 rounded-full" /></li>}
          </ol>
        )}
      </div>
    </section>
  )
}

const AGENT_LABEL = { mia: ['Mia', 'text-pink-500 dark:text-pink-300'], sommelier: ['Sommelier', 'text-amber-600 dark:text-amber-300'], ops: ['Operations Coordinator', 'text-emerald-600 dark:text-emerald-300'] }
function StepRow({ s }) {
  const k = STEP_KIND[s.kind] || STEP_KIND.THOUGHT
  const [name, color] = AGENT_LABEL[s.agent_key] || [s.agent_key, 'text-fg']
  const d = s.detail || {}
  const facts = Object.entries(d).filter(([key, v]) => !['citation', 'tool', 'from', 'to'].includes(key) && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).slice(0, 4)
  return (
    <li className="relative flex animate-rise gap-3">
      <span className={cx('z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ring-1', k.tone)}><k.icon className="size-3.5" /></span>
      <div className="min-w-0 flex-1 rounded-2xl bg-fg/[0.03] px-3.5 py-2.5 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className={cx('font-semibold', color)}>{name}</span>
          <span className="text-fg-3">{k.label}</span>
          {d.tool && <span className="rounded-md bg-fg/[0.07] px-1.5 py-px font-mono text-[10.5px]">{d.tool}</span>}
          <span className="ml-auto font-mono text-fg-3">{fmtTime(s.created_at, { second: '2-digit' })}</span>
        </div>
        <div className="mt-0.5 text-[13px] font-medium">{s.title}</div>
        {s.kind === 'HANDOFF' && d.from && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-2">
            <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5">{d.from}</span><ArrowRightLeft className="size-3 text-violet-400" /><span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5">{d.to}</span>
          </div>
        )}
        {s.kind !== 'HANDOFF' && facts.length > 0 && (
          <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 text-[11.5px] sm:grid-cols-[auto_1fr]">
            {facts.map(([key, v]) => (
              <div key={key} className="contents">
                <dt className="text-fg-3">{key.replaceAll('_', ' ')}</dt>
                <dd className="min-w-0 break-words text-fg-2">{Array.isArray(v) ? v.join(' · ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  )
}

function CitationCard({ c }) {
  if (!c) {
    return (
      <div className="card flex items-center gap-3 p-4 text-[12.5px] text-fg-3">
        <FileCheck2 className="size-5 shrink-0" /> Grounded citations appear here - agents only state facts from approved, currently valid knowledge.
      </div>
    )
  }
  const d = (iso, o) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o }).format(new Date(iso)) : '')
  return (
    <div className="card animate-rise overflow-hidden">
      <div className="bg-gradient-to-br from-[#b3395b]/20 via-transparent to-[#8b5cf6]/10 p-4">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-emerald-600 uppercase dark:text-emerald-300"><BadgeCheck className="size-3.5" /> Grounded citation</div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-semibold">{c.item}</div>
            {c.notes && <div className="text-[12px] text-fg-3">{c.notes}</div>}
          </div>
          {c.price_gel != null && <div className="shrink-0 text-right"><div className="text-2xl font-semibold tabular-nums">{c.price_gel} <span className="text-[12px] text-fg-3">GEL</span></div><div className="text-[10.5px] text-fg-3">per {c.unit}</div></div>}
        </div>
        {c.allergens?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.allergens.map((x) => <span key={x} className="pill tone-warn">contains {x}</span>)}
            {c.allergen_verified && <span className="pill tone-ok"><ShieldCheck className="size-3" /> allergens verified</span>}
          </div>
        )}
        <blockquote className="mt-3 border-l-2 border-fg/20 pl-2.5 text-[11.5px] leading-relaxed text-fg-2 italic">“{c.quote}”</blockquote>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-4 py-3 text-[11px]">
        <div><span className="text-fg-3">Source</span><div className="truncate">{c.document} v{c.document_version}</div></div>
        <div><span className="text-fg-3">Approved by</span><div className="truncate">{c.approved_by}</div></div>
        <div><span className="text-fg-3">Approved</span><div>{d(c.approved_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
        <div><span className="text-fg-3">Valid until</span><div>{d(c.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
        <div className="col-span-2 flex items-center gap-1 font-mono text-fg-3"><Hash className="size-3" /> sha256 {c.content_sha256?.slice(0, 18)}… · chunk {String(c.chunk_id).slice(-6)}</div>
      </div>
    </div>
  )
}

function EventTicker({ events }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-[12.5px] font-semibold">Event stream <span className="font-normal text-fg-3">· outbox → SSE</span></div>
      <div className="max-h-56 overflow-y-auto px-4 py-2 font-mono text-[11px]">
        {events.length === 0 && <div className="py-3 text-fg-3">No events on this connection yet.</div>}
        {events.slice(0, 25).map((e) => (
          <div key={e.n + e.id} className="flex animate-fade gap-2 border-b border-line/50 py-1.5 last:border-0">
            <span className="w-7 shrink-0 text-fg-3">#{e.n}</span>
            <span className="w-24 shrink-0 truncate text-violet-500 dark:text-violet-300">{e.source}</span>
            <span className="min-w-0 flex-1 truncate">{e.type}</span>
            <span className="text-fg-3">{fmtTime(e.at, { second: '2-digit' })}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InstructionEditor({ edit, drafts, onClose, onSave }) {
  const { agent } = edit
  const p = PROFILE[agent.key] || PROFILE.mia
  const [tab, setTab] = useState(edit.tab)
  const [val, setVal] = useState(() => drafts[agent.key] || { prompt: p.prompt, rules: p.rules })
  return (
    <div className="fixed inset-0 z-40 grid animate-fade place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg animate-pop p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow">{p.role}</div>
            <div className="mt-0.5 text-[16px] font-semibold">{agent.key === 'mia' ? 'Mia' : agent.display_name} · {MODEL}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-fg/[0.05] p-1">
          {[['prompt', 'System prompt'], ['rules', 'Instructions']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg py-1.5 text-[12.5px] font-medium transition', tab === k ? 'bg-card shadow ring-1 ring-line' : 'text-fg-2')}>{l}</button>
          ))}
        </div>
        <textarea value={val[tab]} onChange={(e) => setVal((v) => ({ ...v, [tab]: e.target.value }))} rows={8} className="input mt-3 resize-none font-mono text-[12.5px] leading-relaxed" />
        <p className="mt-2 text-[11.5px] text-fg-3">Drafts stay in this browser. The running agents use the built-in guardrails regardless of edits here.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button onClick={() => onSave(agent.key, val)} className="btn btn-primary">Save draft</button>
        </div>
      </div>
    </div>
  )
}
