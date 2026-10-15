import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'

type Trend = 'up' | 'down'
type TrendTone = 'success' | 'danger' | 'neutral'

type KpiCardProps = {
  title: ReactNode
  value: ReactNode
  trend?: { direction: Trend; label: ReactNode; tone?: TrendTone }
  icon?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
}

const TREND = {
  up: 'text-success',
  down: 'text-danger',
} as const

const TONE = {
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-muted',
} as const

function TrendMark({
  direction,
  label,
  tone,
}: {
  direction: Trend
  label: ReactNode
  tone?: TrendTone
}) {
  return (
    <p className={cx('mt-2 inline-flex items-center gap-1 text-sm font-semibold', tone ? TONE[tone] : TREND[direction])}>
      <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
      {label}
    </p>
  )
}

function Body({ title, value, trend, icon }: KpiCardProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{title}</p>
        {icon ? <span className="text-primary">{icon}</span> : null}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text">{value}</p>
      {trend ? <TrendMark direction={trend.direction} label={trend.label} tone={trend.tone} /> : null}
    </>
  )
}

const SHELL =
  'block w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-sm'

export function KpiCard(props: KpiCardProps) {
  const { href, onClick, className } = props
  if (href) {
    return (
      <Link
        to={href}
        className={cx(
          SHELL,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          className,
        )}
      >
        <Body {...props} />
      </Link>
    )
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(
          SHELL,
          'cursor-pointer transition duration-150 hover:bg-surface-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          className,
        )}
      >
        <Body {...props} />
      </button>
    )
  }
  return (
    <article className={cx(SHELL, className)}>
      <Body {...props} />
    </article>
  )
}
