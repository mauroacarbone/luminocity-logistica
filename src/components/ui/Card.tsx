import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'

type CardAs = 'div' | 'section' | 'article' | 'li'
type Padding = 'none' | 'sm' | 'md'

const PADDING: Record<Padding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
}

type CardProps = {
  as?: CardAs
  padding?: Padding
  interactive?: boolean
  className?: string
  children?: ReactNode
} & HTMLAttributes<HTMLElement>

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as = 'div', padding = 'md', interactive = false, className, children, ...rest },
  ref,
) {
  const Tag = as as ElementType
  return (
    <Tag
      ref={ref}
      className={cx(
        'rounded-2xl border border-border bg-surface shadow-sm',
        PADDING[padding],
        interactive && 'hover:shadow-md',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
})

type CardHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="text-base font-semibold text-text">{title}</div>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
