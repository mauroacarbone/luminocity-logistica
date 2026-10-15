import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cx } from './cx'

type ControlSize = 'sm' | 'md' | 'lg'

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  invalid?: boolean
  size?: ControlSize
}

const HEIGHT: Record<ControlSize, string> = {
  sm: 'h-9 min-h-9 text-[15px]',
  md: 'h-11 min-h-11 text-[15px]',
  lg: 'h-[52px] min-h-[52px] text-base',
}

const CONTROL =
  'w-full rounded-[10px] border border-border bg-surface px-3 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:border-primary disabled:bg-surface-muted disabled:cursor-not-allowed'

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, disabled, size = 'md', children, ...rest },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'] ?? invalid
  return (
    <select
      ref={ref}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      className={cx(CONTROL, HEIGHT[size], (ariaInvalid || invalid) && 'border-danger', className)}
      {...rest}
    >
      {children}
    </select>
  )
})
