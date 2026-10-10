import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { DISPATCH_LABEL } from '../data/catalog'
import {
  ordersByStatus,
  pendingEdit,
  STATUS_LABEL,
  STATUS_ORDER,
  type Order,
  type OrderStatus,
} from '../data/orders'
import { canEditOrder, canOpen } from '../lib/access'
import { statusPillFor } from '../lib/orderFlow'
import { placeLine } from '../lib/place'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { normalizeTimeWindow } from '../lib/slot'
import { addDays, formatIsoDate, startOfWeek, toIso } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

const ADVANCE_STATUSES: OrderStatus[] = ['pendiente', 'preparado', 'asignado']
const DONE_STATUSES: OrderStatus[] = ['en-viaje', 'entregado']

function sortPanelList(left: Order, right: Order) {
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
    <span className="inline-flex rounded-full bg-[#fde8e7] px-2.5 py-0.5 text-xs font-medium text-lumi-danger">
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
        <span className="inline-flex rounded-full bg-[#f7f4ea] px-2.5 py-0.5 text-xs font-medium text-lumi-ink">
          En hoja de {driver} · {slot}
        </span>
        <Link className="text-xs text-lumi-ink underline" to="/rutas">
          Ver hoja
        </Link>
      </p>
    )
  }
  if (
    canPlan &&
    order.status === 'asignado' &&
    order.dispatchType !== 'correo' &&
    !order.routeId
  ) {
    return (
      <p className="order-zone mt-2">
        <Link className="text-xs text-lumi-muted underline hover:text-lumi-ink" to="/rutas">
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
}: {
  order: Order
  sheets: RouteSheet[]
  canPlan: boolean
  today: string
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const waiting = pendingEdit(order)
  const flowOrder = withSheetFlag(order, sheets, canPlan)

  return (
    <article className="order-card">
      <div className="order-card-top">
        <strong>
          <Link className="order-link" to={`/pedidos/${order.id}`}>
            {order.id}
          </Link>
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
        <OverdueChip order={order} today={today} />
      </div>
      <p className="order-client">
        <Link className="order-link" to={`/pedidos/${order.id}`}>
          {order.client}
        </Link>
      </p>
      {waiting && <p className="order-zone">Esperando confirmación</p>}
      {order.address && <p className="order-zone">{order.address}</p>}
      {placeLine(order) && <p className="order-zone">{placeLine(order)}</p>}
      {order.zone && <p className="order-zone">{order.zone}</p>}
      {order.dispatchType && (
        <p className="order-zone">Despacho: {DISPATCH_LABEL[order.dispatchType]}</p>
      )}
      {order.transporter && <p className="order-zone">Transportista: {order.transporter}</p>}
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
            className="text-lumi-ink hover:underline"
            onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}
          >
            Editar
          </button>
        )}
        <Link className="text-lumi-muted hover:text-lumi-ink hover:underline" to={`/pedidos/${order.id}`}>
          Ver detalle
        </Link>
      </div>
    </article>
  )
}

