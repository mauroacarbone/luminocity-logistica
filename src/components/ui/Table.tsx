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
  /** Alto máximo del recuadro. El encabezado queda fijo dentro de ese scroll. */
  maxHeight?: string
  className?: string
}

const CELL = {
  comfortable: 'px-4 py-3 text-[15px]',
  compact: 'px-3 py-1.5 text-sm',
} as const

const TABLE = 'w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-left'

function columnsOf(count: number) {
  return (
    <colgroup>
      {Array.from({ length: count }, (_, index) => (
        <col key={index} />
      ))}
    </colgroup>
  )
}

function headerCells<T>(columns: TableColumn<T>[], density: keyof typeof CELL) {
  return columns.map((column) => (
    <th
      key={column.key}
      scope="col"
      className={cx(
        'sticky top-0 z-10 border-b border-border bg-surface font-semibold text-muted',
        CELL[density],
        column.align === 'right' && 'text-right tabular-nums',
      )}
    >
      {column.header}
    </th>
  ))
}

function bodyRows<T>(
  columns: TableColumn<T>[],
  rows: T[],
  rowKey: (row: T) => string,
  density: keyof typeof CELL,
) {
  return rows.map((row) => (
    <tr key={rowKey(row)} className="hover:bg-surface-2">
      {columns.map((column) => (
        <td
          key={column.key}
          className={cx(
            'border-b border-border text-text',
            CELL[density],
            column.align === 'right' && 'text-right tabular-nums',
          )}
        >
          {column.cell(row)}
        </td>
      ))}
    </tr>
  ))
}

function EdgeShadows({ left, right }: { left: boolean; right: boolean }) {
  return (
    <>
      {left ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-4 bg-gradient-to-r from-surface to-transparent"
          aria-hidden="true"
        />
      ) : null}
      {right ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-4 bg-gradient-to-l from-surface to-transparent"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  density = 'comfortable',
  caption,
  empty,
  maxHeight = '70vh',
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
  }, [rows, columns, density, maxHeight])

  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>
  }

  return (
    <div className={cx('relative', className)}>
      <div ref={scrollerRef} className="overflow-auto" style={{ maxHeight }}>
        <table className={TABLE}>
          {caption ? <caption className="mb-2 text-left text-sm text-muted">{caption}</caption> : null}
          {columnsOf(columns.length)}
          <thead>
            <tr>{headerCells(columns, density)}</tr>
          </thead>
          <tbody>{bodyRows(columns, rows, rowKey, density)}</tbody>
        </table>
      </div>
      <EdgeShadows left={edges.left} right={edges.right} />
    </div>
  )
}
