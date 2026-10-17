import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { Order, OrderStatus } from '../data/orders'
import { isOwnDelivery, isPickup } from '../data/catalog'
import {
  askAssignDriver,
  askPackages,
  askPlanRoute,
  askPickupReceiver,
  askReason,
  askTracking,
  error,
  success,
} from '../lib/alerts'
import type { Role } from '../lib/authStore'
import { isSession } from '../lib/authStore'
import { labelDrivers } from '../lib/driverLabel'
import { backActions, isBackupDelivery, nextAction, statusPillFor } from '../lib/orderFlow'
import { normalizeTimeWindow } from '../lib/slot'
import { listUsers } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import type { OrderSaveResult } from '../state/OrdersContext'

type MenuPos = { top: number; left: number }

function placeMenu(button: HTMLElement, menu: HTMLElement): MenuPos {
  const rect = button.getBoundingClientRect()
  const pad = 8
  const bar = document.querySelector('.app-header')
  const topMin = bar instanceof HTMLElement ? bar.getBoundingClientRect().bottom + 4 : pad
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
  const navigate = useNavigate()
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
    const drivers = labelDrivers(
      usersResult.data.flatMap((item) => {
        if (!isSession(item) || item.role !== 'chofer' || !item.active) return []
        const phone = 'phone' in item && typeof item.phone === 'string' ? item.phone : ''
        return [{ id: item.id, name: item.name, phone, email: item.email }]
      }),
    ).map((driver) => ({ id: driver.id, name: driver.label }))
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
    const result = await runTransition('asignado', extras)
    await offerPlan(result, choice.driverId)
  }

  async function offerPlan(result: OrderSaveResult | undefined, driverId: string) {
    if (!result || result.status === 'not-saved') return
    if (role !== 'encargado_deposito' && role !== 'admin') return
    if (!driverId || !order.deliveryDate) return
    const plan = await askPlanRoute()
    if (!plan) return
    const params = new URLSearchParams({ chofer: driverId, fecha: order.deliveryDate })
    navigate(`/rutas?${params.toString()}`)
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
          select.classList.add('ring-2', 'ring-accent')
          window.setTimeout(() => select.classList.remove('ring-2', 'ring-accent'), 1200)
        }
        await error('Elegí un chofer para asignar el pedido.')
        return
      }
      const result = await runTransition(next.to, { driverId: order.driverId })
      await offerPlan(result, order.driverId)
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

  async function onBackupDelivered() {
    setMenuOpen(false)
    const reason = await askReason(
      `¿Marcar ${order.id} como entregado?`,
      'Queda registrado a tu nombre.',
    )
    if (!reason) return
    await runTransition('entregado', { reason })
  }

  async function onBack(to: OrderStatus, label: string) {
    setMenuOpen(false)
    const detail =
      to === 'pendiente' && order.preparedBy?.name
        ? `Se devuelve a la cola de armado y se avisa a ${order.preparedBy.name}.`
        : `El pedido ${order.id} vuelve a ${statusPillFor(order, to)}.`
    const reason = await askReason(label, detail)
    if (!reason) return
    await runTransition(to, { reason })
  }

  const backup = isBackupDelivery(role, order)
  const stretch = layout === 'stretch'
  const compact = layout === 'compact'
  const moreClass = stretch
    ? 'grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border text-lg leading-none hover:bg-surface-muted disabled:opacity-50'
    : compact
      ? 'grid h-9 w-9 place-items-center rounded-xl border border-border text-base leading-none hover:bg-surface-muted disabled:opacity-50'
      : 'grid h-11 w-11 place-items-center rounded-xl border border-border text-lg leading-none hover:bg-surface-muted disabled:opacity-50'

  return (
    <div
      ref={rootRef}
      className={stretch ? 'flex w-full items-center gap-2' : 'flex flex-wrap items-center gap-2'}
    >
      {next && (
        <Button
          variant="primary"
          size={compact ? 'sm' : 'lg'}
          className={stretch ? 'flex-1' : undefined}
          disabled={busy}
          onClick={() => void onNext()}
        >
          {next.label}
        </Button>
      )}
      {(backs.length > 0 || backup) && (
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
                className="fixed min-w-max rounded-xl border border-border bg-surface p-1 shadow-md"
                style={
                  menuPos
                    ? { top: menuPos.top, left: menuPos.left, zIndex: 'var(--z-dropdown)' }
                    : { top: 0, left: 0, visibility: 'hidden', zIndex: 'var(--z-dropdown)' }
                }
              >
                {backup && (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={() => void onBackupDelivered()}
                  >
                    Marcar entregado
                  </button>
                )}
                {backs.map((action) => (
                  <button
                    key={action.to}
                    type="button"
                    role="menuitem"
                    className="block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
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
