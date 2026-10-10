import type { ReactNode } from 'react'
import { Card } from './Card'
import { cx } from './cx'

type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Card
      className={cx('text-center', className)}
      role="status"
      padding="md"
    >
      {icon ? (
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-surface-muted text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  )
}
