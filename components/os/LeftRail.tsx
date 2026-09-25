'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Building2, ChevronDown, Info, Lock, RefreshCw, Scale, Send, ShieldCheck,
  SlidersHorizontal, Sparkles, Users, X, type LucideIcon,
} from 'lucide-react'
import { APPS, HOME_APP, initials, ROLE_LABEL, cx, type OsContext, type ViewKey } from './ui'
import { Badge, Button } from './primitives'

type ToolKey = 'info' | 'telegram' | 'privacy' | 'settings'
type NavigationGroup = { label: string; items: { key: ViewKey; label: string }[] }

const NAVIGATION: NavigationGroup[] = [
  { label: 'COMMAND', items: [{ key: 'home', label: 'Home' }] },
  { label: 'GUESTS', items: [{ key: 'contact', label: 'Contact Center' }, { key: 'crm', label: 'Guests' }] },
  { label: 'OPERATIONS', items: [{ key: 'ops', label: 'Operations' }] },
  { label: 'INTELLIGENCE', items: [{ key: 'ai', label: 'AI Team' }, { key: 'drive', label: 'Knowledge' }, { key: 'analytics', label: 'Insights' }] },
  { label: 'PLATFORM', items: [{ key: 'builder', label: 'Builder' }, { key: 'store', label: 'App Store' }] },
]

