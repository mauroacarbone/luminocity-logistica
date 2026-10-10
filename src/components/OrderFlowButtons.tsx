import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Order, OrderStatus } from '../data/orders'
import { isOwnDelivery, isPickup } from '../data/catalog'
import {
  askAssignDriver,
  askPackages,
  askPickupReceiver,
  askReason,
  askTracking,
  error,
  success,
} from '../lib/alerts'
import type { Role } from '../lib/authStore'
import { isSession } from '../lib/authStore'
import { backActions, nextAction, statusPillFor } from '../lib/orderFlow'
import { normalizeTimeWindow } from '../lib/slot'
import { listUsers } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import type { OrderSaveResult } from '../state/OrdersContext'

type MenuPos = { top: number; left: number }

function placeMenu(button: HTMLElement, menu: HTMLElement): MenuPos {
  const rect = button.getBoundingClientRect()
  const pad = 8
  const topbar = document.querySelector('.topbar')
  const topMin =
    topbar instanceof HTMLElement ? topbar.getBoundingClientRect().bottom + 4 : pad
  const width = menu.offsetWidth
  const height = menu.offsetHeight
  // Preferir alinear al borde derecho del botón (abre hacia la izquierda).
  let left = rect.right - width
  if (left < pad) left = rect.left
  if (left + width > window.innerWidth - pad) {
    left = window.innerWidth - pad - width
  }
  left = Math.max(pad, left)
  let top = rect.bottom + 4
  if (top + height > window.innerHeight - pad) {
    top = rect.top - height - 4
  }
  top = Math.max(topMin, Math.min(top, window.innerHeight - pad - height))
  return { top, left }
}

type Props = {
  order: Order
  role: Role
  via: 'despacho' | 'pedidos' | 'panel' | 'retiros' | 'picking'
  busy: boolean
  onBusy: (busy: boolean) => void
  transition: (id: string, body: Record<string, unknown>) => Promise<OrderSaveResult>
  onDone?: (order: Order) => void
  /** Si hay selector de chofer en la pantalla, se enfoca al pedir Asignar chofer. */
  driverSelectId?: string
  /** stretch: primario a ancho en tarjeta; compact: botones más chicos en tabla. */
  layout?: 'default' | 'stretch' | 'compact'
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
  layout = 'default',
}: Props) {
  const { logout } = useAuth()
  const { timeWindows } = useCatalog()
  const next = nextAction(role, order)
  const backs = backActions(role, order)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!menuOpen) return
    function update() {
      if (!moreBtnRef.current || !menuRef.current) return
      setMenuPos(placeMenu(moreBtnRef.current, menuRef.current))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [menuOpen, backs.length])

  useEffect(() => {
    if (!menuOpen) return
    function onPointer(event: MouseEvent | TouchEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  if (!next && backs.length === 0) return null

  async function runTransition(to: OrderStatus, extras: Record<string, unknown> = {}) {
    onBusy(true)
    const result = await transition(order.id, { to, via, ...extras })
    onBusy(false)
    if (result.status === 'not-saved') {
      await error(result.message)
      return result
    }
    await success(`Pasó a ${statusPillFor(result.order, result.order.status)}`)
    onDone?.(result.order)
    return result
  }

  async function assignFromDialog() {
    onBusy(true)
    const usersResult = await listUsers()
    onBusy(false)
    if (!usersResult.ok) {
      if (usersResult.status === 401) {
        logout()
        return
      }
      await error(usersResult.message)
      return
    }
    if (!Array.isArray(usersResult.data)) {
      await error('No se pudieron cargar los choferes.')
      return
    }
    const drivers = usersResult.data.flatMap((item) =>
      isSession(item) && item.role === 'chofer' && item.active
        ? [{ id: item.id, name: item.name }]
        : [],
    )
    const windows = withCurrentWindow(timeWindows, order.timeWindow)
    const choice = await askAssignDriver({
      drivers,
      timeWindows: windows,
      currentDriverId: order.driverId,
      currentTimeWindow: normalizeTimeWindow(order.timeWindow) || undefined,
      allowOverride: role === 'encargado_deposito' || role === 'admin',
    })
    if (!choice) return
    const extras: Record<string, unknown> = {
      driverId: choice.driverId,
      timeWindow: choice.timeWindow,
    }
    if (choice.override) extras.override = true
    await runTransition('asignado', extras)
  }

  async function onNext() {
    if (!next) return
    if (next.to === 'asignado' && isOwnDelivery(order)) {
      if (!driverSelectId) {
        await assignFromDialog()
        return
      }
      if (!order.driverId) {
        const select = document.getElementById(driverSelectId)
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
    if (next.to === 'entregado' && isPickup(order)) {
      const receiver = await askPickupReceiver(
        'Marcar retirado',
        `Indicá quién retira el pedido ${order.id}.`,
      )
      if (!receiver) return
      const body: Record<string, unknown> = { receiverName: receiver.name }
      if (receiver.dni) body.receiverDni = receiver.dni
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

  const stretch = layout === 'stretch'
  const compact = layout === 'compact'
  const nextClass = stretch
    ? 'min-h-11 flex-1 rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50'
    : compact
      ? 'min-h-9 rounded-xl bg-lumi-yellow px-2.5 py-1 text-xs font-semibold text-lumi-yellow-ink disabled:opacity-50'
      : 'min-h-11 rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50'
  const moreClass = stretch
    ? 'grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-lumi-line text-lg leading-none hover:bg-[#f7f4ea] disabled:opacity-50'
    : compact
      ? 'grid h-9 w-9 place-items-center rounded-xl border border-lumi-line text-base leading-none hover:bg-[#f7f4ea] disabled:opacity-50'
      : 'grid h-11 w-11 place-items-center rounded-xl border border-lumi-line text-lg leading-none hover:bg-[#f7f4ea] disabled:opacity-50'

  return (
    <div
      ref={rootRef}
      className={stretch ? 'flex w-full items-center gap-2' : 'flex flex-wrap items-center gap-2'}
    >
      {next && (
        <button
          type="button"
          className={nextClass}
          disabled={busy}
          onClick={() => void onNext()}
        >
          {next.label}
        </button>
      )}
      {backs.length > 0 && (
        <div className="relative shrink-0">
          <button
            ref={moreBtnRef}
            type="button"
            className={moreClass}
            disabled={busy}
            aria-label="Más acciones"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                className="fixed z-30 min-w-max rounded-xl border border-lumi-line bg-white p-1 shadow-lg"
                style={
                  menuPos
                    ? { top: menuPos.top, left: menuPos.left }
                    : { top: 0, left: 0, visibility: 'hidden' }
                }
              >
                {backs.map((action) => (
                  <button
                    key={action.to}
                    type="button"
                    role="menuitem"
                    className="block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea]"
                    onClick={() => void onBack(action.to, action.label)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  )
}

function withCurrentWindow(windows: string[], current?: string) {
  const normalized = normalizeTimeWindow(current)
  if (!normalized) return windows
  if (windows.some((item) => normalizeTimeWindow(item) === normalized)) return windows
  return [...windows, normalized]
}
