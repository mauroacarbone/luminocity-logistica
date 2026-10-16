import { useMemo, useState } from 'react'
import { Button, EmptyState, FilterBar, ListBox, Page, PageHeader } from '../components/ui'
import { NavIcon } from '../layout/NavIcon'
import { Link } from 'react-router-dom'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { Spinner } from '../components/LoadState'
import { DISPATCH_LABEL, isOwnDelivery, isPickup } from '../data/catalog'
import type { Order, OrderStatus } from '../data/orders'
import { normalizeInvoiceKey } from '../lib/invoiceKey'
import { statusPillFor } from '../lib/orderFlow'
import { compareOpenPriority } from '../lib/priority'
import { normalizeTimeWindow } from '../lib/slot'
import {
  addDays,
  formatIsoDate,
  startOfWeek,
  toIso,
} from '../lib/week'
import { useOrders } from '../state/OrdersContext'

type StatusFilter = 'todos' | OrderStatus | 'despachado' | 'listo-retirar' | 'retirado'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'preparado', label: 'Preparado' },
  { value: 'listo-retirar', label: 'Listo para retirar' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'despachado', label: 'Despachado' },
  { value: 'en-viaje', label: 'En viaje' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'retirado', label: 'Retirado' },
]

function weekRange() {
  const start = startOfWeek(new Date())
  const end = addDays(start, 6)
  return { from: toIso(start), to: toIso(end) }
}

function compact(value: string) {
  return value.trim().toLocaleLowerCase('es').replace(/\s+/g, '')
}

function matchesQuery(order: Order, raw: string) {
  const needle = compact(raw)
  if (!needle) return true
  if (compact(order.id).includes(needle)) return true
  if (compact(order.client).includes(needle)) return true
  const invoiceNeedle = normalizeInvoiceKey(raw)
  if (!invoiceNeedle) return false
  return (order.invoices ?? []).some((invoice) => {
    const key = normalizeInvoiceKey(invoice)
    return key === invoiceNeedle || key.includes(invoiceNeedle)
  })
}

function matchesStatus(order: Order, filter: StatusFilter) {
  if (filter === 'todos') return true
  if (filter === 'despachado') {
    return order.status === 'asignado' && order.dispatchType === 'correo'
  }
  if (filter === 'asignado') {
    return order.status === 'asignado' && isOwnDelivery(order)
  }
  if (filter === 'listo-retirar') {
    return order.status === 'preparado' && isPickup(order)
  }
  if (filter === 'retirado') {
    return order.status === 'entregado' && isPickup(order)
  }
  if (filter === 'preparado') {
    return order.status === 'preparado' && !isPickup(order)
  }
  if (filter === 'entregado') {
    return order.status === 'entregado' && !isPickup(order)
  }
  return order.status === filter
}

function inDateRange(order: Order, from: string, to: string, allDates: boolean) {
  if (allDates) return true
  if (from && order.deliveryDate < from) return false
  if (to && order.deliveryDate > to) return false
  return true
}

function carrierLine(order: Order) {
  if (order.driverName?.trim()) return order.driverName.trim()
  if (order.transporter?.trim()) return order.transporter.trim()
  return 'Sin asignar'
}

function dispatchLabel(order: Order) {
  if (order.dispatchType === 'correo') return DISPATCH_LABEL.correo
  if (isPickup(order)) return DISPATCH_LABEL.retiro
  return DISPATCH_LABEL.propia
}

