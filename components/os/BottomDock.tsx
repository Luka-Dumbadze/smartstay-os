'use client'

import { cx, type AppDef, type ViewKey } from './ui'

const MOBILE_LABELS: Partial<Record<ViewKey, string>> = {
  home: 'Home',
  contact: 'Inbox',
  crm: 'Guests',
  ops: 'Ops',
  drive: 'Knowledge',
  ai: 'AI Team',
  analytics: 'Insights',
}

/** Compact mobile shortcuts; the workspace sidebar remains the complete navigation on every screen size. */
export default function BottomDock({ items, active, onSelect, badges = {} }: {
  items: AppDef[]
  active: ViewKey
  onSelect: (v: ViewKey) => void
  badges?: Partial<Record<ViewKey, number>>
}) {
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid min-h-14 grid-cols-7 border-t border-border-muted bg-sidebar-bg px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const isActive = active === item.key
        const Icon = item.dockIcon
        const label = MOBILE_LABELS[item.key] ?? item.title
        const badge = badges[item.key] ?? 0
        const countDescription = item.key === 'contact' ? 'unread guest messages' : 'open tasks'
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-label={badge > 0 ? label + ', ' + badge + ' ' + countDescription : label}
            aria-current={isActive ? 'page' : undefined}
            title={item.title}
            className={cx(
              'relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-0.5 py-1.5 text-[9px] leading-none transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
              isActive ? 'text-accent' : 'text-foreground-muted hover:text-foreground-secondary',
            )}
          >
            {isActive && <span aria-hidden="true" className="absolute top-0 h-0.5 w-6 rounded-b bg-accent" />}
            <span className="relative grid size-5 place-items-center">
              <Icon aria-hidden="true" className="size-4" />
              {badge > 0 && (
                <span aria-hidden="true" className="absolute -right-2 -top-1 grid min-h-3.5 min-w-3.5 place-items-center rounded-full border border-sidebar-bg bg-accent px-0.5 text-[8px] font-semibold leading-none text-accent-foreground">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
