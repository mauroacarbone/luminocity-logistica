import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Drawer, EmptyState, FilterBar, KpiCard, ListBox, Page, PageHeader, statusTone, Table, type TableColumn } from '../components/ui'
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
import { canEditOrder, canOpen } from '../lib/access'
import { statusPillFor } from '../lib/orderFlow'
import { compareOpenPriority } from '../lib/priority'
import { placeLine } from '../lib/place'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { normalizeTimeWindow } from '../lib/slot'
import { addDays, formatIsoDate, startOfWeek, toIso } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

const ADVANCE_STATUSES: OrderStatus[] = ['pendiente', 'preparado', 'asignado']
const DONE_STATUSES: OrderStatus[] = ['en-viaje', 'entregado']

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
  const { transitionOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const waiting = pendingEdit(order)
  const flowOrder = withSheetFlag(order, sheets, canPlan)

  return (
    <article className="order-card">
      <div className="order-card-top">
        <strong className="inline-flex flex-wrap items-center gap-2">
          <Link className="order-link" to={`/pedidos/${order.id}`}>
            {order.id}
          </Link>
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
      </div>
    </article>
  )
}

function DetailActions({
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
    <>
      {user ? (
        <OrderFlowButtons
          order={flowOrder}
          role={user.role}
          via="panel"
          busy={busy}
          onBusy={setBusy}
          transition={transitionOrder}
        />
      ) : null}
      {user && canEditOrder(user, order) ? (
        <Button variant="ghost" onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}>
          Editar
        </Button>
      ) : null}
      <SheetLinks order={order} sheets={sheets} canPlan={canPlan} />
    </>
  )
}

function PanelViewSwitch({ view, onChange }: { view: View; onChange: (next: View) => void }) {
  const item = (value: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => onChange(value)}
      className={`rounded px-2.5 py-1 text-sm ${view === value ? 'bg-bg font-semibold text-text' : 'text-muted'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="inline-flex rounded-md bg-surface-2 p-0.5" role="group" aria-label="Vista">
      {item('kanban', 'Tablero')}
      {item('tabla', 'Tabla')}
    </div>
  )
}

export function PanelOperativo() {
  const { user } = useAuth()
  const { orders, loading } = useOrders()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<View>(loadView)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null)
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [sheetsError, setSheetsError] = useState(false)
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches,
  )
  const [showDone, setShowDone] = useState(false)

  const dateFilter = parseFecha(searchParams.get('fecha'))
  const openId = searchParams.get('pedido')
  const openOrder = orders.find((order) => order.id === openId) ?? null
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

  const visibleOrders = useMemo(() => {
    const list = statusFilter ? ordersByStatus(datedOrders, statusFilter) : datedOrders
    return [...list].sort(sortPanelList)
  }, [datedOrders, statusFilter])
  const columns = statusFilter ? [statusFilter] : STATUS_ORDER
  const undatedCount = datedOrders.filter((order) => !hasDeliveryDate(order)).length
  const overdueCount = orders.filter(
    (order) =>
      isOverdue(order, today) &&
      (order.status === 'pendiente' ||
        order.status === 'preparado' ||
        order.status === 'asignado' ||
        order.status === 'en-viaje'),
  ).length
  const openCount = datedOrders.filter((order) => order.status !== 'entregado').length
  const deliveredCount = countFor(datedOrders, 'entregado')
  const listFiltersActive = dateFilter !== 'semana' || statusFilter !== null
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
          <Link
            className="font-medium text-accent hover:underline"
            to={`/pedidos/${order.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            {order.id}
          </Link>
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
      cell: (order) => <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>,
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
          user && canOpen(user.role, '/nuevo-pedido') ? (
            <Button variant="primary" onClick={() => navigate('/nuevo-pedido')}>
              Nuevo pedido
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        className="mt-4"
        chips={[
          {
            id: 'fecha',
            label: 'Fecha de entrega',
            value: dateFilter,
            options: FECHA_CHIPS,
            onChange: (value) => selectFecha(value as FechaFilter),
          },
        ]}
        activeCount={dateFilter === 'semana' ? 0 : 1}
        onClear={() => selectFecha('semana')}
      />

      {sheetsError && (
        <p className="mt-3 text-sm text-muted">No se pudieron cargar las hojas de ruta</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
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
      <p className="mt-2 text-sm text-muted">
        {fechaLabel}
        {undatedCount > 0 ? ` · ${undatedCount} sin fecha` : ''}
      </p>

      {view === 'kanban' ? (
        <div className="mt-4 flex justify-end">
          <PanelViewSwitch view={view} onChange={selectView} />
        </div>
      ) : null}

      {view === 'kanban' && useAdvanceList ? (
        <div className="mt-4 flex flex-col gap-3">
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
          <div className={statusFilter ? 'kanban filtered' : 'kanban'}>
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
              active: statusFilter !== 'entregado',
              onClick: () => selectSummary('total'),
            },
            {
              key: 'entregados',
              label: 'Entregados',
              count: deliveredCount,
              active: statusFilter === 'entregado',
              onClick: () => selectSummary('entregado'),
            },
          ]}
          view={<PanelViewSwitch view={view} onChange={selectView} />}
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
                  listFiltersActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        selectFecha('semana')
                        selectSummary('total')
                      }}
                    >
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
        footer={openOrder ? <DetailActions order={openOrder} sheets={sheets} canPlan={canPlan} /> : null}
      >
        {openOrder ? (
          <div className="flex flex-col gap-4">
            <Link className="text-sm font-medium text-accent hover:underline" to={`/pedidos/${openOrder.id}`}>
              Abrir página completa
            </Link>
            <OrderDetail order={openOrder} compact />
          </div>
        ) : null}
      </Drawer>
    </Page>
  )
}
