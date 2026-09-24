import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Building2, ChevronDown, Clock, LogOut, Moon, Palette, Radio, Sun, UserRound } from 'lucide-react'
import { Avatar, OPERATOR, TZ, cx, fmtTime } from '../App.jsx'
import { ACCENTS } from './LeftRail.jsx'

const TONE_DOT = { info: 'bg-blue-400', warn: 'bg-amber-400', ok: 'bg-emerald-400', alert: 'bg-rose-400', muted: 'bg-fg-3' }

export default function Header({ ctx, current, theme, setTheme, accent, setAccent, notes, markRead, clearNotes }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const unread = notes.filter((n) => !n.read).length
  const toggle = (k) => { setOpen((o) => (o === k ? null : k)); if (k === 'bell') markRead() }
  const p = ctx.ov.property

  return (
    <header ref={ref} className="relative z-20 flex h-[60px] shrink-0 items-center gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-fg/[0.06] ring-1 ring-line"><Building2 className="size-4 text-fg-2" /></div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold tracking-tight">{p.name}</div>
          <div className="truncate text-[11.5px] text-fg-3">{p.region} · {current.key === 'home' ? 'Workspace' : current.title}</div>
        </div>
        <span className="pill tone-ok hidden md:inline-flex"><span className="size-1.5 rounded-full bg-emerald-400" /> Space {p.lifecycle.toLowerCase()}</span>
        <span className={cx('pill hidden lg:inline-flex', ctx.live === 'live' ? 'tone-info' : 'tone-warn')}>
          <Radio className={cx('size-3', ctx.live === 'live' && 'animate-pulse-soft')} /> {ctx.live === 'live' ? 'Live' : ctx.live}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <TbilisiClock />
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="icon-btn" aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        <div className="relative">
          <button onClick={() => toggle('palette')} className={cx('icon-btn', open === 'palette' && 'bg-fg/[0.08] text-fg')} aria-label="Palette"><Palette className="size-[18px]" /></button>
          {open === 'palette' && (
            <div className="popover absolute top-full right-0 mt-2 w-60 animate-pop p-3">
              <div className="text-[13px] font-semibold">Palette</div>
              <div className="mt-0.5 text-[11.5px] text-fg-3">Accent used for actions and highlights</div>
              <div className="mt-3 grid grid-cols-6 gap-2">
                {ACCENTS.map((a) => (
                  <button key={a.key} onClick={() => setAccent(a.key)} aria-label={a.key} title={a.key}
                    className={cx('aspect-square rounded-full transition hover:scale-110', accent === a.key && 'ring-2 ring-fg ring-offset-2 ring-offset-elev')} style={{ background: a.hex }} />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-fg/[0.05] p-1">
                {[['dark', Moon], ['light', Sun]].map(([k, I]) => (
                  <button key={k} onClick={() => setTheme(k)} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-medium capitalize transition', theme === k ? 'bg-card text-fg shadow ring-1 ring-line' : 'text-fg-2')}>
                    <I className="size-3.5" /> {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => toggle('bell')} className={cx('icon-btn relative', open === 'bell' && 'bg-fg/[0.08] text-fg')} aria-label="Notifications">
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute top-1 right-1 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-[#ff453a] px-1 text-[10px] font-bold text-white ring-2 ring-canvas">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {open === 'bell' && (
            <div className="popover absolute top-full right-0 mt-2 w-80 animate-pop">
              <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
                <div className="text-[13px] font-semibold">Notifications</div>
                {notes.length > 0 && <button onClick={clearNotes} className="text-[11.5px] text-accent hover:underline">Clear</button>}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notes.length === 0 && <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-[12px] text-fg-3"><BellOff className="size-5" /> You're all caught up</div>}
                {notes.map((n) => (
                  <button key={n.id} onClick={() => { ctx.go(n.view); setOpen(null) }} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-fg/[0.05]">
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[n.tone] || TONE_DOT.muted)} />
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
          <button onClick={() => toggle('me')} className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition hover:bg-fg/[0.06]">
            <Avatar name={OPERATOR.name} size={30} online />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[12.5px] font-semibold">{OPERATOR.name}</span>
              <span className="block text-[10.5px] text-fg-3">{OPERATOR.role}</span>
            </span>
            <ChevronDown className="hidden size-3.5 text-fg-3 md:block" />
          </button>
          {open === 'me' && (
            <div className="popover absolute top-full right-0 mt-2 w-56 animate-pop">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={OPERATOR.name} size={34} />
                <div className="min-w-0 leading-tight"><div className="truncate text-[13px] font-semibold">{OPERATOR.name}</div><div className="text-[11px] text-fg-3">{OPERATOR.role} · on shift</div></div>
              </div>
              <div className="my-1 h-px bg-line" />
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-fg-2"><UserRound className="size-4" /> Signed in as the demo operator</div>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-fg-3"><LogOut className="size-4" /> Sign-out is disabled locally</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function TbilisiClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <div className="mr-1 hidden items-center gap-1.5 rounded-full bg-fg/[0.05] px-3 py-1.5 ring-1 ring-line lg:flex" title="Property time (Asia/Tbilisi)">
      <Clock className="size-3.5 text-fg-3" />
      <span className="font-mono text-[12px] tabular-nums">{new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)}</span>
      <span className="text-[11px] text-fg-3">Tbilisi</span>
    </div>
  )
}
