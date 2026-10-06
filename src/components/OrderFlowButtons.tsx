import { useEffect, useRef, useState } from 'react'
import type { Order, OrderStatus } from '../data/orders'
import { askPackages, askReason, askTracking, error, success } from '../lib/alerts'
import type { Role } from '../lib/authStore'
import { backActions, nextAction, statusPillFor } from '../lib/orderFlow'
import type { OrderSaveResult } from '../state/OrdersContext'

type Props = {
  order: Order
  role: Role
  via: 'despacho' | 'pedidos'
  busy: boolean
  onBusy: (busy: boolean) => void
  transition: (id: string, body: Record<string, unknown>) => Promise<OrderSaveResult>
  onDone?: (order: Order) => void
  /** Si hay selector de chofer en la pantalla, se enfoca al pedir Asignar chofer. */
  driverSelectId?: string
}

export function OrderFlowButtons({
  order,
  role,
  via,
  busy,
  onBusy,
  transition,
  onDone,
  driverSelectId,
}: Props) {
  const next = nextAction(role, order)
  const backs = backActions(role, order)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  if (!next && backs.length === 0) return null

  async function runTransition(to: OrderStatus, extras: Record<string, unknown> = {}) {
    onBusy(true)
    const result = await transition(order.id, { to, via, ...extras })
    onBusy(false)
    if (result.status === 'not-saved') {
      await error(result.message)
      return
    }
    await success(`Pasó a ${statusPillFor(result.order, result.order.status)}`)
    onDone?.(result.order)
  }

  async function onNext() {
    if (!next) return
    if (next.to === 'asignado' && order.dispatchType !== 'correo') {
      if (!order.driverId) {
        const select = driverSelectId ? document.getElementById(driverSelectId) : null
        if (select instanceof HTMLSelectElement) {
          select.focus()
          select.classList.add('ring-2', 'ring-lumi-yellow')
          window.setTimeout(() => select.classList.remove('ring-2', 'ring-lumi-yellow'), 1200)
        }
        await error('Elegí un chofer para asignar el pedido.')
        return
      }
      await runTransition(next.to, { driverId: order.driverId })
      return
    }
    if (next.to === 'preparado') {
      const packages = await askPackages('Marcar preparado', 'Indicá la cantidad de bultos.')
      if (packages == null) return
      await runTransition(next.to, { packages })
      return
    }
    if (next.to === 'asignado' && order.dispatchType === 'correo') {
      const tracking = await askTracking('Despachar', 'Podés cargar el tracking del envío.')
      if (tracking === null) return
      const body: Record<string, unknown> = {}
      if (tracking) body.trackingNumber = tracking
      await runTransition(next.to, body)
      return
    }
    await runTransition(next.to)
  }

  async function onBack(to: OrderStatus, label: string) {
    setMenuOpen(false)
    const reason = await askReason(label, `El pedido ${order.id} vuelve a ${statusPillFor(order, to)}.`)
    if (!reason) return
    await runTransition(to, { reason })
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-2">
      {next && (
        <button
          type="button"
          className="min-h-11 rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
          disabled={busy}
          onClick={() => void onNext()}
        >
          {next.label}
        </button>
      )}
      {backs.length > 0 && (
        <div className="relative">
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-lumi-line text-lg leading-none hover:bg-[#f7f4ea] disabled:opacity-50"
            disabled={busy}
            aria-label="Más acciones"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-lumi-line bg-white p-1 shadow-lg"
            >
              {backs.map((action) => (
                <button
                  key={action.to}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea]"
                  onClick={() => void onBack(action.to, action.label)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
