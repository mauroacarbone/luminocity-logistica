import type { ReactNode } from 'react'
import { cx } from './cx'

export type ListCounter = {
  key: string
  label: string
  count: number
  icon?: ReactNode
  active: boolean
  onClick: () => void
}

type ListBoxProps = {
  counters?: ListCounter[]
  filters?: ReactNode
  view?: ReactNode
  children: ReactNode
  className?: string
}

export function ListBox({ counters, filters, view, children, className }: ListBoxProps) {
  const hasHeader = Boolean(counters?.length || filters || view)

  return (
    <div className={cx('overflow-hidden rounded-md border border-border bg-bg', className)}>
      {hasHeader ? (
        <div className="flex flex-col border-b border-border bg-surface min-[480px]:h-12 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
          <div className="flex min-w-0 gap-1 overflow-x-auto px-2 py-2 min-[480px]:py-0">
            {counters?.map((counter) => (
              <button
                key={counter.key}
                type="button"
                aria-pressed={counter.active}
                onClick={counter.onClick}
                className={cx(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-surface-2',
                  counter.active ? 'font-semibold text-text' : 'text-muted',
                )}
              >
                {counter.icon}
                <span>{counter.label}</span>
                <span className="font-bold tabular-nums">{counter.count}</span>
              </button>
            ))}
          </div>
          {filters || view ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border px-2 py-2 min-[480px]:border-t-0 min-[480px]:py-0">
              {filters}
              {view}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}
