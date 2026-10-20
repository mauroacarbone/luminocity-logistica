import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { PrepChecklist } from '../components/PrepChecklist'
import { PrepChip } from '../components/PrepChip'
import { Badge, Button, Drawer, EmptyState, FilterBar, KpiCard, ListBox, Menu, Page, PageHeader, statusTone, Table, type TableColumn } from '../components/ui'
import { NavIcon } from '../layout/NavIcon'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { DISPATCH_LABEL, isOwnDelivery, isPickup } from '../data/catalog'
import {
  ordersByStatus,
  pendingEdit,
  STATUS_LABEL,
  STATUS_ORDER,
  type Order,
  type OrderStatus,
} from '../data/orders'
import { canCancelOrder, canEditOrder, canExportPanel, canOpen, ownsOrder } from '../lib/access'
import { confirm, error as showError, success } from '../lib/alerts'
import { normalizeInvoiceKey } from '../lib/invoiceKey'
import { formatPrepMs, prepDuration, takeState, takenByName } from '../lib/preparation'
import { statusPillFor } from '../lib/orderFlow'
import { compareOpenPriority } from '../lib/priority'
import { placeLine } from '../lib/place'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { normalizeTimeWindow } from '../lib/slot'
import { businessOffset, businessToday } from '../lib/schedule'
import { addDays, formatIsoDate, parseIso, startOfWeek, toIso } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

const REFRESH_MS = 30_000
const ADVANCE_STATUSES: OrderStatus[] = ['pendiente', 'preparado', 'asignado']
const DONE_STATUSES: OrderStatus[] = ['en-viaje', 'entregado']

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
}

function matchesQuery(order: Order, raw: string) {
  const q = fold(raw.trim())
  if (!q) return true
  if (fold(order.id).includes(q) || fold(order.client).includes(q)) return true
  if (order.phone && fold(order.phone).includes(q)) return true
  const invoiceKey = normalizeInvoiceKey(raw)
  return (order.invoices ?? []).some((invoice) => {
    if (fold(invoice).includes(q)) return true
    return invoiceKey.length > 0 && normalizeInvoiceKey(invoice) === invoiceKey
  })
}

function PrepClock({ order }: { order: Order }) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [])
  return <span className="tabular-nums">{now ? formatPrepMs(prepDuration(order, now)) : '—'}</span>
}

function sortPanelList(left: Order, right: Order) {
  const byPriority = compareOpenPriority(left, right)
  if (byPriority !== 0) return byPriority
  const leftDate = left.deliveryDate || ''
  const rightDate = right.deliveryDate || ''
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1
  const leftStatus = STATUS_ORDER.indexOf(left.status)
  const rightStatus = STATUS_ORDER.indexOf(right.status)
  if (leftStatus !== rightStatus) return leftStatus - rightStatus
  const leftSlot = normalizeTimeWindow(left.timeWindow) || left.timeWindow || ''
  const rightSlot = normalizeTimeWindow(right.timeWindow) || right.timeWindow || ''
  if (leftSlot !== rightSlot) return leftSlot < rightSlot ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

type View = 'kanban' | 'tabla'
type FechaFilter = 'atrasados' | 'hoy' | 'manana' | 'semana' | 'todos'
type SummaryFilter = OrderStatus | 'abiertos' | null

const VIEW_KEY = 'luminocity.panelView'
const FECHA_VALUES: FechaFilter[] = ['atrasados', 'hoy', 'manana', 'semana', 'todos']

const FECHA_CHIPS: { value: FechaFilter; label: string }[] = [
  { value: 'atrasados', label: 'Atrasados' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'manana', label: 'Mañana' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'todos', label: 'Todos' },
]

const SUMMARY: { key: 'total' | OrderStatus; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'preparado', label: 'Preparados' },
  { key: 'asignado', label: 'Asignados' },
  { key: 'en-viaje', label: 'En viaje' },
  { key: 'entregado', label: 'Entregados' },
]

function loadView(): View {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw === 'tabla' || raw === 'kanban') return raw
  } catch {
    /* ignore */
  }
  return 'kanban'
}

function parseFecha(raw: string | null): FechaFilter {
  if (raw && (FECHA_VALUES as string[]).includes(raw)) return raw as FechaFilter
  return 'semana'
}

function countFor(list: Order[], key: 'total' | OrderStatus) {
  if (key === 'total') return list.length
  return ordersByStatus(list, key).length
}

