import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cx } from './cx'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
}

const CONTROL =
  'w-full min-h-24 rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:border-primary disabled:bg-surface-muted disabled:cursor-not-allowed'

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
