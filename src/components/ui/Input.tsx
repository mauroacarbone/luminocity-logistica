import { forwardRef, type InputHTMLAttributes } from 'react'
import { cx } from './cx'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

const CONTROL =
  'w-full rounded-xl border border-border bg-surface px-3 text-sm text-text min-h-11 sm:min-h-9 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:bg-surface-muted disabled:cursor-not-allowed'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, disabled, ...rest },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'] ?? invalid
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      className={cx(CONTROL, (ariaInvalid || invalid) && 'border-danger', className)}
      {...rest}
    />
  )
})
