'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft, BadgeCheck, Brain, Database, FileCheck2, Gavel, Hash, Loader2, MessageSquareText, ShieldCheck, Sparkles, Wine, Workflow, Wrench,
  type LucideIcon,
} from 'lucide-react'
import { ViewTitle, cx, fmtTime, type OsContext, type Step } from './ui'

const PROFILE: Record<string, { icon: LucideIcon; gradient: string; text: string }> = {
  mia: { icon: Sparkles, gradient: 'from-[#ff6fa5] to-[#8b5cf6]', text: 'text-pink-300' },
  sommelier: { icon: Wine, gradient: 'from-[#ffb340] to-[#b3395b]', text: 'text-amber-300' },
  coordinator: { icon: Workflow, gradient: 'from-[#30d158] to-[#0a84ff]', text: 'text-emerald-300' },
}
const STEP_KIND: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  THOUGHT: { icon: Brain, label: 'Reasoning', tone: 'tone-muted' },
  DECISION: { icon: Gavel, label: 'Decision', tone: 'tone-info' },
  TOOL_CALL: { icon: Wrench, label: 'Tool call', tone: 'tone-warn' },
  TOOL_RESULT: { icon: Database, label: 'Tool result', tone: 'tone-ok' },
  HANDOFF: { icon: ArrowRightLeft, label: 'Handoff', tone: 'tone-violet' },
  GUARDRAIL: { icon: ShieldCheck, label: 'Guardrail', tone: 'tone-ok' },
  REPLY: { icon: MessageSquareText, label: 'Reply', tone: 'tone-ai' },
}
const AGENT_ORDER: Record<string, number> = { mia: 0, sommelier: 1, coordinator: 2 }
const SESSION_TONE: Record<string, [string, string]> = {
  RUNNING: ['tone-ai', 'thinking'], COMPLETED: ['tone-ok', 'replied'], HANDED_TO_HUMAN: ['tone-info', 'handed to staff'], FAILED: ['tone-alert', 'failed'],
}

type Citation = { item?: string; price_gel?: number | null; unit?: string | null; allergens?: string[]; document?: string; document_version?: number; approved_by?: string | null; chunk_id?: string; content_sha256?: string; quote?: string }