function hasDeliveryDate(order: Order) {
  return Boolean(order.deliveryDate && order.deliveryDate.trim())
}

function isOverdue(order: Order, today: string) {
  return hasDeliveryDate(order) && order.deliveryDate < today && order.status !== 'entregado'
}

function openedFromList(state: unknown) {
  return Boolean(state && typeof state === 'object' && (state as { fromList?: boolean }).fromList)
}

function matchesFecha(
  order: Order,
  filter: FechaFilter,
  today: string,
  tomorrow: string,
  weekFrom: string,
  weekTo: string,
) {
  const noDate = !hasDeliveryDate(order)
  const overdue = isOverdue(order, today)
  if (filter === 'todos') return true
  if (filter === 'atrasados') return overdue || noDate
  if (noDate) return false
  if (filter === 'hoy') return order.deliveryDate === today || overdue
  if (filter === 'manana') return order.deliveryDate === tomorrow
  if (filter === 'semana') {
    const inWeek = order.deliveryDate >= weekFrom && order.deliveryDate <= weekTo
    return inWeek || overdue
  }
  return true
}

function sheetForOrder(order: Order, sheets: RouteSheet[]) {
  if (!order.routeId) return undefined
  return sheets.find((sheet) => sheet.id === order.routeId)
}

function withSheetFlag(order: Order, sheets: RouteSheet[], canPlan: boolean): Order {
  if (!canPlan) return { ...order, sheetPlanned: false }
  if (!order.routeId) return { ...order, sheetPlanned: false }
  const sheet = sheetForOrder(order, sheets)
  if (!sheet) return order
  return { ...order, sheetPlanned: sheet.status === 'planificada' }
}

function OverdueChip({ order, today }: { order: Order; today: string }) {
  if (!isOverdue(order, today)) return null
  return (
    <span className="inline-flex rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
      Atrasado
    </span>
  )
}

function SheetLinks({
  order,
  sheets,
  canPlan,
}: {
  order: Order
  sheets: RouteSheet[]
  canPlan: boolean
}) {
  const sheet = sheetForOrder(order, sheets)
  if (sheet) {
    const driver = order.driverName?.trim() || 'chofer'
    const slot = sheet.slot || order.timeWindow || 'sin franja'
    return (
      <p className="order-zone mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-text">
          En hoja de {driver} · {slot}
        </span>
        <Link className="text-xs text-text underline" to="/rutas">
          Ver hoja
        </Link>
      </p>
    )
  }
  if (canPlan && order.status === 'asignado' && isOwnDelivery(order) && !order.routeId) {
    return (
      <p className="order-zone mt-2">
        <Link className="text-xs text-muted underline hover:text-text" to="/rutas">
          Armar hoja en el Planificador
        </Link>
      </p>
    )
  }
  return null
}

