import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
}

const CONTROL =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text min-h-24 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:bg-surface-muted disabled:cursor-not-allowed'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, disabled, ...rest },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'] ?? invalid
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      aria-invalid={ariaInvalid || undefined}
      className={cx(CONTROL, (ariaInvalid || invalid) && 'border-danger', className)}
      {...rest}
    />
  )
})
