import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md' | 'lg'

type ButtonBase = {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  children?: ReactNode
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>

type ButtonProps =
  | (ButtonBase & { iconOnly?: false | undefined })
  | (ButtonBase & { iconOnly: true; 'aria-label': string })

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-primary hover:bg-surface-2',
  ghost: 'bg-transparent text-primary hover:bg-surface-2',
  danger: 'bg-danger-deep text-inverse hover:bg-danger',
  'danger-outline': 'border border-danger-deep bg-transparent text-danger-deep hover:bg-danger-soft',
}

const SIZE: Record<Size, string> = {
  sm: 'h-9 min-h-9 px-3 text-[15px]',
  md: 'h-11 min-h-11 px-4 text-base',
  lg: 'h-[52px] min-h-[52px] px-5 text-base',
}

const ICON_ONLY: Record<Size, string> = {
  sm: 'h-9 w-9 min-h-9 px-0',
  md: 'h-11 w-11 min-h-11 px-0',
  lg: 'size-[52px] min-h-[52px] px-0',
}

function Spinner() {
  return (
    <span
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    leftIcon,
    rightIcon,
    iconOnly = false,
    fullWidth = false,
    type = 'button',
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const leading = leftIcon ?? icon
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold',
        'transition duration-150 active:scale-[.98]',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANT[variant],
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className={cx('inline-flex items-center justify-center gap-2', loading && 'invisible')}>
        {leading ? <span className="inline-flex shrink-0">{leading}</span> : null}
        {iconOnly ? null : children}
        {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  )
})