function OrderCard({
  order,
  sheets,
  canPlan,
  today,
  onOpen,
}: {
  order: Order
  sheets: RouteSheet[]
  canPlan: boolean
  today: string
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder, releaseOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const waiting = pendingEdit(order)
  const canRelease =
    Boolean(user) &&
    (user?.role === 'encargado_deposito' || user?.role === 'admin') &&
    takeState(order) === 'en-preparacion'

  async function release() {
    setReleasing(true)
    const result = await releaseOrder(order.id)
    setReleasing(false)
    if (result.status === 'not-saved') await showError(result.message)
  }
  const flowOrder = withSheetFlag(order, sheets, canPlan)

  return (
    <article className="order-card">
      <div className="order-card-top">
        <strong className="inline-flex flex-wrap items-center gap-2">
          <button type="button" className="order-link" onClick={onOpen}>
            {order.id}
          </button>
          <PriorityChip order={order} />
        </strong>
        {user && canEditOrder(user, order) && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Editar ${order.id}`}
            onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OrderStepper order={order} variant="compact" />
        <PrepChip order={order} />
        <OverdueChip order={order} today={today} />
      </div>
      <p className="order-client">
        <button type="button" className="order-link" onClick={onOpen}>
          {order.client}
        </button>
      </p>
      {waiting && <p className="order-zone">Esperando confirmación</p>}
      {order.address && <p className="order-zone">{order.address}</p>}
      {placeLine(order) && <p className="order-zone">{placeLine(order)}</p>}
      {order.zone && <p className="order-zone">{order.zone}</p>}
      {isPickup(order) ? (
        <p className="order-zone">
          <span className="status-pill">{DISPATCH_LABEL.retiro}</span>
        </p>
      ) : (
        <>
          {order.dispatchType && (
            <p className="order-zone">Despacho: {DISPATCH_LABEL[order.dispatchType]}</p>
          )}
          {order.transporter && <p className="order-zone">Transportista: {order.transporter}</p>}
        </>
      )}
      {order.packages != null && <p className="order-zone">Bultos: {order.packages}</p>}
      <SheetLinks order={order} sheets={sheets} canPlan={canPlan} />
      <p className="order-meta">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 8v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {order.loadedAt}
      </p>
      <p className="order-meta delivery">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v4M16 3v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {formatIsoDate(order.deliveryDate)}
      </p>
      {user && (
        <div className="mt-3">
          <OrderFlowButtons
            order={flowOrder}
            role={user.role}
            via="panel"
            busy={busy}
            onBusy={setBusy}
            transition={transitionOrder}
            layout="stretch"
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {user && canEditOrder(user, order) && (
          <button
            type="button"
            className="text-text hover:underline"
            onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}
          >
            Editar
          </button>
        )}
        <button type="button" className="text-muted hover:text-text hover:underline" onClick={onOpen}>
          Ver detalle
        </button>
        {canRelease ? (
          <button
            type="button"
            className="text-text hover:underline disabled:opacity-50"
            disabled={releasing}
            onClick={() => void release()}
          >
            Liberar
          </button>
        ) : null}
      </div>
    </article>
  )
}

function DetailActions({
  order,
  sheets,
  canPlan,
  onRemoved,
}: {
  order: Order
  sheets: RouteSheet[]
  canPlan: boolean
  onRemoved: () => void
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder, releaseOrder, removeOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const [extraBusy, setExtraBusy] = useState(false)
  const flowOrder = withSheetFlag(order, sheets, canPlan)
  const preparing = takeState(order) === 'en-preparacion'
  const canRelease = Boolean(user) && (user?.role === 'encargado_deposito' || user?.role === 'admin') && preparing

  async function release() {
    setExtraBusy(true)
    const result = await releaseOrder(order.id)
    setExtraBusy(false)
    if (result.status === 'not-saved') await showError(result.message)
  }

  async function cancelOrder() {
    if (!user) return
    const admin = user.role === 'admin'
    const accepted = await confirm(
      admin ? 'Borrar pedido' : 'Cancelar pedido',
      admin ? `Se borra el pedido ${order.id}.` : `Se cancela el pedido ${order.id}.`,
      { peligro: true },
    )
    if (!accepted) return
    setExtraBusy(true)
    const result = await removeOrder(order.id)
    setExtraBusy(false)
    if (result.status === 'not-saved') await showError(result.message)
    else {
      onRemoved()
      await success(admin ? 'Pedido borrado' : 'Pedido cancelado')
    }
  }

  return (
    <>
      {user ? (
        <OrderFlowButtons
          order={flowOrder}
          role={user.role}
          via="panel"
          busy={busy || extraBusy}
          onBusy={setBusy}
          transition={transitionOrder}
        />
      ) : null}
      {canRelease ? (
        <Button variant="secondary" disabled={extraBusy} onClick={() => void release()}>
          Liberar
        </Button>
      ) : null}
      {user && canEditOrder(user, order) ? (
        <Button variant="ghost" disabled={extraBusy} onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}>
          Editar
        </Button>
      ) : null}
      {user && canCancelOrder(user.role) ? (
        <Button variant="danger-outline" disabled={extraBusy} onClick={() => void cancelOrder()}>
          {user.role === 'admin' ? 'Borrar' : 'Cancelar'}
        </Button>
      ) : null}
      <SheetLinks order={order} sheets={sheets} canPlan={canPlan} />
    </>
  )
}

function onRadioKey<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (next: T) => void,
) {
  const index = Math.max(0, values.indexOf(current))
  let next: T | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = values[(index + 1) % values.length]
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = values[(index - 1 + values.length) % values.length]
  } else if (event.key === 'Home') next = values[0]
  else if (event.key === 'End') next = values[values.length - 1]
  if (next == null) return
  event.preventDefault()
  onChange(next)
  event.currentTarget.querySelector<HTMLButtonElement>(`[data-option="${next}"]`)?.focus()
}

const VIEW_OPTIONS: View[] = ['kanban', 'tabla']

function PanelViewSwitch({ view, onChange }: { view: View; onChange: (next: View) => void }) {
  const item = (value: View, label: string, icon: 'board' | 'list') => {
    const active = view === value
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        tabIndex={active ? 0 : -1}
        data-option={value}
        onClick={() => onChange(value)}
        className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm sm:flex-none ${
          active
            ? 'border border-accent bg-accent-soft font-semibold text-text'
            : 'border border-border bg-transparent text-text'
        }`}
      >
        <NavIcon name={icon} />
        {label}
      </button>
    )
  }
  return (
    <div
      className="mt-4 flex w-full gap-1 sm:mt-0 sm:w-auto"
      role="radiogroup"
      aria-label="Vista"
      onKeyDown={(event) => onRadioKey(event, VIEW_OPTIONS, view, onChange)}
    >
      {item('kanban', 'Tablero', 'board')}
      {item('tabla', 'Tabla', 'list')}
    </div>
  )
}

