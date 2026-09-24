'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, BadgeCheck, CircleAlert, Copy, Filter, KeyRound, Link2, Loader2, Mail, Phone, Search, Send, Star, Table2, UsersRound, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Avatar, Empty, ViewTitle, cx, fmtDate, type OsContext, type Profile } from './ui'

const TIER: Record<string, string> = { Platinum: 'tone-violet', Gold: 'tone-warn', Silver: 'tone-muted' }
const STAY: Record<string, string> = { BOOKED: 'tone-info', IN_HOUSE: 'tone-ok', DEPARTED: 'tone-muted', CANCELLED: 'tone-muted' }

/** CRM (App 2): Notion-style guest table over guest_crm.profiles, identities, stays and preferences (RLS-scoped). */
export default function CrmView({ ctx }: { ctx: OsContext }) {
  const { snap } = ctx
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'arrival' | null>(null)
  const [staying, setStaying] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    let list = snap.profiles.map((p) => {
      const stay = snap.stays.filter((s) => s.profile_id === p.id && s.status !== 'CANCELLED').sort((a, b) => a.arrival_date.localeCompare(b.arrival_date))[0]
      const room = snap.rooms.find((r) => r.id === stay?.room_id)
      const prefs = snap.preferences.filter((f) => f.profile_id === p.id)
      const telegram = snap.identities.find((i) => i.profile_id === p.id && i.channel === 'telegram' && !i.external_id.startsWith('sim-'))
      return { p, stay, room, prefs, telegram }
    })
    if (staying) list = list.filter((r) => r.stay && ['BOOKED', 'IN_HOUSE'].includes(r.stay.status))
    if (q) list = list.filter((r) => `${r.p.full_name} ${r.p.email ?? ''} ${r.p.phone_e164 ?? ''} ${r.prefs.map((f) => f.value).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    if (sort === 'name') list = [...list].sort((a, b) => a.p.full_name.localeCompare(b.p.full_name))
    if (sort === 'arrival') list = [...list].sort((a, b) => (a.stay?.arrival_date ?? '9999').localeCompare(b.stay?.arrival_date ?? '9999'))
    return list
  }, [snap, q, sort, staying])
  const selected = rows.find((r) => r.p.id === open)

  return (
    <div className="mx-auto max-w-7xl space-y-4 pt-2">
      <ViewTitle crumb={['Customers', 'Table 1']} sub="Guest profiles, stays, preferences and channel identities" />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12.5px] font-semibold"><Table2 className="size-3.5" /> Table 1</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="input w-44 py-1.5 pl-8 text-[12.5px]" />
            </label>
            <button onClick={() => setStaying((v) => !v)} className={cx('btn', staying ? 'bg-accent/15 text-accent' : 'btn-outline')}><Filter className="size-3.5" /> {staying ? 'Staying now' : 'Filter'}</button>
            <button onClick={() => setSort((s) => (s === 'name' ? 'arrival' : s === 'arrival' ? null : 'name'))} className={cx('btn', sort ? 'bg-accent/15 text-accent' : 'btn-outline')}>
              <ArrowUpDown className="size-3.5" /> {sort === 'name' ? 'Name A–Z' : sort === 'arrival' ? 'Arrival' : 'Sort'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] text-fg-3">
                {['Name', 'ID', 'Contact', 'Stay', 'Preferences', 'Tier', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, stay, room, prefs, telegram }) => (
                <tr key={p.id} onClick={() => setOpen(p.id)} className={cx('cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.03]', open === p.id && 'bg-accent/[0.07]')}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.full_name} size={30} />
                      <span className="font-medium">{p.full_name}</span>
                      {p.provisional && <span className="pill tone-warn py-0 text-[9.5px]">NEW</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-fg-2">GST-{p.id.slice(-4).toUpperCase()}</td>
                  <td className="px-4 py-2.5 text-fg-2">
                    <div className="truncate">{p.email ?? p.phone_e164 ?? '—'}</div>
                    {telegram && <div className="flex items-center gap-1 text-[11px] text-[#2aabee]"><Send className="size-3" />{telegram.username ? `@${telegram.username}` : 'Telegram linked'}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-fg-2">{stay ? <>{room ? `Room ${room.number} · ` : ''}{fmtDate(stay.arrival_date)} → {fmtDate(stay.departure_date)}</> : '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex max-w-[340px] flex-wrap gap-1">
                      {prefs.map((f) => (
                        <span key={f.id} className={cx('pill text-[11px]', f.sensitive ? 'tone-alert' : 'tone-muted')}>
                          {f.sensitive && <CircleAlert className="size-3" />}{f.sensitive ? `${f.value} allergy` : f.value}
                        </span>
                      ))}
                      {!prefs.length && <span className="text-fg-3">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{p.loyalty_tier ? <span className={cx('pill', TIER[p.loyalty_tier] ?? 'tone-muted')}>{p.loyalty_tier === 'Gold' && <Star className="size-3 fill-current" />}{p.loyalty_tier}</span> : <span className="text-fg-3">—</span>}</td>
                  <td className="px-4 py-2.5">{stay ? <span className={cx('pill', STAY[stay.status] ?? 'tone-muted')}>{stay.status.replace('_', '-').toLowerCase()}</span> : <span className="pill tone-muted">enquiry</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="p-6"><Empty icon={UsersRound} title="No guests match">Guests are created from bookings, or automatically when an unknown Telegram user writes.</Empty></div>}
        </div>
        <div className="border-t border-line px-4 py-2 text-[11.5px] text-fg-3">{rows.length} record{rows.length === 1 ? '' : 's'} · live from guest_crm (row-level security: this property only)</div>
      </div>
      {selected && <ProfileSheet ctx={ctx} profile={selected.p} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ProfileSheet({ ctx, profile, onClose }: { ctx: OsContext; profile: Profile; onClose: () => void }) {
  const { snap } = ctx
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const stays = snap.stays.filter((s) => s.profile_id === profile.id)
  const prefs = snap.preferences.filter((f) => f.profile_id === profile.id)
  const identities = snap.identities.filter((i) => i.profile_id === profile.id)
  const activeStay = stays.find((s) => ['BOOKED', 'IN_HOUSE'].includes(s.status))
  const bot = snap.channels.find((c) => c.kind === 'telegram')?.bot_username

  async function createLink() {
    setBusy(true)
    const { data, error } = await supabaseBrowser().schema('guest_crm').rpc('create_link_token', { p_profile_id: profile.id, p_stay_id: activeStay?.id ?? null })
    setBusy(false)
    if (error) { ctx.actions.toast(error.message, 'error'); return }
    setLink(bot ? `https://t.me/${bot}?start=${data as string}` : String(data))
  }

  return (
    <div className="fixed inset-0 z-40 flex animate-fade justify-end bg-black/25" onClick={onClose}>
      <aside className="glass m-3 w-full max-w-sm animate-slide-in overflow-y-auto rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <Avatar name={profile.full_name} size={56} />
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="mt-3 text-lg font-semibold">{profile.full_name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
          <span className="font-mono">GST-{profile.id.slice(-4).toUpperCase()}</span>
          {profile.loyalty_tier && <span className={cx('pill', TIER[profile.loyalty_tier] ?? 'tone-muted')}>{profile.loyalty_tier}</span>}
          <span className="pill tone-muted">{profile.locale.toUpperCase()}</span>
          {profile.provisional && <span className="pill tone-warn">provisional — review</span>}
        </div>
        <div className="mt-4 space-y-2 text-[12.5px]">
          {profile.email && <div className="flex items-center gap-2 text-fg-2"><Mail className="size-4 text-fg-3" /> {profile.email}</div>}
          {profile.phone_e164 && <div className="flex items-center gap-2 text-fg-2"><Phone className="size-4 text-fg-3" /> {profile.phone_e164} {profile.contact_verified_at && <span className="pill tone-ok"><BadgeCheck className="size-3" /> verified</span>}</div>}
          {identities.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-fg-2"><Send className="size-4 text-[#2aabee]" /> {i.external_id.startsWith('sim-') ? 'Simulator identity' : `Telegram ${i.username ? `@${i.username}` : i.external_id}`} {i.verified_at && <span className="pill tone-ok"><BadgeCheck className="size-3" /> linked</span>}</div>
          ))}
        </div>
        <div className="eyebrow mb-2 mt-5">Stays</div>
        <div className="space-y-1.5">
          {stays.map((s) => {
            const room = snap.rooms.find((r) => r.id === s.room_id)
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] ring-1 ring-line">
                <span className="flex-1">Room {room?.number ?? '—'} · {fmtDate(s.arrival_date)} → {fmtDate(s.departure_date)}</span>
                <span className={cx('pill', STAY[s.status] ?? 'tone-muted')}>{s.status.replace('_', '-').toLowerCase()}</span>
              </div>
            )
          })}
          {!stays.length && <div className="text-[12px] text-fg-3">No stays on record.</div>}
        </div>
        <div className="eyebrow mb-2 mt-5">Preferences</div>
        <div className="space-y-1.5">
          {prefs.map((f) => (
            <div key={f.id} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] ring-1', f.sensitive ? 'bg-rose-500/[0.07] ring-rose-500/25' : 'bg-white/[0.03] ring-line')}>
              {f.sensitive ? <CircleAlert className="size-4 text-rose-400" /> : <Star className="size-3.5 text-fg-3" />}
              <span className="flex-1">{f.label}: {f.value}</span>
              <span className="text-[10.5px] text-fg-3">{f.basis.replace('_', ' ')}</span>
              {f.sensitive && <span title="Staff-only; never placed in AI prompts"><KeyRound className="size-3.5 text-fg-3" /></span>}
            </div>
          ))}
          {!prefs.length && <div className="text-[12px] text-fg-3">No preferences recorded.</div>}
        </div>
        <div className="eyebrow mb-2 mt-5">Telegram</div>
        {link ? (
          <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-line">
            <div className="break-all font-mono text-[11.5px] text-fg-2">{link}</div>
            <button onClick={() => { navigator.clipboard?.writeText(link); ctx.actions.toast('Link copied') }} className="btn btn-soft mt-2 w-full"><Copy className="size-3.5" /> Copy link for the guest</button>
          </div>
        ) : (
          <button onClick={createLink} disabled={busy} className="btn btn-outline w-full">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} Create Telegram deep link</button>
        )}
        <p className="mt-2 text-[11px] text-fg-3">The one-time link binds the guest&apos;s Telegram account to this profile and stay (valid 30 days).</p>
      </aside>
    </div>
  )
}