export function Seguimiento() {
  const { orders, loading, error: ordersError } = useOrders()
  const defaults = weekRange()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [allDates, setAllDates] = useState(false)
  const today = toIso(new Date())

  const hasCorreo = useMemo(
    () => orders.some((order) => order.dispatchType === 'correo'),
    [orders],
  )
  const hasPickup = useMemo(() => orders.some((order) => isPickup(order)), [orders])

  const chips = STATUS_CHIPS.filter((chip) => {
    if (chip.value === 'despachado') return hasCorreo
    if (chip.value === 'listo-retirar' || chip.value === 'retirado') return hasPickup
    return true
  })

  const filtered = useMemo(() => {
    const list = orders.filter(
      (order) =>
        matchesQuery(order, query) &&
        matchesStatus(order, statusFilter) &&
        inDateRange(order, from, to, allDates),
    )
    return [...list].sort((left, right) => {
      const byPriority = compareOpenPriority(left, right)
      if (byPriority !== 0) return byPriority
      const leftUpcoming = left.deliveryDate >= today
      const rightUpcoming = right.deliveryDate >= today
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
      if (left.deliveryDate !== right.deliveryDate) {
        if (leftUpcoming) return left.deliveryDate < right.deliveryDate ? -1 : 1
        return left.deliveryDate > right.deliveryDate ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
  }, [orders, query, statusFilter, from, to, allDates, today])

  const statusBase = orders.filter(
    (order) => matchesQuery(order, query) && inDateRange(order, from, to, allDates),
  )
  const counters = chips.map((chip) => ({
    key: chip.value,
    label: chip.label,
    count: statusBase.filter((order) => matchesStatus(order, chip.value)).length,
    active: statusFilter === chip.value,
    onClick: () => setStatusFilter(chip.value),
  }))

  if (loading) {
    return (
      <Page>
        <Spinner label="Cargando pedidos…" />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title="Seguimiento" subtitle="Buscá un pedido y mirá en qué estado está." />

      <FilterBar
        className="mt-6"
        search={{
          value: query,
          onChange: setQuery,
          label: 'Buscar pedido',
          srOnly: true,
          placeholder: 'Número, cliente o factura',
        }}
        dateRange={{
          from,
          to,
          disabled: allDates,
          onChange: ({ from: nextFrom, to: nextTo }) => {
            setFrom(nextFrom)
            setTo(nextTo)
            setAllDates(false)
          },
        }}
        activeCount={
          (query.trim() ? 1 : 0) +
          (statusFilter !== 'todos' ? 1 : 0) +
          (allDates || from !== defaults.from || to !== defaults.to ? 1 : 0)
        }
        onClear={() => {
          const range = weekRange()
          setQuery('')
          setStatusFilter('todos')
          setFrom(range.from)
          setTo(range.to)
          setAllDates(false)
        }}
      />
      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            if (allDates) {
              const range = weekRange()
              setFrom(range.from)
              setTo(range.to)
              setAllDates(false)
            } else {
              setAllDates(true)
            }
          }}
        >
          {allDates ? 'Esta semana' : 'Ver todas las fechas'}
        </Button>
      </div>

      <ListBox className="mt-4" counters={counters}>
        {ordersError ? (
          <div className="px-5 py-8 text-center text-sm font-semibold text-danger">{ordersError}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="plain"
            icon={<NavIcon name="box" />}
            title="No hay pedidos"
            action={
              (query.trim() ? 1 : 0) +
                (statusFilter !== 'todos' ? 1 : 0) +
                (allDates || from !== defaults.from || to !== defaults.to ? 1 : 0) >
              0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const range = weekRange()
                    setQuery('')
                    setStatusFilter('todos')
                    setFrom(range.from)
                    setTo(range.to)
                    setAllDates(false)
                  }}
                >
                  Limpiar filtros
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul>
            {filtered.map((order) => {
              const slot = normalizeTimeWindow(order.timeWindow)
              return (
                <li key={order.id} className="min-h-14 border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>
                        <Link className="order-link" to={`/pedidos/${order.id}`}>
                          {order.id}
                        </Link>
                      </strong>
                      <PriorityChip order={order} />
                      <span className={`status-pill status-${order.status}`}>
                        {statusPillFor(order, order.status)}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold uppercase">
                      <Link className="order-link" to={`/pedidos/${order.id}`}>
                        {order.client}
                      </Link>
                    </p>
                    <div className="mt-3 flex flex-col gap-1 text-sm text-subtle">
                      {order.seller && <p>Vendedor: {order.seller}</p>}
                      <p>
                        {isPickup(order) ? 'Retiro' : 'Entrega'}: {formatIsoDate(order.deliveryDate)}
                        {!isPickup(order) && slot ? ` · ${slot}` : ''}
                      </p>
                      <p>Despacho: {dispatchLabel(order)}</p>
                      {isPickup(order) ? (
                        <p>
                          <span className="status-pill">{DISPATCH_LABEL.retiro}</span>
                        </p>
                      ) : (
                        <p>
                          {order.dispatchType === 'correo' ? 'Transportista' : 'Chofer'}:{' '}
                          {carrierLine(order)}
                        </p>
                      )}
                      {order.invoices && order.invoices.length > 0 && (
                        <p>Factura: {order.invoices.join(', ')}</p>
                      )}
                    </div>
                    <div className="mt-3">
                      <OrderStepper order={order} variant="compact" />
                    </div>
                  </div>
                  <Link
                    className="order-link shrink-0 text-sm font-semibold"
                    to={`/pedidos/${order.id}`}
                  >
                    Ver detalle
                  </Link>
                </div>
              </li>
            )
          })}
          </ul>
        )}
      </ListBox>
    </Page>
  )
}
