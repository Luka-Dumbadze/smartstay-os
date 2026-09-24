import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, BadgeCheck, CircleAlert, Filter, KeyRound, Mail, Phone, Plus, Search, Star, Table2, X } from 'lucide-react'
import { Avatar, ViewTitle, cx, fmtDate } from '../App.jsx'

// Preview rows illustrate a populated table; only the first row (the live profile) comes from the CRM backend.
const SAMPLE_ROWS = [
  { id: 'GST-2041', name: 'Dianne Russell', email: 'dianne.russell@example.com', arrival: '2026-09-27', departure: '2026-09-30', tier: 'Silver', status: 'Arriving', prefs: [['Hypoallergenic pillow'], ['Spa access']] },
  { id: 'GST-1987', name: 'Marco Bellini', email: 'marco.bellini@example.it', arrival: '2026-09-21', departure: '2026-09-26', tier: 'Gold', status: 'In-house', prefs: [['Amber wines'], ['Late breakfast']] },
  { id: 'GST-2102', name: 'Ahmed Al-Farsi', email: 'a.alfarsi@example.ae', arrival: '2026-09-23', departure: '2026-09-29', tier: 'Platinum', status: 'In-house', prefs: [['Airport transfer'], ['Halal dining']] },
  { id: 'GST-2115', name: 'Sophie Laurent', email: 'sophie.laurent@example.fr', arrival: '2026-10-14', departure: '2026-10-16', tier: 'Member', status: 'Enquiry', prefs: [['Group dinner'], ['Shellfish allergy', true]] },
  { id: 'GST-1874', name: 'Hannah Weber', email: 'h.weber@example.de', arrival: '2026-09-18', departure: '2026-09-22', tier: 'Member', status: 'Departed', prefs: [['Quiet room'], ['Gluten-free', true]] },
]
const TIER = { Platinum: 'tone-violet', Gold: 'tone-warn', Silver: 'tone-muted', Member: 'tone-muted' }
const STAY = { Arriving: 'tone-info', 'In-house': 'tone-ok', Departed: 'tone-muted', Enquiry: 'tone-violet' }

