import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cx } from './cx'

type PageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  className?: string
}

export function PageHeader({ title, subtitle, actions, back, className }: PageHeaderProps) {
  return (
    <header
      className={cx(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {back ? (
          <Link
            to={back.to}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-text focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-lg"
          >
            <span aria-hidden="true">←</span>
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-xl font-semibold text-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
