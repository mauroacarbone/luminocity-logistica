import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { breadcrumbsFor, type Breadcrumb } from '../../layout/nav'
import { useAuth } from '../../state/AuthContext'
import { cx } from './cx'

type PageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  crumb?: string
  className?: string
}

const CRUMB_LINK =
  'rounded-md text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Crumbs({ items }: { items: Breadcrumb[] }) {
  const collapsed = items.length > 2
  return (
    <nav aria-label="Migas de pan">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {collapsed ? (
          <li className="sm:hidden" aria-hidden="true">
            …
          </li>
        ) : null}
        {items.map((item, index) => {
          const last = index === items.length - 1
          const hide = collapsed && index < items.length - 2
          return (
            <li key={`${item.label}-${index}`} className={cx('flex items-center gap-1', hide && 'hidden sm:flex')}>
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              ) : null}
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className={last ? 'text-text' : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className={CRUMB_LINK}>
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function PageHeader({ title, subtitle, actions, back, crumb, className }: PageHeaderProps) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const crumbs = user ? breadcrumbsFor(pathname, user.role, crumb) : []

  return (
    <header className={cx('flex flex-col gap-3', className)}>
      {crumbs.length > 0 ? <Crumbs items={crumbs} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {back ? (
            <Link
              to={back.to}
              className="mb-2 inline-flex items-center gap-1 rounded-lg text-sm text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">←</span>
              {back.label}
            </Link>
          ) : null}
          <h1 className="text-xl font-semibold text-text">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