function TableActions({
  order,
  sheets,
  canPlan,
}: {
  order: Order
  sheets: RouteSheet[]
  canPlan: boolean
}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const flowOrder = withSheetFlag(order, sheets, canPlan)

  return (
    <div className="flex flex-col items-start gap-1.5">
      <SheetLinks order={order} sheets={sheets} canPlan={canPlan} />
      {user && (
        <OrderFlowButtons
          order={flowOrder}
          role={user.role}
          via="panel"
          busy={busy}
          onBusy={setBusy}
          transition={transitionOrder}
          layout="compact"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {user && canEditOrder(user, order) && (
          <button
            type="button"
            className="text-lumi-ink hover:underline"
            onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}
          >
            Editar
          </button>
        )}
        <Link className="text-lumi-muted hover:text-lumi-ink hover:underline" to={`/pedidos/${order.id}`}>
          Ver detalle
        </Link>
      </div>
    </div>
  )
}

export function PanelOperativo() {
  const { user } = useAuth()
  const { orders } = useOrders()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<View>(loadView)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null)
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [sheetsError, setSheetsError] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const dateFilter = parseFecha(searchParams.get('fecha'))
  const today = toIso(new Date())
  const tomorrow = toIso(addDays(new Date(), 1))
  const weekStart = startOfWeek(new Date())
  const weekFrom = toIso(weekStart)
  const weekTo = toIso(addDays(weekStart, 6))
  const fechaLabel = FECHA_CHIPS.find((chip) => chip.value === dateFilter)?.label ?? 'Esta semana'

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

  const datedOrders = useMemo(
    () =>
      orders.filter((order) =>
        matchesFecha(order, dateFilter, today, tomorrow, weekFrom, weekTo),
      ),
    [orders, dateFilter, today, tomorrow, weekFrom, weekTo],
  )

  const visibleOrders = statusFilter ? ordersByStatus(datedOrders, statusFilter) : datedOrders
  const columns = statusFilter ? [statusFilter] : STATUS_ORDER
  const undatedCount = datedOrders.filter((order) => !hasDeliveryDate(order)).length
  const useAdvanceList = narrow && view === 'kanban' && !statusFilter

  const advanceOrders = useMemo(
    () =>
      visibleOrders
        .filter((order) => ADVANCE_STATUSES.includes(order.status))
        .sort(sortPanelList),
    [visibleOrders],
  )
  const doneOrders = useMemo(
    () =>
      visibleOrders
        .filter((order) => DONE_STATUSES.includes(order.status))
        .sort(sortPanelList),
    [visibleOrders],
  )

  const datesKey = useMemo(() => {
    let dates = [...new Set(visibleOrders.map((order) => order.deliveryDate).filter(Boolean))]
    if (dateFilter === 'todos') {
      dates = dates.filter((date) => date >= today)
    } else if (dateFilter === 'semana') {
      dates = dates.filter((date) => date >= weekFrom && date <= weekTo)
    } else if (dateFilter === 'hoy') {
      dates = dates.filter((date) => date === today)
    } else if (dateFilter === 'manana') {
      dates = dates.filter((date) => date === tomorrow)
    }
    dates.sort()
    return dates.join('|')
  }, [visibleOrders, dateFilter, today, tomorrow, weekFrom, weekTo])

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
  }, [canPlan, datesKey])

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

  return (
    <section className="page">
      <header className="page-header row">
        <div>
          <h1>Panel Operativo</h1>
          <p>Resumen de la operación en tiempo real</p>
        </div>
        <div className="view-toggle" role="group" aria-label="Vista">
          <button
            type="button"
            className={view === 'kanban' ? 'active' : undefined}
            aria-pressed={view === 'kanban'}
            onClick={() => selectView('kanban')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="5" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <rect x="10" y="4" width="5" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <rect x="17" y="4" width="4" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Tablero
          </button>
          <button
            type="button"
            className={view === 'tabla' ? 'active' : undefined}
            aria-pressed={view === 'tabla'}
            onClick={() => selectView('tabla')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M4 10h16M4 15h16M10 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Tabla
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Fecha de entrega">
        {FECHA_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className={dateFilter === chip.value ? 'zone-chip active' : 'zone-chip'}
            aria-pressed={dateFilter === chip.value}
            onClick={() => selectFecha(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {sheetsError && (
        <p className="mt-3 text-sm text-lumi-muted">No se pudieron cargar las hojas de ruta</p>
      )}

      <div className="stats">
        {SUMMARY.map((item) => {
          const active = item.key === 'total' ? statusFilter === null : statusFilter === item.key
          return (
            <button
              key={item.key}
              type="button"
              className={active ? 'stat-card active' : 'stat-card'}
              aria-pressed={active}
              onClick={() => selectSummary(item.key)}
            >
              <strong>{countFor(datedOrders, item.key)}</strong>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-lumi-muted">
        {fechaLabel}
        {undatedCount > 0 ? ` · ${undatedCount} sin fecha` : ''}
      </p>

      {view === 'kanban' && useAdvanceList ? (
        <div className="mt-4 flex flex-col gap-3">
          <h2 className="text-base font-semibold text-lumi-ink">Para avanzar</h2>
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
              />
            ))
          )}
          <div className="mt-2">
            <button
              type="button"
              className="text-sm font-medium text-lumi-ink underline"
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
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : view === 'kanban' ? (
        <div className="board-scroll">
          <div className={statusFilter ? 'kanban filtered' : 'kanban'}>
            {columns.map((status) => {
              const column = ordersByStatus(visibleOrders, status)
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
        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Transportista</th>
                <th>Bultos</th>
                <th>Cargado</th>
                <th>Entrega</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    {orders.length === 0 ? 'No hay pedidos.' : 'Ningún pedido coincide con el filtro.'}
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="order-link" to={`/pedidos/${order.id}`}>
                        {order.id}
                      </Link>
                      {isOverdue(order, today) ? (
                        <span className="ml-2 inline-flex align-middle">
                          <OverdueChip order={order} today={today} />
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Link className="order-link" to={`/pedidos/${order.id}`}>
                        {order.client}
                      </Link>
                      {order.zone ? <span className="zone-inline"> · {order.zone}</span> : null}
                    </td>
                    <td>
                      <span className={`status-pill status-${order.status}`}>
                        {statusPillFor(order, order.status)}
                      </span>
                    </td>
                    <td>
                      {order.transporter || '—'}
                      {order.dispatchType && (
                        <span className="zone-inline"> · {DISPATCH_LABEL[order.dispatchType]}</span>
                      )}
                    </td>
                    <td>{order.packages != null ? order.packages : '—'}</td>
                    <td>{order.loadedAt}</td>
                    <td>{formatIsoDate(order.deliveryDate)}</td>
                    <td>
                      <TableActions order={order} sheets={sheets} canPlan={canPlan} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