export default function CrmView({ ctx }) {
  const g = ctx.ov.guest
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(null)
  const [onlyStaying, setOnlyStaying] = useState(false)
  const [open, setOpen] = useState(null)

  const rows = useMemo(() => {
    const live = {
      live: true, id: `GST-${g.id.slice(-4).toUpperCase()}`, name: g.full_name, email: g.email, phone: g.phone_e164, arrival: g.arrival_date, departure: g.departure_date,
      tier: g.loyalty_tier, status: g.stay_status === 'IN_HOUSE' ? 'In-house' : g.stay_status === 'ARRIVING' ? 'Arriving' : 'Departed', room: g.room_number,
      prefs: g.preferences.map((p) => [p.sensitive ? `${p.value} allergy` : p.value, p.sensitive, p]),
    }
    let r = [live, ...SAMPLE_ROWS]
    if (onlyStaying) r = r.filter((x) => ['Arriving', 'In-house'].includes(x.status))
    if (q) r = r.filter((x) => `${x.name} ${x.email} ${x.id} ${x.prefs.map((p) => p[0]).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    if (sort) r = [...r].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : a.arrival.localeCompare(b.arrival)))
    return r
  }, [g, q, sort, onlyStaying])
  const selected = rows.find((r) => r.id === open)

  return (
    <div className="mx-auto max-w-7xl space-y-4 pt-2">
      <ViewTitle crumb={['Customers', 'Table 1']} sub="Guest profiles, stays and preferences" />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-1.5 rounded-lg bg-fg/[0.07] px-2.5 py-1.5 text-[12.5px] font-semibold"><Table2 className="size-3.5" /> Table 1</span>
            <span className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-fg-3" title="Additional views are not part of the MVP"><Plus className="size-3.5" /></span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="input w-44 py-1.5 pl-8 text-[12.5px]" />
            </label>
            <button onClick={() => setOnlyStaying((v) => !v)} className={cx('btn', onlyStaying ? 'bg-accent/15 text-accent' : 'btn-outline')}><Filter className="size-3.5" /> {onlyStaying ? 'Staying now' : 'Filter'}</button>
            <button onClick={() => setSort((s) => (s === 'name' ? 'arrival' : s === 'arrival' ? null : 'name'))} className={cx('btn', sort ? 'bg-accent/15 text-accent' : 'btn-outline')}>
              <ArrowUpDown className="size-3.5" /> {sort === 'name' ? 'Name A–Z' : sort === 'arrival' ? 'Arrival' : 'Sort'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-fg-3">
                {['Name', 'ID', 'Email', 'Stay dates', 'Preferences', 'Tier', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} className={cx('cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-fg/[0.03]', open === r.id && 'bg-accent/[0.07]')}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.name} size={30} online={r.live} />
                      <span className="font-medium">{r.name}</span>
                      {r.live && <span className="pill tone-info py-0 text-[9.5px]">LIVE</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-fg-2">{r.id}</td>
                  <td className="px-4 py-2.5 text-fg-2">{r.email}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-fg-2">{fmtDate(r.arrival)} → {fmtDate(r.departure)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex max-w-[320px] flex-wrap gap-1">
                      {r.prefs.map(([label, sensitive]) => (
                        <span key={label} className={cx('pill text-[11px]', sensitive ? 'tone-alert' : 'tone-muted')}>{sensitive && <CircleAlert className="size-3" />}{label}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><span className={cx('pill', TIER[r.tier] || 'tone-muted')}>{r.tier === 'Gold' && <Star className="size-3 fill-current" />}{r.tier}</span></td>
                  <td className="px-4 py-2.5"><span className={cx('pill', STAY[r.status])}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="px-4 py-10 text-center text-[12.5px] text-fg-3">No customers match.</div>}
        </div>
        <div className="border-t border-line px-4 py-2 text-[11.5px] text-fg-3">{rows.length} records · the LIVE row is read from the guest CRM; other rows are preview data</div>
      </div>
      {selected && <ProfileSheet r={selected} g={g} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ProfileSheet({ r, g, onClose }) {
  const nights = Math.round((new Date(r.departure) - new Date(r.arrival)) / 86400000)
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex animate-fade justify-end bg-black/25" onClick={onClose}>
      <aside className="glass m-3 w-full max-w-sm animate-slide-in overflow-y-auto rounded-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <Avatar name={r.name} size={56} online={r.live} />
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="mt-3 text-lg font-semibold">{r.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
          <span className="font-mono">{r.id}</span>
          <span className={cx('pill', TIER[r.tier] || 'tone-muted')}>{r.tier}</span>
          <span className={cx('pill', STAY[r.status])}>{r.status}</span>
        </div>
        <div className="mt-4 space-y-2 text-[12.5px]">
          <div className="flex items-center gap-2 text-fg-2"><Mail className="size-4 text-fg-3" /> {r.email}</div>
          {r.phone && <div className="flex items-center gap-2 text-fg-2"><Phone className="size-4 text-fg-3" /> {r.phone} {g.contact_verified_at && r.live && <span className="pill tone-ok"><BadgeCheck className="size-3" /> verified</span>}</div>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
          {[['Arrival', fmtDate(r.arrival)], ['Departure', fmtDate(r.departure)], [r.room ? 'Room' : 'Nights', r.room || nights]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-fg/[0.05] px-2.5 py-2"><div className="text-fg-3">{k}</div><div className="font-semibold">{v}</div></div>
          ))}
        </div>
        <div className="eyebrow mt-5 mb-2">Preferences</div>
        <div className="space-y-1.5">
          {r.prefs.map(([label, sensitive, p]) => (
            <div key={label} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] ring-1', sensitive ? 'bg-rose-500/[0.07] ring-rose-500/25' : 'bg-fg/[0.03] ring-line')}>
              {sensitive ? <CircleAlert className="size-4 text-rose-400" /> : <Star className="size-3.5 text-fg-3" />}
              <span className="flex-1">{p ? `${p.label}: ${p.value}` : label}</span>
              {p && <span className="text-[10.5px] text-fg-3">{p.basis.replace('_', ' ')}</span>}
              {sensitive && <KeyRound className="size-3.5 text-fg-3" title="Staff-only" />}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-fg-3">{r.live ? 'Live profile from the guest CRM. Sensitive facts are held under explicit consent and shown to staff only.' : 'Preview record - not stored in the backend.'}</p>
      </aside>
    </div>
  )
}
