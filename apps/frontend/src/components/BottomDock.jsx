import { useState } from 'react'
import { cx } from '../App.jsx'

// macOS-style dock: neighbours magnify with distance from the hovered icon; the active app gets an indicator pill.
const SCALE = [1.32, 1.14, 1.04]

export default function BottomDock({ items, active, onSelect, badges = {} }) {
  const [hover, setHover] = useState(null)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
      <nav onMouseLeave={() => setHover(null)} aria-label="Dock"
        className="pointer-events-auto flex items-end gap-2 rounded-[26px] border border-white/10 bg-black/60 px-3 pt-2.5 pb-2 shadow-2xl backdrop-blur-md">
        {items.map((it, i) => {
          const d = hover === null ? 99 : Math.abs(hover - i)
          const s = SCALE[d] || 1
          const isActive = active === it.key
          const Icon = it.dockIcon || it.icon
          const badge = badges[it.key] || 0
          return (
            <div key={it.key} className="relative flex flex-col items-center">
              <span className={cx('pointer-events-none absolute -top-9 rounded-lg bg-black/80 px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-white shadow-lg ring-1 ring-white/10 transition-all duration-150',
                hover === i ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')}>{it.title}</span>
              <button onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onSelect(it.key)} aria-label={it.title}
                aria-current={isActive ? 'page' : undefined}
                className={cx('relative grid size-11 origin-bottom place-items-center rounded-full shadow-[0_8px_18px_-8px_rgb(0_0_0/0.8)] transition-transform duration-200 ease-out', it.dockColor)}
                style={{ transform: `translateY(${(s - 1) * -22}px) scale(${s})` }}>
                <Icon className="size-5" strokeWidth={2.2} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full bg-[#ff453a] px-1 text-[10px] font-bold text-white ring-2 ring-black/70">{badge > 9 ? '9+' : badge}</span>
                )}
              </button>
              <span className={cx('mt-1.5 h-1 rounded-full bg-white transition-all duration-300', isActive ? 'w-4 opacity-90' : 'w-1 opacity-0')} />
            </div>
          )
        })}
      </nav>
    </div>
  )
}
