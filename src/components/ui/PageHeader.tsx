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
  divider?: boolean
  className?: string
}

const BACK_LINK =
  'mb-2 inline-flex items-center gap-1 rounded-md text-sm text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function parentCrumb(items: Breadcrumb[]) {
  return [...items].reverse().find((item) => item.to && item.label !== 'Inicio')
}

export function PageHeader({ title, subtitle, actions, back, crumb, divider, className }: PageHeaderProps) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const detail = Boolean(crumb || back)
  const crumbs = user && detail ? breadcrumbsFor(pathname, user.role, crumb) : []
  const parent = back ? null : parentCrumb(crumbs)

  return (
    <header
      className={cx(
        'flex flex-wrap items-center justify-between gap-3',
        divider && 'border-b border-border pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        {back ? (
          <Link to={back.to} className={BACK_LINK}>
            <span aria-hidden="true">←</span>
            {back.label}
          </Link>
        ) : parent?.to ? (
          <Link to={parent.to} className={BACK_LINK}>
            <span aria-hidden="true">←</span>
            {parent.label}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2 min-[360px]:w-auto">{actions}</div>
      ) : null}
    </header>
  )
}
