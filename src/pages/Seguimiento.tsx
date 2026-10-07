import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderStepper } from '../components/OrderStepper'
import { Spinner } from '../components/LoadState'
import { DISPATCH_LABEL } from '../data/catalog'
import type { Order, OrderStatus } from '../data/orders'
import { normalizeInvoiceKey } from '../lib/invoiceKey'
import { statusPillFor } from '../lib/orderFlow'
import { normalizeTimeWindow } from '../lib/slot'
import {
  addDays,
  formatIsoDate,
  startOfWeek,
  toIso,
} from '../lib/week'
import { useOrders } from '../state/OrdersContext'

type StatusFilter = 'todos' | OrderStatus | 'despachado'

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'preparado', label: 'Preparado' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'despachado', label: 'Despachado' },
  { value: 'en-viaje', label: 'En viaje' },
  { value: 'entregado', label: 'Entregado' },
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
    return order.status === 'asignado' && order.dispatchType !== 'correo'
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
  return DISPATCH_LABEL.propia
}

export function Seguimiento() {
  const { orders, loading } = useOrders()
  const defaults = weekRange()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [allDates, setAllDates] = useState(false)

  const hasCorreo = useMemo(
    () => orders.some((order) => order.dispatchType === 'correo'),
    [orders],
  )

  const chips = STATUS_CHIPS.filter(
    (chip) => chip.value !== 'despachado' || hasCorreo,
  )

  const filtered = useMemo(() => {
    const list = orders.filter(
      (order) =>
        matchesQuery(order, query) &&
        matchesStatus(order, statusFilter) &&
        inDateRange(order, from, to, allDates),
    )
    return [...list].sort((left, right) => {
      if (left.deliveryDate !== right.deliveryDate) {
        return left.deliveryDate < right.deliveryDate ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
  }, [orders, query, statusFilter, from, to, allDates])

  if (loading) {
    return (
      <section className="page">
        <Spinner label="Cargando pedidos…" />
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Seguimiento</h1>
        <p>Buscá un pedido y mirá en qué estado está.</p>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <label className="block text-sm">
          <span className="sr-only">Buscar pedido</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Número, cliente o factura"
            className="w-full rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={statusFilter === chip.value ? 'zone-chip active' : 'zone-chip'}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Desde
            <input
              type="date"
              value={from}
              disabled={allDates}
              onChange={(event) => {
                setFrom(event.target.value)
                setAllDates(false)
              }}
              className="mt-1 block rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            Hasta
            <input
              type="date"
              value={to}
              disabled={allDates}
              onChange={(event) => {
                setTo(event.target.value)
                setAllDates(false)
              }}
              className="mt-1 block rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm shadow-sm"
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
          </button>
        </div>
      </div>

      <p className="mt-6 text-sm text-lumi-muted">
        {filtered.length} de {orders.length} pedido{orders.length === 1 ? '' : 's'}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-lumi-muted shadow-sm">
          {orders.length === 0
            ? 'No hay pedidos para mostrar.'
            : 'No hay pedidos que coincidan con la búsqueda o los filtros.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {filtered.map((order) => {
            const slot = normalizeTimeWindow(order.timeWindow)
            return (
              <li key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>
                        <Link className="order-link" to={`/pedidos/${order.id}`}>
                          {order.id}
                        </Link>
                      </strong>
                      <span className={`status-pill status-${order.status}`}>
                        {statusPillFor(order, order.status)}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold uppercase">
                      <Link className="order-link" to={`/pedidos/${order.id}`}>
                        {order.client}
                      </Link>
                    </p>
                    <div className="mt-3 flex flex-col gap-1 text-sm text-[#5f5b55]">
                      {order.seller && <p>Vendedor: {order.seller}</p>}
                      <p>
                        Entrega: {formatIsoDate(order.deliveryDate)}
                        {slot ? ` · ${slot}` : ''}
                      </p>
                      <p>Despacho: {dispatchLabel(order)}</p>
                      <p>
                        {order.dispatchType === 'correo' ? 'Transportista' : 'Chofer'}:{' '}
                        {carrierLine(order)}
                      </p>
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
    </section>
  )
}
