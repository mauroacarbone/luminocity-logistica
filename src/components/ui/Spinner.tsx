import { cx } from './cx'

type SpinnerSize = 'sm' | 'md' | 'lg'

const SIZE: Record<SpinnerSize, string> = {
  sm: 'size-4 border-2',
  md: 'size-7 border-[3px]',
  lg: 'size-10 border-4',
}

export function Spinner({
  size = 'md',
  label = 'Cargando…',
  className,
}: {
  size?: SpinnerSize
  label?: string
  className?: string
}) {
  return (
    <span className={cx('inline-flex items-center justify-center', className)} role="status">
      <span
        className={cx(
          'animate-spin rounded-full border-border border-t-primary',
          SIZE[size],
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
