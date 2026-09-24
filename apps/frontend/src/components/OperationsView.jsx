import { useState } from 'react'
import { BadgeCheck, BedDouble, CircleAlert, Hand, Headset, Loader2, Play, RotateCcw, Sparkles, Wine, Wrench, X } from 'lucide-react'
import { Avatar, ViewTitle, api, cx, fmtTime } from '../App.jsx'

const ROOM = {
  DIRTY: { label: 'DIRTY', tone: 'tone-alert', bar: 'bg-rose-400', step: 0, next: ['StartCleaning', 'Start cleaning', Sparkles] },
  CLEANING: { label: 'CLEANING', tone: 'tone-warn', bar: 'bg-amber-400', step: 1, next: ['MarkClean', 'Inspect & release', BadgeCheck] },
  CLEAN: { label: 'CLEAN', tone: 'tone-ok', bar: 'bg-emerald-400', step: 2, next: ['MarkDirty', 'Mark dirty', RotateCcw] },
}
const COLUMNS = [
  { key: 'QUEUED', label: 'Queued', dot: 'bg-amber-400' },
  { key: 'CLAIMED', label: 'Claimed', dot: 'bg-blue-400' },
  { key: 'IN_PROGRESS', label: 'In progress', dot: 'bg-violet-400' },
  { key: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-400' },
]
const CATEGORY = { housekeeping: [BedDouble, 'Housekeeping', 'from-[#30d158] to-[#0a84ff]'], food_beverage: [Wine, 'Cellar & F&B', 'from-[#ffb340] to-[#b3395b]'], front_desk: [Headset, 'Front desk', 'from-[#64d2ff] to-[#5e5ce6]'], maintenance: [Wrench, 'Maintenance', 'from-[#8e8e93] to-[#3a3a3c]'] }

export default function OperationsView({ ctx }) {
  const { ov, flash } = ctx
  const [attest, setAttest] = useState(null)
  const act = (t, action) => ctx.run(() => api(`/tasks/${t.id}/action`, { action, expected_version: t.state_version }),
    { ClaimTask: `Claimed: ${t.title}`, StartTask: `Started: ${t.title}`, AttestCompleted: `Completed & attested: ${t.title}` }[action])
  const roomAct = (r, action) => ctx.run(() => api(`/rooms/${r.number}/action`, { action }),
    { StartCleaning: `Room ${r.number}: cleaning started`, MarkClean: `Room ${r.number}: inspected & released`, MarkDirty: `Room ${r.number}: marked dirty` }[action])
  const open = ov.tasks.filter((t) => ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(t.status)).length

  return (
    <div className="mx-auto max-w-7xl space-y-6 pt-2">
      <ViewTitle crumb={['Operations', 'Room turnover']} sub={`${ov.stats.rooms_ready} of ${ov.stats.rooms_total} rooms ready · ${open} open service task${open === 1 ? '' : 's'}`} />

      <div className="grid gap-4 md:grid-cols-3">
        {ov.rooms.map((r) => {
          const st = ROOM[r.cleaning_state]
          const [action, label, Icon] = st.next
          const arriving = ov.guest.room_number === r.number && ov.guest.stay_status === 'ARRIVING'
          return (
            <div key={r.id + (flash['room:' + r.number] || '')} className={cx('card animate-rise p-5', flash['room:' + r.number] && 'animate-flash')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] text-fg-3">Room</div>
                  <div className="text-3xl font-semibold tracking-tight">{r.number}</div>
                  <div className="text-[12.5px] text-fg-2">{r.room_type} · {r.floor}</div>
                </div>
                <span className={cx('pill transition-all duration-300', st.tone)}>{st.label}</span>
              </div>
              <div className="mt-4 flex gap-1.5">
                {[0, 1, 2].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-all duration-500', i <= st.step ? st.bar : 'bg-fg/[0.08]')} />)}
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] text-fg-3"><span>Dirty</span><span>Cleaning</span><span>Clean</span></div>
              <div className="mt-4 flex items-center gap-2 text-[12px]">
                <span className={cx('pill', r.occupancy === 'OCCUPIED' ? 'tone-info' : 'tone-muted')}>{r.occupancy.toLowerCase()}</span>
                {arriving && <span className="pill tone-violet"><Avatar name={ov.guest.full_name} size={14} /> {ov.guest.full_name.split(' ')[0]} arriving today</span>}
              </div>
              <button onClick={() => roomAct(r, action)} className={cx('btn mt-4 w-full py-2', r.cleaning_state === 'CLEAN' ? 'btn-outline' : 'btn-primary')}>
                <Icon className="size-4" /> {label}
              </button>
              <div className="mt-2 text-center text-[10.5px] text-fg-3">v{r.version} · updated {fmtTime(r.updated_at)}{action === 'MarkClean' && ' · supervisor sign-off'}</div>
            </div>
          )
        })}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold">Service tasks <span className="text-[12px] font-normal text-fg-3">Claim → Start → Attest completed</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const items = ov.tasks.filter((t) => t.status === c.key)
            return (
              <div key={c.key} className="rounded-2xl bg-fg/[0.025] p-2.5 ring-1 ring-line">
                <div className="flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-[12.5px] font-semibold">
                  <span className={cx('size-2 rounded-full', c.dot)} />{c.label}<span className="ml-auto text-[11px] font-normal text-fg-3">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[11.5px] text-fg-3">{c.key === 'QUEUED' ? 'Guest requests create tasks here' : 'Nothing here'}</div>}
                  {items.map((t) => <TaskCard key={t.id + (flash['task:' + t.id] || '')} t={t} flashed={!!flash['task:' + t.id]} onAct={act} onAttest={() => setAttest(t)} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {attest && <AttestModal t={attest} onClose={() => setAttest(null)} onConfirm={async () => { await act(attest, 'AttestCompleted'); setAttest(null) }} />}
    </div>
  )
}

function TaskCard({ t, flashed, onAct, onAttest }) {
  const [Icon, label, grad] = CATEGORY[t.category] || CATEGORY.housekeeping
  const done = t.status === 'COMPLETED'
  return (
    <div className={cx('card animate-rise p-3', flashed && 'animate-flash', done && 'opacity-75')}>
      <div className="flex items-start gap-2.5">
        <span className={cx('grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white', grad)}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className={cx('text-[13px] font-semibold leading-snug', done && 'line-through decoration-fg-3')}>{t.title}</div>
          <div className="truncate text-[11.5px] text-fg-3">{t.detail}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
        <span className="pill tone-muted">{label}</span>
        <span className="pill tone-muted">Room {t.room_number}</span>
        {t.priority === 'URGENT' && <span className="pill tone-alert"><CircleAlert className="size-3" /> urgent</span>}
        {t.requires_staff_confirmation && !done && <span className="pill tone-warn">charge needs confirmation</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {t.assignee_name ? <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-2"><Avatar name={t.assignee_name} size={20} /><span className="truncate">{t.assignee_name}</span></span>
          : <span className="text-[11.5px] text-fg-3">Unassigned</span>}
        <span className="ml-auto shrink-0 text-[10.5px] text-fg-3">{done ? `done ${fmtTime(t.completed_at)}` : `due ${fmtTime(t.due_at)}`}</span>
      </div>
      {t.status === 'QUEUED' && <button onClick={() => onAct(t, 'ClaimTask')} className="btn btn-primary mt-2.5 w-full"><Hand className="size-3.5" /> Claim</button>}
      {t.status === 'CLAIMED' && <button onClick={() => onAct(t, 'StartTask')} className="btn btn-soft mt-2.5 w-full"><Play className="size-3.5" /> Start</button>}
      {t.status === 'IN_PROGRESS' && <button onClick={onAttest} className="btn mt-2.5 w-full bg-emerald-500 text-white hover:brightness-110"><BadgeCheck className="size-3.5" /> Attest Completed</button>}
    </div>
  )
}

function AttestModal({ t, onClose, onConfirm }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-40 grid animate-fade place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md animate-pop p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow">Human attestation</div>
            <div className="mt-1 text-[16px] font-semibold">{t.title}</div>
            <div className="text-[12px] text-fg-3">Room {t.room_number} · {t.assignee_name}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-2">Only a person can mark service as done. The AI never claims completion - the guest is notified after this attestation is recorded.</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-fg/[0.04] p-3 text-[13px] ring-1 ring-line">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-[var(--c-accent)]" />
          <span>I personally completed and checked this hotel service.</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button disabled={!checked || busy} onClick={async () => { setBusy(true); await onConfirm() }} className="btn btn-primary">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} Attest & complete
          </button>
        </div>
      </div>
    </div>
  )
}
