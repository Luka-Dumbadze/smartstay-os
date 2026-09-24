'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Building2, ChevronDown, Clock, LogOut, Radio } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Avatar, ROLE_LABEL, TZ, cx, fmtTime, type OsContext, type ViewKey } from './ui'

export type Note = { id: string; at: string; read: boolean; tone: 'info' | 'warn' | 'ok' | 'alert' | 'muted'; title: string; body: string; view: ViewKey }
const TONE_DOT: Record<Note['tone'], string> = { info: 'bg-blue-400', warn: 'bg-amber-400', ok: 'bg-emerald-400', alert: 'bg-rose-400', muted: 'bg-fg-3' }

/** Top control header: property title + status, Tbilisi clock, notification bell (Realtime events), profile menu. */
export default function Header({ ctx, title, email, notes, onReadAll, onClear }: {
  ctx: OsContext; title: string; email: string; notes: Note[]; onReadAll: () => void; onClear: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState<'bell' | 'me' | null>(null)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const unread = notes.filter((n) => !n.read).length
  const space = ctx.snap.space

  async function signOut() {
    await supabaseBrowser().auth.signOut()
    router.refresh()
  }

  return (
    <header ref={ref} className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-line"><Building2 className="size-4 text-fg-2" /></div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold tracking-tight">{space.name}</div>
          <div className="truncate text-[11.5px] text-fg-3">{space.region} · {title}</div>
        </div>
        <span className="pill tone-ok hidden md:inline-flex"><span className="size-1.5 rounded-full bg-emerald-400" /> Space {space.lifecycle.toLowerCase()}</span>
        <span className={cx('pill hidden lg:inline-flex', ctx.live === 'live' ? 'tone-info' : 'tone-warn')} title="Supabase Realtime">
          <Radio className={cx('size-3', ctx.live === 'live' && 'animate-pulse-soft')} />
          {ctx.live === 'live' ? 'Live' : ctx.live === 'polling' ? 'Polling' : 'Connecting'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <TbilisiClock />
        <div className="relative">
          <button onClick={() => { setOpen((o) => (o === 'bell' ? null : 'bell')); onReadAll() }} className={cx('icon-btn relative', open === 'bell' && 'bg-white/[0.08] text-fg')} aria-label="Notifications">
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-[#ff453a] px-1 text-[10px] font-bold text-white ring-2 ring-canvas">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {open === 'bell' && (
            <div className="popover absolute right-0 top-full mt-2 w-80 animate-pop">
              <div className="flex items-center justify-between px-2.5 pb-2 pt-1.5">
                <div className="text-[13px] font-semibold">Notifications</div>
                {notes.length > 0 && <button onClick={onClear} className="text-[11.5px] text-accent hover:underline">Clear</button>}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notes.length === 0 && <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-[12px] text-fg-3"><BellOff className="size-5" /> You&apos;re all caught up</div>}
                {notes.map((n) => (
                  <button key={n.id} onClick={() => { ctx.actions.go(n.view); setOpen(null) }} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05]">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[n.tone])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{n.title}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">{n.body}</span>
                    </span>
                    <span className="shrink-0 text-[10.5px] text-fg-3">{fmtTime(n.at)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative ml-1">
          <button onClick={() => setOpen((o) => (o === 'me' ? null : 'me'))} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-white/[0.06]">
            <Avatar name={ctx.me.display_name} size={30} online />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[12.5px] font-semibold">{ctx.me.display_name}</span>
              <span className="block text-[10.5px] text-fg-3">{ROLE_LABEL[ctx.me.role] ?? ctx.me.role}</span>
            </span>
            <ChevronDown className="hidden size-3.5 text-fg-3 md:block" />
          </button>
          {open === 'me' && (
            <div className="popover absolute right-0 top-full mt-2 w-60 animate-pop">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={ctx.me.display_name} size={34} />
                <div className="min-w-0 leading-tight"><div className="truncate text-[13px] font-semibold">{ctx.me.display_name}</div><div className="truncate text-[11px] text-fg-3">{email}</div></div>
              </div>
              <div className="my-1 h-px bg-line" />
              <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-fg-2 hover:bg-white/[0.05] hover:text-fg"><LogOut className="size-4" /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function TbilisiClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="mr-1 hidden items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 ring-1 ring-line lg:flex" title="Property time (Asia/Tbilisi)">
      <Clock className="size-3.5 text-fg-3" />
      <span className="font-mono text-[12px] tabular-nums">{now ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now) : '--:--:--'}</span>
      <span className="text-[11px] text-fg-3">Tbilisi</span>
    </div>
  )
}