/** Persistent hotel workspace navigation, workspace tools, live staff presence, and Mia entry point. */
export default function LeftRail({
  ctx, active, badges = {}, onOpenMia, mobileOpen, onCloseMobile,
}: {
  ctx: OsContext
  active: ViewKey
  badges?: Partial<Record<ViewKey, number>>
  onOpenMia: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const [open, setOpen] = useState<ToolKey | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const { snap } = ctx
  const running = snap.sessions.some((session) => session.state === 'RUNNING')
  const staff = [...snap.staff].sort((a, b) => Number(ctx.online.has(b.id)) - Number(ctx.online.has(a.id)))
  const onlineCount = staff.filter((person) => ctx.online.has(person.id)).length
  const tools: { key: ToolKey; icon: LucideIcon; label: string }[] = [
    { key: 'info', icon: Info, label: 'Workspace info' },
    { key: 'telegram', icon: Send, label: 'Telegram channel' },
    { key: 'privacy', icon: Scale, label: 'Privacy & GDPR' },
    { key: 'settings', icon: SlidersHorizontal, label: 'Workspace settings' },
  ]

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const drawer = drawerRef.current
    const focusable = () => drawer
      ? Array.from(drawer.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])'))
      : []
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [mobileOpen, onCloseMobile])

  const contents = (mobile = false) => (
    <>
      <div className="shrink-0 space-y-3 border-b border-border-muted px-3 pb-3 pt-3">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-7 place-items-center rounded-control border border-border bg-surface text-accent">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <span className="text-[12px] font-semibold tracking-[0.1em] text-foreground">SMARTSTAY</span>
          {mobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close workspace navigation"
              className="ml-auto grid size-8 place-items-center rounded-control text-foreground-secondary hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5 rounded-control border border-border-muted bg-surface/70 px-2.5 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-control bg-surface-secondary text-foreground-secondary">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium text-foreground">{snap.space.name}</span>
            <span className="block text-[10.5px] text-foreground-muted">Hotel workspace</span>
          </span>
        </div>
      </div>

      <nav aria-label="Hotel workspace" className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <div className="space-y-2">
          {NAVIGATION.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="space-y-0.5">
              <div className="px-2.5 pb-1 pt-2 text-[9.5px] font-semibold tracking-[0.1em] text-foreground-muted">{group.label}</div>
              {group.items.map((item) => {
                const app = item.key === 'home' ? HOME_APP : APPS.find((entry) => entry.key === item.key)
                if (!app) return null
                const Icon = app.icon
                const count = badges[item.key] ?? 0
                const countDescription = item.key === 'contact' ? 'unread guest messages' : 'open tasks'
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      ctx.actions.go(item.key)
                      if (mobile) onCloseMobile()
                    }}
                    aria-current={active === item.key ? 'page' : undefined}
                    aria-label={count > 0 ? item.label + ', ' + count + ' ' + countDescription : undefined}
                    className={cx(
                      'group flex h-8 w-full items-center gap-2.5 rounded-control border border-transparent px-2.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      active === item.key
                        ? 'border-accent/10 border-l-2 border-l-accent bg-accent-subtle text-accent'
                        : 'text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className={cx('size-4 shrink-0', active === item.key ? 'text-accent' : 'text-foreground-muted group-hover:text-foreground-secondary')} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <Badge
                        aria-hidden="true"
                        tone={item.key === 'ops' ? 'warning' : 'accent'}
                        className="min-h-5 min-w-5 justify-center px-1 tabular-nums"
                      >
                        {count > 99 ? '99+' : count}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-border-muted pt-2">
          <details className="group/presence">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-control px-2.5 text-[11.5px] text-foreground-secondary hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
              <Users aria-hidden="true" className="size-4 shrink-0 text-foreground-muted" />
              <span className="min-w-0 flex-1">Team presence</span>
              <Badge tone={onlineCount > 0 ? 'success' : 'neutral'} className="min-h-5 px-1.5">
                {onlineCount} online
              </Badge>
              <ChevronDown aria-hidden="true" className="size-3.5 text-foreground-muted transition-transform group-open/presence:rotate-180" />
            </summary>
            <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-control border border-border-muted bg-surface/70 p-1">
              {staff.map((person) => {
                const isOnline = ctx.online.has(person.id)
                return (
                  <div key={person.id} className="flex items-center gap-2 rounded-control px-1.5 py-1">
                    <StaffMark name={person.display_name} online={isOnline} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-foreground-secondary">
                        {person.display_name}{person.id === ctx.me.id ? ' (you)' : ''}
                      </div>
                      <div className="truncate text-[10px] text-foreground-muted">{ROLE_LABEL[person.role] ?? person.role}</div>
                    </div>
                    <span className={cx('text-[10px]', isOnline ? 'text-success' : 'text-foreground-muted')}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                )
              })}
            </div>
          </details>

          <div className="px-2.5 pb-1 pt-3 text-[9.5px] font-semibold tracking-[0.1em] text-foreground-muted">WORKSPACE</div>
          <div className="space-y-0.5">
            {tools.map((tool) => {
              const Icon = tool.icon
              const isOpen = open === tool.key
              return (
                <div key={tool.key}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={'workspace-panel-' + tool.key}
                    onClick={() => setOpen((currentOpen) => currentOpen === tool.key ? null : tool.key)}
                    className={cx(
                      'flex h-8 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[11.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      isOpen ? 'bg-surface-secondary text-foreground' : 'text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className={cx('size-4', isOpen ? 'text-accent' : 'text-foreground-muted')} />
                    <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                    <ChevronDown aria-hidden="true" className={cx('size-3.5 text-foreground-muted transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <div
                      id={'workspace-panel-' + tool.key}
                      role="region"
                      aria-label={tool.label}
                      className="mt-1 rounded-card border border-border bg-elevated p-3"
                    >
                      {tool.key === 'info' && <InfoPanel ctx={ctx} />}
                      {tool.key === 'telegram' && <TelegramPanel ctx={ctx} />}
                      {tool.key === 'privacy' && <PrivacyPanel ctx={ctx} />}
                      {tool.key === 'settings' && <SettingsPanel ctx={ctx} close={() => setOpen(null)} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="shrink-0 border-t border-border-muted p-3">
        <button
          type="button"
          onClick={onOpenMia}
          className="flex h-9 w-full items-center gap-2.5 rounded-control border border-border bg-surface px-2.5 text-left text-[12px] font-medium text-foreground-secondary transition-colors hover:border-border-strong hover:bg-surface-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="grid size-6 place-items-center rounded-control bg-accent-subtle text-accent">
            <Sparkles aria-hidden="true" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">Ask Mia</span>
          {running
            ? <Badge tone="success" className="min-h-5 px-1.5">Working</Badge>
            : <span className="text-[10px] text-foreground-muted">AI assistant</span>}
        </button>
      </div>
    </>
  )

  return (
    <div ref={shellRef} className="contents">
      <aside className="relative z-30 hidden h-full w-sidebar shrink-0 flex-col border-r border-border-muted bg-sidebar-bg lg:flex">
        {contents()}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close workspace navigation"
            onClick={() => { setOpen(null); onCloseMobile() }}
            className="absolute inset-0 cursor-default bg-overlay"
          />
          <aside
            id="smartstay-mobile-navigation"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Hotel workspace navigation"
            className="relative z-10 flex h-full w-[min(18rem,calc(100vw-2.5rem))] flex-col border-r border-border bg-sidebar-bg"
          >
            {contents(true)}
          </aside>
        </div>
      )}
    </div>
  )
}

function StaffMark({ name, online }: { name: string; online: boolean }) {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface-secondary text-[9px] font-medium text-foreground-secondary">
      {initials(name)}
      <span aria-hidden="true" className={cx('absolute -bottom-px -right-px size-2 rounded-full border border-sidebar-bg', online ? 'bg-success' : 'bg-foreground-muted')} />
    </span>
  )
}

function Row({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[11px]">
      <span className="shrink-0 text-foreground-muted">{k}</span>
      <span className={cx('truncate text-right text-foreground-secondary', mono && 'font-mono text-[10px]')}>{v}</span>
    </div>
  )
}

function Title({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-foreground">
      <Icon aria-hidden="true" className="size-3.5 text-accent" />
      {children}
    </div>
  )
}

function InfoPanel({ ctx }: { ctx: OsContext }) {
  const space = ctx.snap.space
  return (
    <>
      <Title icon={Info}>Workspace information</Title>
      <Row k="Property" v={space.name} />
      <Row k="Code" v={space.property_code} mono />
      <Row k="Region" v={space.region} />
      <Row k="Timezone" v={space.timezone} />
      <Row k="Lifecycle" v={space.lifecycle.toLowerCase()} />
      <Row k="Space ID" v={'…' + space.id.slice(-12)} mono />
      <Row k="Live updates" v={ctx.live} />
      <div className="mt-2 rounded-control border border-border-muted bg-surface-secondary p-2.5 text-[10.5px] leading-4 text-foreground-secondary">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <Lock aria-hidden="true" className="size-3.5 text-success" />
          Tenant isolation
        </div>
        Forced row-level security on every table; staff write only through audited RPCs.
      </div>
    </>
  )
}

function TelegramPanel({ ctx }: { ctx: OsContext }) {
  const telegram = ctx.snap.channels.find((channel) => channel.kind === 'telegram')
  const conversations = ctx.snap.conversations.filter((conversation) => conversation.channel_id === telegram?.id && !conversation.external_chat_id.startsWith('sim-')).length
  return (
    <>
      <Title icon={Send}>Telegram channel</Title>
      <Row k="Bot" v={telegram?.bot_username ? '@' + telegram.bot_username : 'not set'} />
      <Row k="Status" v={telegram?.enabled ? 'enabled' : 'disabled'} />
      <Row k="Live conversations" v={conversations} />
      {telegram?.bot_username && (
        <a
          href={'https://t.me/' + telegram.bot_username}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-control border border-border bg-surface-secondary px-2.5 text-xs font-medium text-foreground-secondary hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Send aria-hidden="true" className="size-3.5" />
          Open bot in Telegram
        </a>
      )}
      <p className="mt-2 text-[10.5px] leading-4 text-foreground-muted">Guests connect with a deep link from CRM → guest → “Telegram link”.</p>
    </>
  )
}

function PrivacyPanel({ ctx }: { ctx: OsContext }) {
  const sensitive = ctx.snap.preferences.filter((preference) => preference.sensitive).length
  return (
    <>
      <Title icon={Scale}>Privacy & GDPR</Title>
      <Row k="Guest profiles" v={ctx.snap.profiles.length} />
      <Row k="Sensitive facts" v={sensitive + ' · explicit consent'} />
      <Row k="Provisional profiles" v={ctx.snap.profiles.filter((profile) => profile.provisional).length} />
      <div className="mt-2 space-y-1.5 text-[10.5px] leading-4 text-foreground-secondary">
        <div className="flex gap-1.5"><ShieldCheck aria-hidden="true" className="mt-px size-3.5 shrink-0 text-success" /> Allergens are used for safety checks and never placed in AI prompts.</div>
        <div className="flex gap-1.5"><ShieldCheck aria-hidden="true" className="mt-px size-3.5 shrink-0 text-success" /> Messages are immutable; raw webhook payloads are hidden from staff.</div>
        <div className="flex gap-1.5"><ShieldCheck aria-hidden="true" className="mt-px size-3.5 shrink-0 text-success" /> Guests are told they are chatting with an AI (EU AI Act Art. 50).</div>
      </div>
    </>
  )
}

function SettingsPanel({ ctx, close }: { ctx: OsContext; close: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Title icon={SlidersHorizontal}>Workspace settings</Title>
      <Row k="Signed in as" v={ctx.me.display_name} />
      <Row k="Role" v={ROLE_LABEL[ctx.me.role] ?? ctx.me.role} />
      <Row k="Live updates" v={ctx.live === 'live' ? 'Realtime' : ctx.live === 'polling' ? 'Polling (12 s)' : 'Connecting'} />
      <Button
        disabled={busy}
        onClick={async () => { setBusy(true); await ctx.actions.refresh(); setBusy(false); close() }}
        variant="secondary"
        className="mt-2 w-full"
      >
        <RefreshCw aria-hidden="true" className={cx('size-3.5', busy && 'animate-spin')} />
        Reload workspace data
      </Button>
    </>
  )
}
