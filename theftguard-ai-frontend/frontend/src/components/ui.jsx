import { Link } from 'react-router-dom'
import Icon from './Icon'
import { CATEGORIES } from '../lib/risk'

export const cx = (...c) => c.filter(Boolean).join(' ')

const BUTTON = {
  primary: 'bg-gold text-ink hover:bg-[#E0B220] border border-gold',
  dark: 'bg-ink text-white hover:bg-[#2A2A2A] border border-ink',
  secondary: 'bg-white text-ink hover:bg-mist border border-ink',
  ghost: 'bg-transparent text-ink hover:bg-mist border border-transparent',
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, to, ...rest }) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'px-3 py-1.5 text-sm min-h-[36px]' : 'px-4 py-2.5 text-sm min-h-[44px]',
    BUTTON[variant],
    className,
  )
  const inner = (
    <>
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </>
  )
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>
  return <button type="button" className={cls} {...rest}>{inner}</button>
}

export function Badge({ tone = 'grey', children, className }) {
  const tones = {
    gold: 'bg-gold text-ink border-gold',
    outline: 'bg-white text-ink border-ink',
    grey: 'bg-mist text-muted border-line',
    ok: 'bg-white text-ok border-ok',
    info: 'bg-pale text-gold-deep border-gold',
  }
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

export function CategoryBadge({ category }) {
  const tone = { review: 'gold', elevated: 'outline', none: 'grey', unscored: 'grey' }[category]
  return <Badge tone={tone}>{CATEGORIES[category].label}</Badge>
}

export function Notice({ tone = 'info', title, children, className }) {
  const tones = {
    info: 'border-gold bg-pale',
    warn: 'border-ink bg-white',
    danger: 'border-danger bg-white',
    ok: 'border-ok bg-white',
  }
  const icon = { info: 'info', warn: 'alert', danger: 'alert', ok: 'check' }[tone]
  const color = { info: 'text-gold-deep', warn: 'text-ink', danger: 'text-danger', ok: 'text-ok' }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded border-l-4 border-y border-r border-y-line border-r-line p-3 text-sm', tones[tone], className)}>
      <Icon name={icon} className={cx('mt-0.5 h-5 w-5 shrink-0', color)} />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-ink/90">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#D6DAE0" strokeWidth="3" />
        <path d="M21 12a9 9 0 00-9-9" stroke="#0F0F0F" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function Panel({ title, subtitle, actions, children, className, bodyClassName }) {
  return (
    <section className={cx('rounded border border-line bg-white', className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, children, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {children ? <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
    </div>
  )
}

export function Field({ label, hint, htmlFor, children, className }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {hint ? <p className="mb-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-1">{children}</div>
    </div>
  )
}

export const inputClass =
  'w-full rounded border border-ink bg-white px-3 py-2 text-sm placeholder:text-muted disabled:cursor-not-allowed disabled:border-line disabled:bg-mist'

// Model Score on a 0 to 1 scale with the display bands marked. A marker, not a verdict.
export function ScoreScale({ score, thresholds, wide }) {
  if (score === null || score === undefined) return <span className="text-sm text-muted">Not scored</span>
  const left = `${Math.min(100, Math.max(0, score * 100))}%`
  return (
    <div className={cx('relative', wide ? 'h-8 w-full' : 'h-6 w-28')} role="img" aria-label={`Model Score ${score.toFixed(3)} on a scale from 0 to 1`}>
      <div className="absolute inset-x-0 top-1/2 flex h-2 -translate-y-1/2 overflow-hidden rounded-sm border border-line">
        <div className="bg-mist" style={{ width: `${thresholds.elevated * 100}%` }} />
        <div className="bg-pale" style={{ width: `${(thresholds.review - thresholds.elevated) * 100}%` }} />
        <div className="flex-1 bg-gold" />
      </div>
      <div className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-ink" style={{ left }} />
    </div>
  )
}

export function DemoBadge({ children = 'Demo data' }) {
  return <Badge tone="info">{children}</Badge>
}
