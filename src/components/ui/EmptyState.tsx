import type { ReactNode } from 'react'
import { Card } from './Card'
import { cx } from './cx'

type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  variant?: 'card' | 'plain'
  className?: string
}

export function EmptyState({ title, description, icon, action, variant = 'card', className }: EmptyStateProps) {
  if (variant === 'plain') {
    return (
      <div className={cx('px-4 py-16 text-center', className)} role="status">
        {icon ? <div className="mx-auto mb-3 flex justify-center text-muted [&_.nav-icon]:size-6">{icon}</div> : null}
        <p className="text-xl font-semibold text-text">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        {action ? (
          <div className="mt-3 text-sm text-accent [&_button:not(.bg-btn-primary)]:font-medium [&_button:not(.bg-btn-primary)]:text-accent">
            {action}
          </div>
        ) : null}
      </div>
    )
  }

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