/** AI Team (App 5): digital employee cards (model, thinking level, live status) and the live reasoning feed. */
export default function AiTeamView({ ctx }: { ctx: OsContext }) {
  const { snap } = ctx
  const [picked, setPicked] = useState<string | null>(null)
  const session = snap.sessions.find((s) => s.id === picked) ?? snap.sessions[0] ?? null
  const steps = useMemo(() => (session ? snap.steps.filter((s) => s.session_id === session.id).sort((a, b) => a.seq - b.seq) : []), [snap.steps, session])
  const running = session?.state === 'RUNNING'
  const activeAgent = running ? steps.at(-1)?.agent_key : undefined
  const citation = [...steps].reverse().map((s) => (s.detail as { citation?: Citation }).citation).find(Boolean)
  const today = snap.sessions.filter((s) => Date.now() - new Date(s.started_at).getTime() < 86_400_000)

  return (
    <div className="mx-auto max-w-7xl space-y-5 pt-2">
      <ViewTitle crumb={['AI Team', 'Agents']} sub="Digital employees that coordinate guest service across the resort"
        right={<span className={cx('pill', running ? 'tone-ai' : 'tone-muted')}>{running ? <><Loader2 className="size-3 animate-spin" /> Session running</> : <>Idle · {snap.agents.filter((a) => a.enabled).length} agents</>}</span>} />

      <div className="grid gap-4 md:grid-cols-3">
        {[...snap.agents].sort((a, b) => (AGENT_ORDER[a.key] ?? 9) - (AGENT_ORDER[b.key] ?? 9)).map((a, i) => {
          const p = PROFILE[a.key] ?? PROFILE.mia
          const working = activeAgent === a.key
          const count = snap.steps.filter((s) => s.agent_key === a.key).length
          return (
            <div key={a.id} style={{ animationDelay: `${i * 50}ms` }}
              className={cx('glass relative animate-rise overflow-hidden rounded-2xl p-5 transition-all duration-300', working && 'shadow-[0_20px_50px_-20px_#bf5af2] ring-2 ring-[#bf5af2]/60')}>
              <div className={cx('pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-gradient-to-br opacity-20 blur-2xl', p.gradient)} />
              <div className="flex items-start justify-between">
                <div className="relative">
                  <div className={cx('grid size-16 place-items-center rounded-full bg-gradient-to-br text-white shadow-lg ring-4 ring-card', p.gradient)}>
                    <span className="text-xl font-semibold">{a.display_name[0]}</span>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-card ring-2 ring-card"><p.icon className={cx('size-3.5', p.text)} /></span>
                  {working && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[#bf5af2]/50" />}
                </div>
                <span className={cx('pill', !a.enabled ? 'tone-muted' : working ? 'tone-ai' : 'tone-ok')}>
                  <span className={cx('size-1.5 rounded-full', !a.enabled ? 'bg-fg-3' : working ? 'animate-pulse-soft bg-cyan-400' : 'bg-emerald-400')} />
                  {!a.enabled ? 'Paused' : working ? 'Working' : 'Active'}
                </span>
              </div>
              <dl className="mt-4 space-y-2.5 text-[12.5px]">
                <Field k="Name"><span className="text-[15px] font-semibold">{a.display_name}</span></Field>
                <Field k="Role">{a.role}</Field>
                <Field k="Persona">{a.persona}</Field>
                <Field k="Model">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#4285f4]/15 via-[#9b72cb]/15 to-[#d96570]/15 px-2 py-1 font-mono text-[11px] font-semibold ring-1 ring-[#9b72cb]/30">
                    <Sparkles className="size-3 text-[#9b72cb]" /> {a.model}
                  </span>
                </Field>
                <Field k="Thinking">{a.thinking_level}</Field>
                <Field k="Steps logged">{count}</Field>
              </dl>
              <p className="mt-3 line-clamp-3 text-[11.5px] text-fg-3" title={a.instructions}>{a.instructions}</p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ReasoningFeed steps={steps} sessionId={session?.id} state={session?.state} />
        <div className="space-y-4">
          <CitationCard c={citation} />
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12.5px] font-semibold">
              Sessions <span className="font-normal text-fg-3">{today.length} in 24 h · {today.reduce((n, s) => n + s.input_tokens + s.output_tokens + s.thinking_tokens, 0).toLocaleString()} tokens</span>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {snap.sessions.length === 0 && <div className="px-3 py-4 text-[12px] text-fg-3">No reasoning sessions yet.</div>}
              {snap.sessions.slice(0, 20).map((s) => {
                const [tone, label] = SESSION_TONE[s.state] ?? SESSION_TONE.RUNNING
                return (
                  <button key={s.id} onClick={() => setPicked(s.id)} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition hover:bg-white/[0.05]', session?.id === s.id && 'bg-white/[0.06]')}>
                    <span className="font-mono text-[11px] text-fg-3">{fmtTime(s.started_at, { second: '2-digit' })}</span>
                    <span className={cx('pill', tone)}>{label}</span>
                    <span className="ml-auto text-[11px] text-fg-3">{s.model_calls} calls · {(s.input_tokens + s.output_tokens + s.thinking_tokens).toLocaleString()} tok</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ k, children }: { k: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-fg-3">{k}</dt><dd className="min-w-0 truncate text-right">{children}</dd></div>
}

function ReasoningFeed({ steps, sessionId, state }: { steps: Step[]; sessionId?: string; state?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [steps.length])
  const [tone, label] = state ? SESSION_TONE[state] ?? SESSION_TONE.RUNNING : ['tone-muted', 'idle']
  const running = state === 'RUNNING'
  return (
    <section className="card flex max-h-[640px] min-h-[360px] flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Brain className="size-4 text-[#bf5af2]" />
        <span className="text-[14px] font-semibold">Live reasoning</span>
        <span className={cx('pill', tone)}>{running && <span className="size-1.5 animate-pulse-soft rounded-full bg-cyan-400" />}{label}</span>
        {sessionId && <span className="ml-auto font-mono text-[11px] text-fg-3">session …{sessionId.slice(-6)}</span>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {steps.length === 0 ? (
          <div className="grid h-full place-items-center py-10 text-center text-fg-3">
            <div className="max-w-xs"><Sparkles className="mx-auto mb-2 size-6 text-[#bf5af2]" /><div className="text-[13px] font-medium text-fg">Waiting for a guest message</div>
              <div className="mt-1 text-[12px]">Every step the agents take — CRM lookups, knowledge searches, handoffs, guardrails — streams here live.</div></div>
          </div>
        ) : (
          <ol className="relative space-y-2.5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
            {steps.map((s) => <StepRow key={s.id} s={s} />)}
            {running && <li className="flex items-center gap-3 pl-1"><span className="grid size-6 place-items-center rounded-full bg-card ring-1 ring-line"><Loader2 className="size-3.5 animate-spin text-cyan-400" /></span><span className="shimmer-line h-1.5 flex-1 rounded-full" /></li>}
          </ol>
        )}
      </div>
    </section>
  )
}

const AGENT_LABEL: Record<string, [string, string]> = { mia: ['Mia', 'text-pink-300'], sommelier: ['Sommelier', 'text-amber-300'], coordinator: ['Operations Coordinator', 'text-emerald-300'] }

function StepRow({ s }: { s: Step }) {
  const k = STEP_KIND[s.kind] ?? STEP_KIND.THOUGHT
  const [name, color] = AGENT_LABEL[s.agent_key] ?? [s.agent_key, 'text-fg']
  const d = s.detail as Record<string, unknown>
  const facts = Object.entries(d).filter(([key, v]) => !['citation', 'tool', 'from', 'to'].includes(key) && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).slice(0, 4)
  return (
    <li className="relative flex animate-rise gap-3">
      <span className={cx('z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ring-1', k.tone)}><k.icon className="size-3.5" /></span>
      <div className="min-w-0 flex-1 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className={cx('font-semibold', color)}>{name}</span>
          <span className="text-fg-3">{k.label}</span>
          {typeof d.tool === 'string' && <span className="rounded-md bg-white/[0.07] px-1.5 py-px font-mono text-[10.5px]">{d.tool}</span>}
          <span className="ml-auto font-mono text-fg-3">{fmtTime(s.created_at, { second: '2-digit' })}</span>
        </div>
        <div className="mt-0.5 text-[13px] font-medium">{s.title}</div>
        {s.kind === 'HANDOFF' && typeof d.from === 'string' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-2">
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5">{d.from}</span><ArrowRightLeft className="size-3 text-violet-400" /><span className="rounded-md bg-white/[0.06] px-1.5 py-0.5">{String(d.to)}</span>
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

function CitationCard({ c }: { c?: Citation }) {
  if (!c) {
    return <div className="card flex items-center gap-3 p-4 text-[12.5px] text-fg-3"><FileCheck2 className="size-5 shrink-0" /> Grounded citations appear here — agents only quote approved, currently valid knowledge.</div>
  }
  return (
    <div className="card animate-rise overflow-hidden">
      <div className="bg-gradient-to-br from-[#b3395b]/20 via-transparent to-[#8b5cf6]/10 p-4">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-emerald-300"><BadgeCheck className="size-3.5" /> Grounded citation</div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 text-[16px] font-semibold">{c.item ?? c.document}</div>
          {c.price_gel != null && <div className="shrink-0 text-right"><div className="text-2xl font-semibold tabular-nums">{c.price_gel} <span className="text-[12px] text-fg-3">GEL</span></div><div className="text-[10.5px] text-fg-3">per {c.unit}</div></div>}
        </div>
        {!!c.allergens?.length && <div className="mt-2 flex flex-wrap gap-1.5">{c.allergens.map((x) => <span key={x} className="pill tone-warn">contains {x}</span>)}</div>}
        {c.quote && <blockquote className="mt-3 border-l-2 border-white/20 pl-2.5 text-[11.5px] italic leading-relaxed text-fg-2">“{c.quote}”</blockquote>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-4 py-3 text-[11px]">
        <div><span className="text-fg-3">Source</span><div className="truncate">{c.document} v{c.document_version}</div></div>
        <div><span className="text-fg-3">Approved by</span><div className="truncate">{c.approved_by ?? '—'}</div></div>
        <div className="col-span-2 flex items-center gap-1 font-mono text-fg-3"><Hash className="size-3" /> sha256 {c.content_sha256?.slice(0, 18)}… · chunk {c.chunk_id?.slice(-6)}</div>
      </div>
    </div>
  )
}
