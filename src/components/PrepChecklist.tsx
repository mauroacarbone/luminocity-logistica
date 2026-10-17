import { useState, type ReactNode } from 'react'
import type { Order } from '../data/orders'
import type { Role } from '../lib/authStore'
import { canTickChecklist, lineIsPicked, linesForOrderPrep, pickedStatus } from '../lib/preparation'
import type { PickingLine } from '../lib/pickingSheet'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'
import { Button } from './ui'

function counted(line: PickingLine) {
  if (typeof line.pickedQty === 'number' && Number.isFinite(line.pickedQty)) {
    return Math.min(line.quantity, Math.max(0, line.pickedQty))
  }
  return line.status === 'preparado' ? line.quantity : 0
}

export function PrepChecklist({
  order,
  userId,
  role,
  countLocked = false,
  emptyExtra,
}: {
  order: Order
  userId?: string
  role?: Role
  countLocked?: boolean
  emptyExtra?: ReactNode
}) {
  const { lines, patchLine } = usePicking()
  const { refresh } = useOrders()
  const rows = linesForOrderPrep(lines, order)
  const done = rows.filter((line) => lineIsPicked(line)).length
  const total = rows.length
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const editable = canTickChecklist(role, order, userId) && !countLocked

  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">Sin artículos cargados. Revisá la FC / nota de pedido.</p>
        {emptyExtra}
      </div>
    )
  }

  async function setQty(line: PickingLine, qty: number) {
    if (!editable || busyId) return
    const next = Math.min(line.quantity, Math.max(0, qty))
    if (next === counted(line) && pickedStatus(next, line.quantity) === (line.status ?? 'pendiente')) return
    setBusyId(line.id)
    setMessage('')
    const result = await patchLine(line.id, {
      pickedQty: next,
      status: pickedStatus(next, line.quantity),
    })
    setBusyId('')
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await refresh({ silent: true })
  }

  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text">
          {done} de {total} artículos
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {countLocked ? <p className="text-sm text-muted">Tomalo para empezar a contar</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((line) => {
          const qty = counted(line)
          return (
            <li key={line.id} className="rounded-md border border-border bg-surface px-3 py-2">
              {line.code ? <p className="text-sm text-muted tabular-nums">Cód. {line.code}</p> : null}
              <button
                type="button"
                className="flex min-h-11 w-full items-center text-left font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                disabled={!editable || busyId === line.id}
                onClick={() => void setQty(line, line.quantity)}
              >
                {line.product}
              </button>
              <p className="text-sm tabular-nums text-text">
                {qty} de {line.quantity}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  className="size-11 shrink-0"
                  aria-label={`Menos uno de ${line.product}`}
                  disabled={!editable || busyId === line.id || qty <= 0}
                  onClick={() => void setQty(line, qty - 1)}
                >
                  −
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="size-11 shrink-0"
                  aria-label={`Más uno de ${line.product}`}
                  disabled={!editable || busyId === line.id || qty >= line.quantity}
                  onClick={() => void setQty(line, qty + 1)}
                >
                  +
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={!editable || busyId === line.id || qty >= line.quantity}
                  onClick={() => void setQty(line, line.quantity)}
                >
                  Completo
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </div>
  )
}
