import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'

export type TableColumn<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
}

type TableProps<T> = {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  density?: 'comfortable' | 'compact'
  caption?: ReactNode
  empty?: ReactNode
  className?: string
}

const CELL = {
  comfortable: 'px-4 py-3 text-[15px]',
  compact: 'px-3 py-1.5 text-sm',
} as const

export function Table<T>({
  columns,
  rows,
  rowKey,
  density = 'comfortable',
  caption,
  empty,
  className,
}: TableProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    function measure() {
      const node = scrollerRef.current
      if (!node) return
      const max = node.scrollWidth - node.clientWidth
      setEdges({
        left: node.scrollLeft > 1,
        right: max - node.scrollLeft > 1,
      })
    }
    scroller.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [rows, columns, density])

  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>
  }

  return (
    <div className={cx('relative', className)}>
      <div ref={scrollerRef} className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          {caption ? <caption className="mb-2 text-left text-sm text-muted">{caption}</caption> : null}
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    'font-semibold text-muted',
                    CELL[density],
                    column.align === 'right' && 'text-right tabular-nums',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      'text-text',
                      CELL[density],
                      column.align === 'right' && 'text-right tabular-nums',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edges.left ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-surface to-transparent"
          aria-hidden="true"
        />
      ) : null}
      {edges.right ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-surface to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
