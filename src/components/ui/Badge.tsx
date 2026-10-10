import type { ReactNode } from 'react'
import { cx } from './cx'

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'orange'
  | 'primary'

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-subtle',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  purple: 'bg-purple-soft text-purple',
  orange: 'bg-orange-soft text-orange',
  primary: 'bg-primary-soft text-primary-ink',
}

const SIZE_CLASS = {
  sm: 'px-2 py-0.5',
  md: 'px-2.5 py-0.5',
} as const

type BadgeProps = {
  tone?: BadgeTone
  size?: keyof typeof SIZE_CLASS
  dot?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  icon,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full text-xs font-medium',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? (
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </span>
  )
}
