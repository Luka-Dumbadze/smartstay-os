'use client'

import { useState, type FormEvent } from 'react'
import { BadgeCheck, BedDouble, BookOpen, CircleAlert, CircleCheck, Hand, Headset, Loader2, Play, RotateCcw, ShieldCheck, Sparkles, UserCheck, Wine, Wrench, X, type LucideIcon } from 'lucide-react'
import { Avatar, ROLE_LABEL, ViewTitle, cx, fmtDate, fmtTime, type OsContext, type Room, type StaffCompetency, type Task, type TrainingEvent } from './ui'
import { Badge, Button, Card, Input } from './primitives'

const ROOM: Record<Room['cleaning_state'], { tone: string; bar: string; step: number; next: [string, string, LucideIcon] }> = {
  DIRTY: { tone: 'tone-alert', bar: 'bg-rose-400', step: 0, next: ['StartCleaning', 'Start cleaning', Sparkles] },
  CLEANING: { tone: 'tone-warn', bar: 'bg-amber-400', step: 1, next: ['MarkClean', 'Inspect & release', BadgeCheck] },
  CLEAN: { tone: 'tone-ok', bar: 'bg-emerald-400', step: 2, next: ['MarkDirty', 'Mark dirty', RotateCcw] },
}
const COLUMNS: { key: Task['status']; label: string; dot: string }[] = [
  { key: 'QUEUED', label: 'Queued', dot: 'bg-amber-400' },
  { key: 'CLAIMED', label: 'Claimed', dot: 'bg-blue-400' },
  { key: 'IN_PROGRESS', label: 'In progress', dot: 'bg-violet-400' },
  { key: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-400' },
]
const CATEGORY: Record<Task['category'], [LucideIcon, string, string]> = {
  housekeeping: [BedDouble, 'Housekeeping', 'from-[#30d158] to-[#0a84ff]'],
  food_beverage: [Wine, 'Cellar & F&B', 'from-[#ffb340] to-[#b3395b]'],
  front_desk: [Headset, 'Front desk', 'from-[#64d2ff] to-[#5e5ce6]'],
  maintenance: [Wrench, 'Maintenance', 'from-[#8e8e93] to-[#3a3a3c]'],
}

function localToday(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find((x) => x.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function competencyFor(ctx: OsContext, t: Task, staffId: string): StaffCompetency | undefined {
  if (!t.required_sop_document_id || !t.required_sop_version) return undefined
  return ctx.snap.competencies.find((c) => c.staff_id === staffId && c.sop_document_id === t.required_sop_document_id && c.sop_version === t.required_sop_version)
}

function requiredSopIsCurrent(ctx: OsContext, t: Task) {
  if (!t.required_sop_document_id || !t.required_sop_version) return false
  const doc = ctx.snap.documents.find((d) => d.id === t.required_sop_document_id)
  return Boolean(doc && doc.kind === 'SOP' && doc.version === t.required_sop_version && doc.state === 'APPROVED_ACTIVE' && knowledgeRangeCurrent(doc.valid_during))
}

function knowledgeRangeCurrent(range: string) {
  const match = range.match(/^[[(]\s*"?([^,"]*)"?\s*,\s*"?([^")\]]*)"?[)\]]$/)
  if (!match) return false
  const lower = match[1].trim(); const upper = match[2].trim()
  const now = Date.now()
  return (!lower || Date.parse(lower) <= now) && (!upper || Date.parse(upper) > now)
}

function approvalDurations(events: TrainingEvent[]) {
  const approved = events.filter((e) => e.event_type === 'PRACTICAL_APPROVED')
  return approved.flatMap((approval) => {
    const passed = events.filter((e) => e.target_staff_id === approval.target_staff_id && e.sop_document_id === approval.sop_document_id
      && e.sop_version === approval.sop_version && e.event_type === 'KNOWLEDGE_CHECK_PASSED'
      && Date.parse(e.created_at) <= Date.parse(approval.created_at)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
    return passed ? [(Date.parse(approval.created_at) - Date.parse(passed.created_at)) / 60_000] : []
  })
}

/** Operations (App 3): room turnover board and the service-task board with 1-click, attested staff actions. */
export default function OperationsView({ ctx, flash }: { ctx: OsContext; flash: Record<string, number> }) {
  const { snap, me } = ctx
  const [attest, setAttest] = useState<Task | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const open = snap.tasks.filter((t) => ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status)).length
  const ready = snap.rooms.filter((r) => r.cleaning_state === 'CLEAN').length
  const today = localToday(snap.space.timezone || 'Asia/Tbilisi')
  const departures = snap.stays.filter((s) => s.departure_date === today && s.status !== 'CANCELLED').length
  const arrivals = snap.stays.filter((s) => s.arrival_date === today && ['BOOKED', 'IN_HOUSE'].includes(s.status)).length
  const quizAttempts = snap.trainingEvents.filter((e) => e.event_type === 'QUIZ_ATTEMPTED').length
  const aiQuestions = snap.trainingEvents.filter((e) => e.event_type === 'QUESTION_ASKED').length
  const supervisorReviews = snap.trainingEvents.filter((e) => ['SUPERVISED_PRACTICE_RECORDED', 'PRACTICAL_APPROVED', 'PRACTICAL_REJECTED'].includes(e.event_type)).length
  const practicalApprovals = snap.competencies.filter((c) => c.status === 'PRACTICALLY_APPROVED'
    && snap.documents.some((d) => d.id === c.sop_document_id && d.version === c.sop_version && d.state === 'APPROVED_ACTIVE')).length
  const approvalMins = approvalDurations(snap.trainingEvents)
  const averageApproval = approvalMins.length ? Math.round(approvalMins.reduce((a, b) => a + b, 0) / approvalMins.length) : null
  const trackedTurnovers = snap.tasks.filter((t) => t.required_sop_document_id && t.arrival_deadline_at)
  const readyBeforeArrival = trackedTurnovers.filter((t) => {
    const room = snap.rooms.find((r) => r.id === t.room_id)
    return t.status === 'COMPLETED' && t.completed_at && room?.cleaning_state === 'CLEAN'
      && Date.parse(t.completed_at) <= Date.parse(t.arrival_deadline_at!)
      && Date.parse(room.updated_at) <= Date.parse(t.arrival_deadline_at!)
  }).length
  const synthetic = snap.space.property_code.startsWith('KAKHETI-SYNTH')

  async function taskAction(t: Task, action: string) {
    setPending(`${t.id}:${action}`)
    await ctx.actions.post(`/api/tasks/${t.id}`, { action, expected_version: t.state_version },
      ({ ClaimTask: `Claimed: ${t.title}`, StartTask: `Started: ${t.title}`, AttestCompleted: `Completed & attested: ${t.title}` } as Record<string, string>)[action])
    setPending(null)
  }
  async function roomAction(r: Room, action: string) {
    setPending(`${r.id}:${action}`)
    await ctx.actions.post(`/api/rooms/${r.id}`, { action },
      ({ StartCleaning: `Room ${r.number}: cleaning started`, MarkClean: `Room ${r.number}: inspected & released`, MarkDirty: `Room ${r.number}: marked dirty` } as Record<string, string>)[action])
    setPending(null)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pt-2">
      <ViewTitle crumb={['Operations', 'Room turnover']} sub={`${ready} of ${snap.rooms.length} rooms ready · ${open} open service task${open === 1 ? '' : 's'} · you are ${ROLE_LABEL[me.role] ?? me.role}`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Housekeeping readiness pilot signals">
        <Card className="!p-3">
          <div className="flex items-center justify-between text-[11px] text-foreground-muted"><span>Today · arrivals & departures</span>{synthetic && <Badge tone="warning">Synthetic demo</Badge>}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{arrivals} arrivals · {departures} departures</div>
          <div className="mt-0.5 text-[10.5px] text-foreground-secondary">From this property's stay records</div>
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] text-foreground-muted">Competency · current SOP versions</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{practicalApprovals} independently approved</div>
          <div className="mt-0.5 text-[10.5px] text-foreground-secondary">Quiz attempts {quizAttempts} · supervisor reviews {supervisorReviews}</div>
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] text-foreground-muted">Training support · recorded</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{aiQuestions} SOP questions</div>
          <div className="mt-0.5 text-[10.5px] text-foreground-secondary">Approval after knowledge check {averageApproval === null ? 'not measured yet' : `${averageApproval} min average`}</div>
        </Card>
        <Card className="!p-3">
          <div className="text-[11px] text-foreground-muted">Room readiness · linked turnovers</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{readyBeforeArrival} / {trackedTurnovers.length} ready before arrival</div>
          <div className="mt-0.5 text-[10.5px] text-foreground-secondary">Observed operational records; no savings estimate</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {snap.rooms.map((r) => {
          const st = ROOM[r.cleaning_state]
          const [action, label, Icon] = st.next
          const stay = snap.stays.find((s) => s.room_id === r.id && ['BOOKED', 'IN_HOUSE'].includes(s.status))
          const guest = snap.profiles.find((p) => p.id === stay?.profile_id)
          const needsSupervisor = action === 'MarkClean' && !['HOUSEKEEPING_SUPERVISOR', 'GENERAL_MANAGER'].includes(me.role)
          const linkedTask = snap.tasks.find((t) => t.room_id === r.id && ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status) && t.required_sop_document_id)
          const needsCompetency = action === 'StartCleaning' && Boolean(linkedTask)
            && (!requiredSopIsCurrent(ctx, linkedTask!) || competencyFor(ctx, linkedTask!, me.id)?.status !== 'PRACTICALLY_APPROVED')
          const f = flash[`room:${r.id}`]
          return (
            <div key={`${r.id}-${f ?? 0}`} className={cx('card animate-rise p-5', Boolean(f) && 'animate-flash')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] text-fg-3">Room</div>
                  <div className="text-3xl font-semibold tracking-tight">{r.number}</div>
                  <div className="text-[12.5px] text-fg-2">{r.room_type} · {r.floor}</div>
                </div>
                <span className={cx('pill transition-all duration-300', st.tone)}>{r.cleaning_state}</span>
              </div>
              <div className="mt-4 flex gap-1.5">
                {[0, 1, 2].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-all duration-500', i <= st.step ? st.bar : 'bg-white/[0.08]')} />)}
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-fg-3"><span>Dirty</span><span>Cleaning</span><span>Clean</span></div>
              <div className="mt-4 flex min-h-[22px] flex-wrap items-center gap-2 text-[12px]">
                {guest && stay ? (
                  <span className="pill tone-violet"><Avatar name={guest.full_name} size={14} /> {guest.full_name.split(' ')[0]} · {stay.status === 'IN_HOUSE' ? 'in house' : `arrives ${fmtDate(stay.arrival_date)}`}</span>
                ) : <span className="pill tone-muted">vacant</span>}
              </div>
              <button onClick={() => roomAction(r, action)} disabled={pending === `${r.id}:${action}` || needsSupervisor || needsCompetency}
                title={needsSupervisor ? 'A housekeeping supervisor must inspect and release the room' : needsCompetency ? 'The current approved SOP practical competency is required' : undefined}
                className={cx('btn mt-4 w-full py-2', r.cleaning_state === 'CLEAN' ? 'btn-outline' : 'btn-primary')}>
                {pending === `${r.id}:${action}` ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />} {label}
              </button>
              <div className="mt-2 text-center text-[10.5px] text-fg-3">v{r.version} · updated {fmtTime(r.updated_at)}{needsSupervisor ? ' · supervisor sign-off required' : needsCompetency ? ' · practical approval required' : ''}</div>
            </div>
          )
        })}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold">Service tasks <span className="text-[12px] font-normal text-fg-3">Claim → Start → Attest completed</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const items = snap.tasks.filter((t) => t.status === c.key).slice(0, c.key === 'COMPLETED' ? 8 : 50)
            return (
              <div key={c.key} className="rounded-2xl bg-white/[0.025] p-2.5 ring-1 ring-line">
                <div className="flex items-center gap-2 px-1.5 pb-2.5 pt-1 text-[12.5px] font-semibold">
                  <span className={cx('size-2 rounded-full', c.dot)} />{c.label}<span className="ml-auto text-[11px] font-normal text-fg-3">{snap.tasks.filter((t) => t.status === c.key).length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[11.5px] text-fg-3">{c.key === 'QUEUED' ? 'Guest requests create tasks here' : 'Nothing here'}</div>}
                  {items.map((t) => (
                    <TaskCard key={`${t.id}-${flash[`task:${t.id}`] ?? 0}`} ctx={ctx} t={t} flashed={Boolean(flash[`task:${t.id}`])}
                      pending={pending?.startsWith(t.id) ?? false} onAct={taskAction} onAttest={() => setAttest(t)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {attest && <AttestModal t={attest} ctx={ctx} onClose={() => setAttest(null)} onConfirm={async () => { await taskAction(attest, 'AttestCompleted'); setAttest(null) }} />}
    </div>
  )
}

function TaskCard({ ctx, t, flashed, pending, onAct, onAttest }: {
  ctx: OsContext; t: Task; flashed: boolean; pending: boolean; onAct: (t: Task, a: string) => void; onAttest: () => void
}) {
  const [Icon, label, grad] = CATEGORY[t.category]
  const done = t.status === 'COMPLETED'
  const assignee = ctx.snap.staff.find((s) => s.id === t.assignee_id)
  const room = ctx.snap.rooms.find((r) => r.id === t.room_id)
  const mine = t.assignee_id === ctx.me.id
  const requiredSop = Boolean(t.required_sop_document_id && t.required_sop_version)
  const sop = requiredSop ? ctx.snap.documents.find((d) => d.id === t.required_sop_document_id) : undefined
  const myCompetency = requiredSop ? competencyFor(ctx, t, ctx.me.id) : undefined
  const sopCurrent = requiredSopIsCurrent(ctx, t)
  const eligible = !requiredSop || (sopCurrent && myCompetency?.status === 'PRACTICALLY_APPROVED')
  const myStatus = sopCurrent ? myCompetency?.status ?? 'NOT_TRAINED' : 'OUTDATED'
  const statusTone = myStatus === 'PRACTICALLY_APPROVED' ? 'success' : myStatus === 'SUPERVISED' ? 'warning' : 'neutral'
  const statusLabel = myStatus === 'OUTDATED' ? 'SOP version needs reassessment'
    : myStatus === 'PRACTICALLY_APPROVED' ? 'Practical competency approved'
      : myStatus === 'SUPERVISED' ? 'Supervised practice recorded'
        : myStatus === 'KNOWLEDGE_CHECK_PASSED' ? 'Knowledge check passed — supervised work only.' : 'Not trained for this SOP version'
  return (
    <div className={cx('card animate-rise p-3', flashed && 'animate-flash', done && 'opacity-75')}>
      <div className="flex items-start gap-2.5">
        <span className={cx('grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white', grad)}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className={cx('text-[13px] font-semibold leading-snug', done && 'line-through decoration-fg-3')}>{t.title}</div>
          <div className="line-clamp-2 text-[11.5px] text-fg-3">{t.detail}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className="pill tone-muted">{label}</span>
        {room && <span className="pill tone-muted">Room {room.number}</span>}
        {t.priority === 'URGENT' && <span className="pill tone-alert"><CircleAlert className="size-3" /> urgent</span>}
        {t.requires_staff_confirmation && !done && <span className="pill tone-warn">charge needs confirmation</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {assignee ? <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-2"><Avatar name={assignee.display_name} size={20} /><span className="truncate">{assignee.display_name}{mine ? ' (you)' : ''}</span></span>
          : <span className="text-[11.5px] text-fg-3">Unassigned</span>}
        <span className="ml-auto shrink-0 text-[10.5px] text-fg-3">{done ? `done ${fmtTime(t.completed_at)}` : `due ${fmtTime(t.due_at)}`}</span>
      </div>
      {requiredSop && <div className="mt-2.5 rounded-control border border-border bg-surface-secondary p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent"><BookOpen className="size-3" /> {sop?.title ?? 'Required approved SOP'} · v{t.required_sop_version}</Badge>
          {t.arrival_deadline_at && <Badge tone="warning">Room arrival {fmtTime(t.arrival_deadline_at)}</Badge>}
        </div>
        <div className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-foreground-secondary">
          {eligible ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />}
          <span>{statusLabel}{eligible && !done ? ' · task actions enabled' : ''}</span>
        </div>
        <TaskTraining ctx={ctx} task={t} sopTitle={sop?.title ?? 'Housekeeping Turnover SOP'} sopCurrent={sopCurrent} />
      </div>}
      {t.status === 'QUEUED' && <Button variant="primary" disabled={pending || !eligible} onClick={() => onAct(t, 'ClaimTask')} className="mt-2.5 w-full">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />} {eligible ? 'Claim housekeeping task' : 'Practical approval required'}
      </Button>}
      {t.status === 'CLAIMED' && (mine
        ? <Button variant="secondary" disabled={pending || !eligible} onClick={() => onAct(t, 'StartTask')} className="mt-2.5 w-full">{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Start work</Button>
        : <div className="mt-2.5 text-center text-[11px] text-fg-3">Claimed by {assignee?.display_name ?? 'a colleague'}</div>)}
      {t.status === 'IN_PROGRESS' && (mine
        ? <Button variant="primary" disabled={pending || !eligible} onClick={onAttest} className="mt-2.5 w-full"><BadgeCheck className="size-3.5" /> Attest completed</Button>
        : <div className="mt-2.5 text-center text-[11px] text-fg-3">In progress · {assignee?.display_name ?? 'a colleague'}</div>)}
    </div>
  )
}

type Quiz = { title: string; version: number; questions: { key: string; prompt: string; choices: Record<string, string> }[] }
type QuizResult = { score: number; correct: number; total: number; passed: boolean; status: string; message: string }
type GuideResult = {
  answer: string | null; abstained: boolean; reason?: string; fallback?: string; error?: string
  source?: { title: string; version: number }; sources: { chunk_id: string; ordinal: number; quote: string }[]
}

function TaskTraining({ ctx, task, sopTitle, sopCurrent }: { ctx: OsContext; task: Task; sopTitle: string; sopCurrent: boolean }) {
  const [question, setQuestion] = useState('')
  const [guide, setGuide] = useState<GuideResult | null>(null)
  const [guideBusy, setGuideBusy] = useState(false)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizSubmitting, setQuizSubmitting] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [reviewStaffId, setReviewStaffId] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const staffOptions = ctx.snap.staff.filter((s) => s.enabled && s.role === 'ROOM_ATTENDANT')
  const reviewStaff = staffOptions.find((s) => s.id === reviewStaffId) ?? staffOptions.find((s) => s.id !== ctx.me.id)
  const reviewCompetency = reviewStaff && task.required_sop_document_id && task.required_sop_version
    ? competencyFor(ctx, task, reviewStaff.id) : undefined
  const supervisor = ['HOUSEKEEPING_SUPERVISOR', 'GENERAL_MANAGER'].includes(ctx.me.role)

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) return
    setGuideBusy(true); setGuide(null)
    try {
      const res = await fetch('/api/training/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.id, question: question.trim() }) })
      const data = await res.json()
      if (!res.ok) setGuide({ answer: null, abstained: true, error: data.error ?? 'SOP guide is unavailable.', source: data.source, sources: [] })
      else setGuide(data as GuideResult)
    } catch {
      setGuide({ answer: null, abstained: true, error: 'Connection failed. Read the approved SOP and ask your supervisor.', sources: [] })
    } finally { setGuideBusy(false) }
  }

  async function openQuiz() {
    setQuizBusy(true); setQuizError(null); setQuiz(null); setQuizResult(null); setAnswers({})
    try {
      const res = await fetch(`/api/training/quiz?task_id=${encodeURIComponent(task.id)}`)
      const data = await res.json()
      if (!res.ok) setQuizError(data.error ?? 'Knowledge check is unavailable.')
      else setQuiz(data as Quiz)
    } catch { setQuizError('Connection failed. Ask your supervisor to open the approved SOP.') }
    finally { setQuizBusy(false) }
  }

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quiz || Object.keys(answers).length !== quiz.questions.length) return
    setQuizSubmitting(true); setQuizError(null)
    try {
      const res = await fetch('/api/training/quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.id, answers }) })
      const data = await res.json()
      if (!res.ok) setQuizError(data.error ?? 'Knowledge check could not be submitted.')
      else { setQuizResult(data as QuizResult); await ctx.actions.refresh() }
    } catch { setQuizError('Connection failed. Your answers were not confirmed.') }
    finally { setQuizSubmitting(false) }
  }

  async function review(action: 'SUPERVISED' | 'PRACTICALLY_APPROVED' | 'REJECT') {
    if (!reviewStaff) return
    setReviewBusy(true)
    const label = action === 'SUPERVISED' ? 'Supervised practice recorded' : action === 'PRACTICALLY_APPROVED' ? 'Practical competency approved' : 'More supervised practice requested'
    const result = await ctx.actions.post('/api/training/practical', { task_id: task.id, staff_id: reviewStaff.id, action }, label)
    if (result) await ctx.actions.refresh()
    setReviewBusy(false)
  }

  return <details className="mt-2.5 border-t border-border pt-2" open={false}>
    <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[11px] font-semibold text-foreground-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <Sparkles className="size-3.5 text-accent" /> Georgian SOP guide · knowledge check · signoff
    </summary>
    <div className="space-y-3 pt-2">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold text-foreground">Ask from the approved SOP</div>
          <Button variant="subtle" className="!h-6 !px-1.5 !text-[10px]" onClick={() => ctx.actions.go('drive')}><BookOpen className="size-3" /> Open Knowledge</Button>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-4 text-foreground-muted">Answers use only the current approved {sopTitle} · v{task.required_sop_version}. If evidence is missing, the guide abstains.</p>
        <form onSubmit={ask} className="mt-2 space-y-1.5">
          <label htmlFor={`sop-question-${task.id}`} className="sr-only">Ask a housekeeping SOP question in Georgian</label>
          <Input id={`sop-question-${task.id}`} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
            placeholder="მაგალითად: რა გავაკეთო, თუ სტუმრის ნივთი დარჩა?" disabled={!sopCurrent || guideBusy} />
          <div className="flex items-center gap-1.5">
            <Button type="submit" variant="primary" loading={guideBusy} disabled={!sopCurrent || !question.trim()} className="flex-1"><Sparkles className="size-3" /> Ask Mia</Button>
            <Button type="button" variant="outline" disabled={!sopCurrent || guideBusy} onClick={() => setQuestion('რა გავაკეთო, თუ სტუმრის პირადი ნივთი დარჩა?')}>Sample question</Button>
          </div>
        </form>
        {!sopCurrent && <p role="alert" className="mt-1 text-[10.5px] text-destructive">This task references an outdated or unapproved SOP. Stop and ask a supervisor before working.</p>}
        {guide && <Card className="mt-2 !p-2.5" role={guide.abstained ? 'status' : 'region'} aria-label="SOP answer and evidence">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-foreground">
            {guide.abstained ? <CircleAlert className="size-3.5 text-warning" /> : <CircleCheck className="size-3.5 text-success" />}
            {guide.abstained ? 'No grounded answer — human guidance needed' : 'Grounded SOP answer'}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-foreground-secondary">{guide.answer ?? guide.fallback ?? guide.error}</p>
          {guide.source && <div className="mt-2 text-[10px] font-medium text-foreground">Source: {guide.source.title} · v{guide.source.version}</div>}
          {guide.sources.map((source) => <blockquote key={source.chunk_id} className="mt-1.5 border-l-2 border-accent/50 pl-2 text-[10px] leading-4 text-foreground-muted">
            <div>Section {source.ordinal} · chunk {source.chunk_id.slice(0, 8)}</div>{source.quote}
          </blockquote>)}
          {(guide.abstained || guide.error) && <div className="mt-2 text-[10px] text-foreground-muted">
            {ctx.snap.staff.filter((s) => ['HOUSEKEEPING_SUPERVISOR', 'GENERAL_MANAGER'].includes(s.role)).map((s) => `${s.display_name}${ctx.online.has(s.id) ? ' · online' : ''}`).join(' · ') || 'Ask the on-duty housekeeping supervisor'}
          </div>}
          <p className="mt-2 border-t border-border pt-1.5 text-[9.5px] leading-4 text-foreground-muted">AI explains the SOP only. It cannot qualify staff, change task status, or release a room.</p>
        </Card>}
      </div>

      <div className="border-t border-border pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[11px] font-semibold text-foreground">Knowledge check</div><div className="text-[10px] text-foreground-muted">A pass permits supervised work only.</div></div>
          {!quiz && <Button variant="outline" disabled={!sopCurrent || quizBusy} loading={quizBusy} onClick={openQuiz}><BadgeCheck className="size-3" /> Start check</Button>}
        </div>
        {quizError && <p role="alert" className="mt-1.5 text-[10.5px] text-destructive">{quizError}</p>}
        {quiz && <form onSubmit={submitQuiz} className="mt-2 space-y-2">
          {quiz.questions.map((q, index) => <fieldset key={q.key} className="rounded-control border border-border p-2">
            <legend className="px-1 text-[10.5px] font-medium text-foreground">{index + 1}. {q.prompt}</legend>
            <div className="space-y-1.5">
              {Object.entries(q.choices).map(([key, text]) => <label key={key} className="flex cursor-pointer items-start gap-2 text-[10.5px] leading-4 text-foreground-secondary">
                <input type="radio" name={`quiz-${task.id}-${q.key}`} value={key} checked={answers[q.key] === key}
                  onChange={() => setAnswers((current) => ({ ...current, [q.key]: key }))} className="mt-0.5 accent-[var(--accent)]" />{text}
              </label>)}
            </div>
          </fieldset>)}
          <Button type="submit" variant="primary" loading={quizSubmitting} disabled={quizSubmitting || Object.keys(answers).length !== quiz.questions.length} className="w-full"><BadgeCheck className="size-3.5" /> Submit knowledge check</Button>
        </form>}
        {quizResult && <div className="mt-2 rounded-control border border-border bg-surface-secondary p-2 text-[10.5px]" role="status">
          <div className="font-semibold text-foreground">{quizResult.message}</div><div className="mt-0.5 text-foreground-secondary">Score {quizResult.correct}/{quizResult.total} · {quizResult.score}% · supervisor signoff still required</div>
        </div>}
      </div>

      <div className="border-t border-border pt-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><UserCheck className="size-3.5 text-accent" /> Practical competency · supervisor decision</div>
        {!supervisor ? <p className="mt-1 text-[10px] text-foreground-muted">A housekeeping supervisor must observe practice and approve independent work.</p>
          : <div className="mt-2 space-y-2">
            <label htmlFor={`review-staff-${task.id}`} className="block text-[10px] text-foreground-secondary">Employee being reviewed</label>
            <select id={`review-staff-${task.id}`} value={reviewStaff?.id ?? ''} onChange={(e) => setReviewStaffId(e.target.value)}
              className="h-8 w-full rounded-control border border-border bg-control px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {staffOptions.filter((s) => s.id !== ctx.me.id).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </select>
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-foreground-secondary">{reviewStaff?.display_name ?? 'No other room attendant'} · {reviewCompetency?.status ?? 'NOT_TRAINED'}</span>
              {reviewCompetency?.status === 'PRACTICALLY_APPROVED' && <Badge tone="success">Independent work approved</Badge>}
            </div>
            {reviewCompetency?.status === 'KNOWLEDGE_CHECK_PASSED' && <div className="space-y-1.5">
              <p className="text-[10px] leading-4 text-foreground-muted">Confirm only after observing a supervised turnover in person. This action records that human observation.</p>
              <Button variant="secondary" loading={reviewBusy} disabled={reviewBusy || !reviewStaff} onClick={() => review('SUPERVISED')} className="w-full"><UserCheck className="size-3.5" /> Record observed supervised practice</Button>
              <Button variant="subtle" disabled={reviewBusy || !reviewStaff} onClick={() => review('REJECT')} className="w-full">Needs more practice</Button>
            </div>}
            {reviewCompetency?.status === 'SUPERVISED' && <div className="space-y-1.5">
              <p className="text-[10px] leading-4 text-foreground-muted">Approve only when the employee demonstrates the full SOP safely without prompting.</p>
              <Button variant="primary" loading={reviewBusy} disabled={reviewBusy || !reviewStaff} onClick={() => review('PRACTICALLY_APPROVED')} className="w-full"><ShieldCheck className="size-3.5" /> Approve independent housekeeping work</Button>
              <Button variant="subtle" disabled={reviewBusy || !reviewStaff} onClick={() => review('REJECT')} className="w-full">Needs more practice</Button>
            </div>}
            {(!reviewCompetency || reviewCompetency.status === 'NOT_TRAINED') && <p className="text-[10px] text-foreground-muted">Employee must pass the knowledge check before a practical review.</p>}
          </div>}
      </div>
    </div>
  </details>
}

function AttestModal({ t, ctx, onClose, onConfirm }: { t: Task; ctx: OsContext; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const room = ctx.snap.rooms.find((r) => r.id === t.room_id)
  return (
    <div className="fixed inset-0 z-40 grid animate-fade place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md animate-pop p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow">Human attestation</div>
            <div className="mt-1 text-[16px] font-semibold">{t.title}</div>
            <div className="text-[12px] text-fg-3">{room ? `Room ${room.number} · ` : ''}{ctx.me.display_name}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-2">Only a person can mark service as done. The AI never claims completion — the guest is notified after this attestation is recorded.</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.04] p-3 text-[13px] ring-1 ring-line">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-[#0a84ff]" />
          <span>I personally completed and checked this hotel service.</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button disabled={!checked || busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false) }} className="btn btn-primary">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} Attest & complete
          </button>
        </div>
      </div>
    </div>
  )
}
