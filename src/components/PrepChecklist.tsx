import { useState } from 'react'
import type { Order } from '../data/orders'
import type { Role } from '../lib/authStore'
import { canTickChecklist, lineIsPicked } from '../lib/preparation'
import type { PickingLine } from '../lib/pickingSheet'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'

export function PrepChecklist({
  order,
  userId,
  role,
}: {
  order: Order
  userId?: string
  role?: Role
}) {
  const { lines, patchLine } = usePicking()
  const { refresh } = useOrders()
  const rows = lines.filter((line) => line.orderId === order.id)
  const done = rows.filter((line) => lineIsPicked(line)).length
  const total = rows.length
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const editable = canTickChecklist(role, order, userId)

  if (total === 0) return <p className="text-sm text-muted">Sin detalle de artículos</p>

  async function toggle(line: PickingLine) {
    if (!editable || busyId) return
    const next = !lineIsPicked(line)
    setBusyId(line.id)
    setMessage('')
    const result = await patchLine(line.id, {
      pickedQty: next ? line.quantity : 0,
      status: next ? 'preparado' : 'pendiente',
    })
    setBusyId('')
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await refresh({ silent: true })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-text">
        {done} de {total} artículos
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((line) => {
          const checked = lineIsPicked(line)
          return (
            <li key={line.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={!editable || busyId === line.id}
                className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-surface px-2 text-left text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                onClick={() => void toggle(line)}
              >
                <span
                  className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border text-base ${
                    checked ? 'border-accent bg-accent-soft font-semibold' : 'border-border'
                  }`}
                  aria-hidden="true"
                >
                  {checked ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{line.product}</span>
                  <span className="block text-sm text-muted">Cantidad {line.quantity}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </div>
  )
}
