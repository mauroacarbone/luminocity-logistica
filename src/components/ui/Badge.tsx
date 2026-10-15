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
  neutral: 'bg-neutral-soft text-neutral',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  purple: 'bg-info-soft text-info',
  orange: 'bg-warning-soft text-warning',
  primary: 'bg-primary-soft text-primary',
}

const DOT_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-neutral',
  success: 'bg-success-dot',
  warning: 'bg-warning-dot',
  danger: 'bg-danger-dot',
  info: 'bg-info-dot',
  purple: 'bg-info-dot',
  orange: 'bg-warning-dot',
  primary: 'bg-primary',
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
        'inline-flex items-center gap-1 rounded-full border border-current text-xs font-medium',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? (
        <span className={cx('size-1.5 shrink-0 rounded-full', DOT_CLASS[tone])} aria-hidden="true" />
      ) : null}
      {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </span>
  )
}