export function PanelOperativo() {
  const { user } = useAuth()
  const { orders, loading } = useOrders()
  const [query, setQuery] = useState('')
  const [armado, setArmado] = useState<'todos' | 'incompletos'>('todos')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<View>(loadView)
  const [statusFilter, setStatusFilter] = useState<SummaryFilter>(null)
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [sheetsError, setSheetsError] = useState(false)
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches,
  )
  const [showDone, setShowDone] = useState(false)
  const [sheetsTick, setSheetsTick] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState<'excel' | 'pdf' | null>(null)

  const dateFilter = parseFecha(searchParams.get('fecha'))
  const openId = searchParams.get('pedido') || searchParams.get('id')
  const today = businessToday()
  const tomorrow = businessOffset(1)
  const weekStart = startOfWeek(parseIso(businessToday()))
  const weekFrom = toIso(weekStart)
  const weekTo = toIso(addDays(weekStart, 6))

  const canPlan = Boolean(user && canOpen(user.role, '/rutas'))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    function syncNarrow() {
      setNarrow(media.matches)
    }
    syncNarrow()
    media.addEventListener('change', syncNarrow)
    return () => media.removeEventListener('change', syncNarrow)
  }, [])

  useEffect(() => {
    function bump() {
      if (document.visibilityState === 'visible') setSheetsTick((current) => current + 1)
    }
    const timer = window.setInterval(bump, REFRESH_MS)
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('focus', bump)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  const scopedOrders = useMemo(() => {
    if (user?.role === 'vendedor') return orders.filter((order) => ownsOrder(user, order))
    return orders
  }, [orders, user])
  const openOrder = scopedOrders.find((order) => order.id === openId) ?? null

  const datedOrders = useMemo(
    () =>
      scopedOrders.filter((order) =>
        matchesFecha(order, dateFilter, today, tomorrow, weekFrom, weekTo),
      ),
    [scopedOrders, dateFilter, today, tomorrow, weekFrom, weekTo],
  )

  const visibleOrders = useMemo(() => {
    const list =
      statusFilter === 'abiertos'
        ? datedOrders.filter((order) => order.status !== 'entregado')
        : statusFilter
          ? ordersByStatus(datedOrders, statusFilter)
          : datedOrders
    const searched = list.filter((order) => matchesQuery(order, query))
    const armed = armado === 'incompletos' ? searched.filter((order) => order.prepIncomplete) : searched
    return [...armed].sort(sortPanelList)
  }, [datedOrders, statusFilter, query, armado])

  async function runPanelExport(kind: 'excel' | 'pdf') {
    if (!user || visibleOrders.length === 0) return
    setExportBusy(kind)
    try {
      const panel = await import('../lib/panelExport')
      const payload = {
        orders: visibleOrders,
        dateFilter,
        statusFilter,
        today,
        tomorrow,
        weekFrom,
        weekTo,
        sheets,
        canPlan,
        userName: user.name,
        role: user.role,
      }
      if (kind === 'excel') await panel.downloadPanelXlsx(payload)
      else await panel.downloadPanelPdf(payload)
      setMenuOpen(false)
    } catch (err) {
      setMenuOpen(false)
      const message = err instanceof Error && err.message ? err.message : 'No se pudo exportar.'
      await showError(message)
    } finally {
      setExportBusy(null)
    }
  }

  const columns =
    statusFilter === 'abiertos'
      ? STATUS_ORDER.filter((status) => status !== 'entregado')
      : statusFilter
        ? [statusFilter]
        : STATUS_ORDER
  const overdueCount = scopedOrders.filter(
    (order) =>
      isOverdue(order, today) &&
      (order.status === 'pendiente' ||
        order.status === 'preparado' ||
        order.status === 'asignado' ||
        order.status === 'en-viaje'),
  ).length
  const openCount = datedOrders.filter((order) => order.status !== 'entregado').length
  const deliveredCount = countFor(datedOrders, 'entregado')
  const useAdvanceList = narrow && view === 'kanban' && !statusFilter

  const advanceOrders = useMemo(
    () => visibleOrders.filter((order) => ADVANCE_STATUSES.includes(order.status)),
    [visibleOrders],
  )
  const doneOrders = useMemo(
    () => visibleOrders.filter((order) => DONE_STATUSES.includes(order.status)),
    [visibleOrders],
  )

  const datesKey = useMemo(() => {
    let dates = [...new Set(visibleOrders.map((order) => order.deliveryDate).filter(Boolean))]
    if (dateFilter === 'todos') {
      dates = dates.filter((date) => date >= today)
    }
    dates.sort()
    return dates.join('|')
  }, [visibleOrders, dateFilter, today])

  useEffect(() => {
    let cancelled = false
    async function loadSheets() {
      if (!canPlan) {
        if (!cancelled) {
          setSheets([])
          setSheetsError(false)
        }
        return
      }
      const dates = datesKey ? datesKey.split('|') : []
      if (dates.length === 0) {
        if (!cancelled) {
          setSheets([])
          setSheetsError(false)
        }
        return
      }
      const results = await Promise.all(dates.map((date) => listRouteSheets(date)))
      if (cancelled) return
      if (results.every((result) => !result.ok)) {
        setSheetsError(true)
        return
      }
      const failed = results.some((result) => !result.ok && result.status !== 403)
      const merged: RouteSheet[] = []
      for (const result of results) {
        if (!result.ok) continue
        for (const sheet of result.data) {
          if (!merged.some((item) => item.id === sheet.id)) merged.push(sheet)
        }
      }
      setSheets(merged)
      setSheetsError(failed)
    }
    void loadSheets()
    return () => {
      cancelled = true
    }
  }, [canPlan, datesKey, sheetsTick])

  function selectFecha(next: FechaFilter) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        params.set('fecha', next)
        return params
      },
      { replace: true },
    )
  }

  function openPedido(id: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('pedido', id)
        return next
      },
      { state: { fromList: true } },
    )
  }

  const closePedido = useCallback(() => {
    if (openedFromList(location.state)) {
      navigate(-1)
      return
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('pedido')
        next.delete('id')
        return next
      },
      { replace: true },
    )
  }, [location.state, navigate, setSearchParams])

  useEffect(() => {
    if (loading || !openId) return
    const pool = useAdvanceList
      ? showDone
        ? advanceOrders.concat(doneOrders)
        : advanceOrders
      : visibleOrders
    if (!pool.some((order) => order.id === openId)) closePedido()
  }, [loading, openId, useAdvanceList, showDone, advanceOrders, doneOrders, visibleOrders, closePedido])

  function selectView(next: View) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* ignore */
    }
  }

  function selectSummary(key: 'total' | OrderStatus) {
    if (key === 'total') {
      setStatusFilter(null)
      return
    }
    setStatusFilter((current) => (current === key ? null : key))
  }

  const panelColumns: TableColumn<Order>[] = [
    {
      key: 'id',
      header: 'Pedido',
      cell: (order) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={(event) => {
              event.stopPropagation()
              openPedido(order.id)
            }}
          >
            {order.id}
          </button>
          <PriorityChip order={order} />
          {isOverdue(order, today) ? <OverdueChip order={order} today={today} /> : null}
        </span>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      cell: (order) => (
        <>
          {order.client}
          {order.zone ? <span className="text-muted"> · {order.zone}</span> : null}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (order) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>
          <PrepChip order={order} />
        </span>
      ),
    },
    {
      key: 'carrier',
      header: 'Transportista',
      cell: (order) =>
        isPickup(order) ? (
          DISPATCH_LABEL.retiro
        ) : (
          <>
            {order.transporter || '—'}
            {order.dispatchType ? <span className="text-muted"> · {DISPATCH_LABEL[order.dispatchType]}</span> : null}
          </>
        ),
    },
    {
      key: 'packages',
      header: 'Bultos',
      align: 'right',
      cell: (order) => (order.packages != null ? order.packages : '—'),
    },
    { key: 'loaded', header: 'Cargado', cell: (order) => order.loadedAt },
    {
      key: 'delivery',
      header: 'Entrega',
      cell: (order) => formatIsoDate(order.deliveryDate),
    },
    {
      key: 'action',
      header: 'Acción',
      cell: (order) => (
        <Button
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation()
            openPedido(order.id)
          }}
        >
          Ver detalle
        </Button>
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Panel Operativo"
        subtitle="Resumen de la operación en tiempo real"
        actions={
          <div className="flex w-full flex-wrap justify-end gap-3 sm:gap-2">
            {user && canExportPanel(user.role) ? (
              <Menu
                label="Exportar"
                open={menuOpen}
                onOpenChange={setMenuOpen}
                items={[
                  {
                    id: 'excel',
                    label: visibleOrders.length === 0 ? 'Sin pedidos para exportar' : exportBusy === 'excel' ? 'Generando…' : 'Excel (.xlsx)',
                    disabled: visibleOrders.length === 0 || exportBusy != null,
                    onSelect: () => void runPanelExport('excel'),
                  },
                  {
                    id: 'pdf',
                    label: visibleOrders.length === 0 ? 'Sin pedidos para exportar' : exportBusy === 'pdf' ? 'Generando…' : 'PDF',
                    disabled: visibleOrders.length === 0 || exportBusy != null,
                    onSelect: () => void runPanelExport('pdf'),
                  },
                ]}
              />
            ) : null}
            {user && canOpen(user.role, '/nuevo-pedido') ? (
              <Button variant="primary" onClick={() => navigate('/nuevo-pedido')}>
                Nuevo pedido
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Entregas para"
            className="flex w-full min-w-0 overflow-hidden rounded-lg border border-border max-sm:divide-x max-sm:divide-border sm:w-auto sm:flex-wrap sm:gap-1 sm:overflow-visible sm:rounded-none sm:border-0"
            onKeyDown={(event) => onRadioKey(event, FECHA_VALUES, dateFilter, selectFecha)}
          >
          {FECHA_CHIPS.map((chip) => {
            const active = dateFilter === chip.value
            return (
              <button
                key={chip.value}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                data-option={chip.value}
                onClick={() => selectFecha(chip.value)}
                className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap border-0 px-1 text-sm sm:h-9 sm:flex-none sm:rounded-md sm:px-3 sm:border ${
                  active
                    ? 'bg-accent-soft font-semibold text-accent sm:border-accent sm:text-text'
                    : 'bg-transparent text-text sm:border-border'
                }`}
              >
                {chip.value === 'semana' ? (
                  <>
                    <span className="min-[400px]:hidden">Semana</span>
                    <span className="hidden min-[400px]:inline">Esta semana</span>
                  </>
                ) : (
                  chip.label
                )}
              </button>
            )
          })}
        </div>
        {dateFilter !== 'semana' ? (
          <button type="button" className="h-9 px-2 text-sm font-medium text-accent" onClick={() => selectFecha('semana')}>
            Limpiar filtros
          </button>
        ) : null}
        </div>
        <PanelViewSwitch view={view} onChange={selectView} />
      </div>

      <FilterBar
        className="mt-4"
        search={{
          value: query,
          onChange: setQuery,
          label: 'Buscar pedido',
          placeholder: 'Cliente, factura o teléfono',
        }}
        chips={[
          {
            id: 'armado',
            label: 'Armado',
            variant: 'segmented',
            value: armado,
            options: [
              { value: 'todos', label: 'Todos' },
              { value: 'incompletos', label: 'Incompletos' },
            ],
            onChange: (next) => setArmado(next === 'incompletos' ? 'incompletos' : 'todos'),
          },
        ]}
        activeCount={(query.trim() ? 1 : 0) + (armado === 'incompletos' ? 1 : 0)}
        onClear={() => {
          setQuery('')
          setArmado('todos')
        }}
      />

      {sheetsError && (
        <p className="mt-3 text-sm text-muted">No se pudieron cargar las hojas de ruta</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-4 md:grid-cols-3 lg:grid-cols-7">
        {SUMMARY.map((item) => {
          const pressed = item.key === 'total' ? statusFilter === null : statusFilter === item.key
          return (
            <KpiCard
              key={item.key}
              title={item.label}
              value={countFor(datedOrders, item.key)}
              pressed={pressed}
              onClick={() => selectSummary(item.key)}
            />
          )
        })}
        <KpiCard
          title="Atrasados"
          value={overdueCount > 0 ? <span className="text-danger">{overdueCount}</span> : overdueCount}
          pressed={dateFilter === 'atrasados'}
          onClick={() => selectFecha('atrasados')}
        />
      </div>

      {view === 'kanban' && useAdvanceList ? (
        <div className="mt-6 flex flex-col gap-3 sm:mt-4">
          <h2 className="text-base font-semibold text-text">Para avanzar</h2>
          {advanceOrders.length === 0 ? (
            <p className="empty">No hay pedidos.</p>
          ) : (
            advanceOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                sheets={sheets}
                canPlan={canPlan}
                today={today}
                onOpen={() => openPedido(order.id)}
              />
            ))
          )}
          <div className="mt-2">
            <button
              type="button"
              className="text-sm font-medium text-text underline"
              aria-expanded={showDone}
              onClick={() => setShowDone((current) => !current)}
            >
              Ver en viaje y entregados ({doneOrders.length})
            </button>
            {showDone && (
              <div className="mt-3 flex flex-col gap-3">
                {doneOrders.length === 0 ? (
                  <p className="empty">No hay pedidos.</p>
                ) : (
                  doneOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      sheets={sheets}
                      canPlan={canPlan}
                      today={today}
                      onOpen={() => openPedido(order.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : view === 'kanban' ? (
        <div className="board-scroll">
          <div className={statusFilter && statusFilter !== 'abiertos' ? 'kanban filtered' : 'kanban'}>
            {columns.map((status) => {
              const column = [...ordersByStatus(visibleOrders, status)].sort(sortPanelList)
              return (
                <section key={status} className="column" aria-label={STATUS_LABEL[status]}>
                  <header className="column-head">
                    <span>{STATUS_LABEL[status]}</span>
                    <span className="count">{column.length}</span>
                  </header>
                  {column.length === 0 ? (
                    <p className="empty">No hay pedidos.</p>
                  ) : (
                    <div className="column-cards">
                      {column.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          sheets={sheets}
                          canPlan={canPlan}
                          today={today}
                          onOpen={() => openPedido(order.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <ListBox
          className="mt-4"
          counters={[
            {
              key: 'abiertos',
              label: 'Abiertos',
              count: openCount,
              active: statusFilter === 'abiertos',
              onClick: () => setStatusFilter('abiertos'),
            },
            {
              key: 'entregados',
              label: 'Entregados',
              count: deliveredCount,
              active: statusFilter === 'entregado',
              onClick: () => setStatusFilter('entregado'),
            },
          ]}
        >
          <Table
            bare
            columns={panelColumns}
            rows={visibleOrders}
            rowKey={(order) => order.id}
            onRowClick={(order) => openPedido(order.id)}
            empty={
              <EmptyState
                variant="plain"
                icon={<NavIcon name="box" />}
                title="No hay pedidos"
                action={
                  dateFilter !== 'semana' ? (
                    <button type="button" onClick={() => selectFecha('semana')}>
                      Limpiar filtros
                    </button>
                  ) : undefined
                }
              />
            }
          />
        </ListBox>
      )}

      <Drawer
        open={Boolean(openOrder)}
        onClose={closePedido}
        title={openOrder?.id ?? 'Pedido'}
        subtitle={openOrder ? openOrder.client.toUpperCase() : undefined}
        footer={
          openOrder ? (
            <DetailActions order={openOrder} sheets={sheets} canPlan={canPlan} onRemoved={closePedido} />
          ) : null
        }
      >
        {openOrder ? (
          <div className="flex flex-col gap-4">
            {takeState(openOrder) === 'en-preparacion' ? (
              <p className="text-sm text-muted">
                En preparación · {takenByName(openOrder) || 'operario'} · <PrepClock order={openOrder} />
              </p>
            ) : null}
            <OrderDetail order={openOrder} compact />
            <PrepChecklist order={openOrder} userId={user?.id} role={user?.role} />
          </div>
        ) : null}
      </Drawer>
    </Page>
  )
}
