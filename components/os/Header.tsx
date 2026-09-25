'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Clock, LogOut, Menu, Radio, Sparkles, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Badge, Button, IconButton } from './primitives'
import { initials, ROLE_LABEL, TZ, cx, fmtTime, type OsContext, type ViewKey } from './ui'

export type Note = { id: string; at: string; read: boolean; tone: 'info' | 'warn' | 'ok' | 'alert' | 'muted'; title: string; body: string; view: ViewKey }
const TONE_DOT: Record<Note['tone'], string> = {
  info: 'bg-accent',
  warn: 'bg-warning',
  ok: 'bg-success',
  alert: 'bg-destructive',
  muted: 'bg-foreground-muted',
}

/** Compact operational top bar for page context, live updates, notifications, Mia, and the signed-in user. */
export default function Header({
  ctx, title, email, notes, onReadAll, onClear, navigationOpen, onToggleNavigation, onOpenMia,
}: {
  ctx: OsContext
  title: string
  email: string
  notes: Note[]
  onReadAll: () => void
  onClear: () => void
  navigationOpen: boolean
  onToggleNavigation: () => void
  onOpenMia: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState<'bell' | 'me' | null>(null)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const unread = notes.filter((note) => !note.read).length
  const space = ctx.snap.space

  async function signOut() {
    await supabaseBrowser().auth.signOut()
    router.refresh()
  }

  return (
    <header ref={ref} className="relative z-20 flex h-top-nav shrink-0 items-center gap-2 border-b border-border-muted bg-app-bg px-page">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <IconButton
          className="lg:hidden"
          label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
          icon={navigationOpen ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />}
          aria-expanded={navigationOpen}
          aria-controls="smartstay-mobile-navigation"
          onClick={onToggleNavigation}
        />
        <div className="min-w-0 leading-tight">
          <div className="hidden truncate text-[12.5px] font-medium text-foreground lg:block">{title}</div>
          <div className="min-w-0 lg:hidden">
            <div className="truncate text-[10.5px] text-foreground-muted">{space.name}</div>
            <div className="truncate text-[12px] font-medium text-foreground">{title}</div>
          </div>
        </div>
        <Badge tone="neutral" className="hidden shrink-0 sm:inline-flex">
          Property {space.lifecycle.toLowerCase()}
        </Badge>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <TbilisiClock />
        <Badge
          tone={ctx.live === 'live' ? 'success' : ctx.live === 'polling' ? 'warning' : 'neutral'}
          aria-live="polite"
          className="shrink-0"
          title="Live updates"
        >
          <Radio aria-hidden="true" className="size-3" />
          {ctx.live === 'live' ? 'Live' : ctx.live === 'polling' ? 'Polling' : 'Connecting'}
        </Badge>
        <IconButton
          className="lg:hidden"
          label="Ask Mia"
          icon={<Sparkles aria-hidden="true" className="size-4" />}
          onClick={onOpenMia}
        />
        <div className="relative">
          <IconButton
            className={cx('relative', open === 'bell' && 'bg-surface-secondary text-foreground')}
            label={unread > 0 ? unread + ' unread notifications' : 'Notifications'}
            icon={<Bell aria-hidden="true" className="size-4" />}
            aria-expanded={open === 'bell'}
            onClick={() => { setOpen((currentOpen) => currentOpen === 'bell' ? null : 'bell'); onReadAll() }}
          />
          {unread > 0 && (
            <span aria-hidden="true" className="pointer-events-none absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full border border-app-bg bg-destructive px-1 text-[9px] font-semibold leading-none text-app-bg">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          {open === 'bell' && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-80 max-w-[calc(100vw-1.5rem)] rounded-overlay border border-border bg-elevated p-1.5 shadow-overlay">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <div className="text-[12px] font-semibold text-foreground">Notifications</div>
                {notes.length > 0 && (
                  <button
                    type="button"
                    onClick={onClear}
                    className="rounded-control px-1.5 py-1 text-[11px] text-foreground-secondary hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notes.length === 0 && (
                  <div role="status" className="flex flex-col items-center gap-1.5 px-3 py-6 text-[11px] text-foreground-muted">
                    <BellOff aria-hidden="true" className="size-5" />
                    You&apos;re all caught up
                  </div>
                )}
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => { ctx.actions.go(note.view); setOpen(null) }}
                    className="flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span aria-hidden="true" className={cx('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[note.tone])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-medium text-foreground">{note.title}</span>
                      <span className="block truncate text-[10.5px] text-foreground-muted">{note.body}</span>
                    </span>
                    <span className="shrink-0 text-[9.5px] text-foreground-muted">{fmtTime(note.at)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((currentOpen) => currentOpen === 'me' ? null : 'me')}
            aria-label={'User menu for ' + ctx.me.display_name}
            aria-expanded={open === 'me'}
            className="flex size-8 items-center justify-center rounded-control text-foreground-secondary transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto sm:gap-2 sm:px-1.5"
          >
            <UserMark name={ctx.me.display_name} />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-28 truncate text-[11px] font-medium text-foreground">{ctx.me.display_name}</span>
              <span className="block text-[9.5px] text-foreground-muted">{ROLE_LABEL[ctx.me.role] ?? ctx.me.role}</span>
            </span>
          </button>
          {open === 'me' && (
            <div role="region" aria-label="Account menu" className="absolute right-0 top-full z-50 mt-1.5 w-60 max-w-[calc(100vw-1.5rem)] rounded-overlay border border-border bg-elevated p-1.5 shadow-overlay">
              <div className="flex items-center gap-2.5 px-2 py-2">
                <UserMark name={ctx.me.display_name} size={30} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12px] font-semibold text-foreground">{ctx.me.display_name}</div>
                  <div className="truncate text-[10px] text-foreground-muted">{email}</div>
                </div>
              </div>
              <div className="my-1 h-px bg-border-muted" />
              <Button onClick={signOut} variant="subtle" className="w-full justify-start text-destructive hover:text-destructive">
                <LogOut aria-hidden="true" className="size-3.5" />
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function UserMark({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-border bg-surface-secondary text-[9px] font-semibold text-foreground-secondary"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  )
}

function TbilisiClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="mr-0.5 hidden h-7 items-center gap-1.5 rounded-control border border-border-muted bg-surface-secondary px-2 text-foreground-secondary xl:flex" title="Property time (Asia/Tbilisi)">
      <Clock aria-hidden="true" className="size-3 text-foreground-muted" />
      <span className="font-mono text-[10px] tabular-nums">
        {now ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now) : '--:--:--'}
      </span>
      <span className="text-[10px] text-foreground-muted">Tbilisi</span>
    </div>
  )
}
