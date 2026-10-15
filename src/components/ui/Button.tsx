import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

type ButtonBase = {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
  children?: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>

type ButtonProps =
  | (ButtonBase & { iconOnly?: false | undefined })
  | (ButtonBase & { iconOnly: true; 'aria-label': string })

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface border border-border text-primary hover:bg-surface-2',
  ghost: 'bg-transparent text-primary hover:bg-surface-2',
  danger: 'bg-danger-deep text-inverse hover:bg-danger',
}

function Spinner() {
  return (
    <span
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  )
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconOnly = false,
  fullWidth = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const sizeClass = iconOnly
    ? size === 'sm'
      ? 'min-h-11 w-11 sm:min-h-8 sm:w-8'
      : 'min-h-11 w-11 sm:min-h-9 sm:w-9'
    : size === 'sm'
      ? 'min-h-11 px-3 text-sm sm:min-h-8'
      : 'min-h-11 px-4 text-sm sm:min-h-9'

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        sizeClass,
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
      {iconOnly ? null : children}
    </button>
  )
}
