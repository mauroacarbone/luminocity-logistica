import type { ReactNode } from 'react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Spinner } from './Spinner'
import { cx } from './cx'

type LoadStateProps = {
  status: 'loading' | 'error' | 'empty' | 'ready'
  error?: ReactNode
  onRetry?: () => void
  emptyTitle?: ReactNode
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  children?: ReactNode
  className?: string
}

export function LoadState({
  status,
  error,
  onRetry,
  emptyTitle = 'Nada para mostrar',
  emptyDescription,
  emptyAction,
  children,
  className,
}: LoadStateProps) {
  if (status === 'ready') return <>{children}</>
  if (status === 'loading') {
    return (
      <div className={cx('grid place-items-center py-16', className)}>
        <Spinner size="lg" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className={cx('rounded-2xl border border-border bg-surface p-5 shadow-sm', className)} role="alert">
        <p className="font-semibold text-danger">{error ?? 'No se pudo cargar.'}</p>
        {onRetry ? (
          <Button variant="secondary" className="mt-4" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <EmptyState
      className={className}
      title={emptyTitle}
      description={emptyDescription}
      action={emptyAction}
    />
  )
}
