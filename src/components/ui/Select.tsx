import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cx } from './cx'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
}

const CONTROL =
  'w-full rounded-xl border border-border bg-surface px-3 text-sm text-text min-h-11 sm:min-h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:bg-surface-muted disabled:cursor-not-allowed'

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, disabled, children, ...rest },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'] ?? invalid
  return (
    <select
      ref={ref}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      className={cx(CONTROL, (ariaInvalid || invalid) && 'border-danger', className)}
      {...rest}
    >
      {children}
    </select>
  )
})
