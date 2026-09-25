import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ChevronRight, Loader2, type LucideIcon } from 'lucide-react'
import { cx } from './ui'

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'outline' | 'destructive'
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  loading?: boolean
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'border border-transparent bg-accent text-accent-foreground hover:bg-accent/90',
  secondary: 'border border-border bg-surface-secondary text-foreground hover:bg-elevated',
  subtle: 'border border-transparent bg-transparent text-foreground-secondary hover:bg-surface-secondary hover:text-foreground',
  outline: 'border border-border bg-transparent text-foreground hover:bg-surface-secondary',
  destructive: 'border border-transparent bg-destructive text-app-bg hover:bg-destructive/90',
}

const buttonBase = 'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

/** Compact semantic button. Loading keeps the label visible and prevents repeat activation. */
export function Button({
  type = 'button',
  variant = 'secondary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonBase, buttonVariants[variant], className)}
    >
      {loading && <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />}
      {children}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'aria-label'> & {
  label: string
  icon: ReactNode
}

/** Icon-only button with a required accessible name and a visible title hint. */
export function IconButton({ label, icon, title, className, loading = false, ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      title={title ?? label}
      aria-label={label}
      loading={loading}
      className={cx('!w-8 !px-0', className)}
    >
      {!loading && icon}
    </Button>
  )
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

/** Compact text input. Supply a visible label or aria-label at the call site. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  className,
  disabled,
  invalid = false,
  'aria-invalid': ariaInvalid,
  ...props
}, ref) {
  return (
    <input
      {...props}
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || ariaInvalid || undefined}
      className={cx(
        'h-8 w-full rounded-control border bg-control px-2.5 text-xs text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:cursor-not-allowed disabled:opacity-55',
        invalid || ariaInvalid ? 'border-destructive focus-visible:ring-destructive' : 'border-border focus-visible:border-accent focus-visible:ring-focus',
        className,
      )}
    />
  )
})

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive'
export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & { tone?: BadgeTone; children: ReactNode }

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-secondary text-foreground-secondary',
  accent: 'border-accent/35 bg-accent-subtle text-accent',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
}

/** Non-interactive status or metadata label; include text so tone is never the only signal. */
export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx('inline-flex min-h-5 items-center gap-1 rounded-control border px-1.5 py-0.5 text-[11px] font-medium leading-none', badgeTones[tone], className)}
    >
      {children}
    </span>
  )
}

export type CardProps = HTMLAttributes<HTMLDivElement>

/** Flat bordered panel using the shared surface and spacing tokens. */
export function Card({ className, ...props }: CardProps) {
  return <div {...props} className={cx('rounded-card border border-border bg-surface p-card', className)} />
}

export type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

/** Compact empty content for the panel or section that has no data. */
export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex min-h-28 flex-col items-center justify-center gap-2 px-card py-card text-center', className)}>
      {Icon && <Icon aria-hidden="true" className="size-5 text-foreground-muted" />}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <div className="max-w-md text-xs leading-5 text-foreground-secondary">{description}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: 'small' | 'default' | 'full'
}

/** Shared page width and gutter; choose full width for dense work surfaces. */
export function PageContainer({ size = 'default', className, ...props }: PageContainerProps) {
  const widths = {
    small: 'max-w-3xl',
    default: 'max-w-page-content',
    full: 'max-w-none',
  }
  return <div {...props} className={cx('mx-auto w-full space-y-section px-page', widths[size], className)} />
}

export type BreadcrumbItem = {
  label: ReactNode
  href?: string
  onClick?: () => void
}

export type BreadcrumbsProps = HTMLAttributes<HTMLElement> & { items: BreadcrumbItem[] }

/** Accessible breadcrumb trail with caller-owned navigation behavior. */
export function Breadcrumbs({ items, className, ...props }: BreadcrumbsProps) {
  return (
    <nav {...props} aria-label="Breadcrumb" className={cx('min-w-0 border-b border-border-muted py-2', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-xs">
        {items.map((item, index) => {
          const current = index === items.length - 1
          const textClass = current ? 'truncate font-medium text-foreground' : 'truncate text-foreground-muted hover:text-foreground-secondary'

          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {current ? (
                <span aria-current="page" className={textClass}>{item.label}</span>
              ) : item.href ? (
                <a href={item.href} className={textClass}>{item.label}</a>
              ) : item.onClick ? (
                <button type="button" onClick={item.onClick} className={cx(textClass, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg')}>
                  {item.label}
                </button>
              ) : (
                <span className={textClass}>{item.label}</span>
              )}
              {!current && <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-foreground-muted" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Compact page title block; list and table filters belong beside their content. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('flex flex-wrap items-start justify-between gap-3 py-3', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-lg font-semibold leading-6 text-foreground">{title}</h1>
        {description && <p className="max-w-3xl text-xs leading-5 text-foreground-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export type PageSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/** Related content grouping with optional heading, description, and local actions. */
export function PageSection({ title, description, actions, className, children, ...props }: PageSectionProps) {
  const headingId = useId()
  return (
    <section {...props} aria-labelledby={title ? headingId : undefined} className={cx('space-y-3', className)}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && <h2 id={headingId} className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-xs leading-5 text-foreground-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
