import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { Spinner } from '../components/LoadState'
import { isPickup } from '../data/catalog'
import type { Order, OrderStatus } from '../data/orders'
import type { Role } from '../lib/authStore'
import { normalizeInvoiceKey } from '../lib/invoiceKey'
import { statusPillFor } from '../lib/orderFlow'
import {
  addDays,
  formatIsoDate,
  startOfWeek,
  toIso,
} from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders, type OrderSaveResult } from '../state/OrdersContext'

type ChipStatus = 'pendiente' | 'preparado' | 'entregado'

const CHIPS: { value: ChipStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'preparado', label: 'Listo para retirar' },
  { value: 'entregado', label: 'Retirado' },
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
  if (compact(order.phone ?? '').includes(needle)) return true
  const invoiceNeedle = normalizeInvoiceKey(raw)
  if (!invoiceNeedle) return false
  return (order.invoices ?? []).some((invoice) => {
    const key = normalizeInvoiceKey(invoice)
    return key === invoiceNeedle || key.includes(invoiceNeedle)
  })
}

function inDateRange(order: Order, from: string, to: string, allDates: boolean) {
  if (allDates) return true
  if (from && order.deliveryDate < from) return false
  if (to && order.deliveryDate > to) return false
  return true
}

function isOpenPickup(order: Order) {
  return order.status === 'pendiente' || order.status === 'preparado'
}

function isOverdue(order: Order, today: string) {
  return isOpenPickup(order) && Boolean(order.deliveryDate) && order.deliveryDate < today
}

function passesDate(order: Order, from: string, to: string, allDates: boolean, today: string) {
  if (isOverdue(order, today)) return true
  return inDateRange(order, from, to, allDates)
}

function formatWhen(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toggleChip(current: Set<ChipStatus>, value: ChipStatus) {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function Retiros() {
  const { user } = useAuth()
  const { orders, loading, error: ordersError, transitionOrder } = useOrders()
  const defaults = weekRange()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<ChipStatus>>(
    () => new Set<ChipStatus>(['pendiente', 'preparado']),
  )
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [allDates, setAllDates] = useState(false)
  const [busyId, setBusyId] = useState('')
  const today = toIso(new Date())

  const pickups = useMemo(() => orders.filter((order) => isPickup(order)), [orders])

  const scoped = useMemo(
    () =>
      pickups.filter(
        (order) => matchesQuery(order, query) && passesDate(order, from, to, allDates, today),
      ),
    [pickups, query, from, to, allDates, today],
  )

  const counts = useMemo(() => {
    const map: Record<ChipStatus, number> = { pendiente: 0, preparado: 0, entregado: 0 }
    for (const order of scoped) {
      if (order.status in map) map[order.status as ChipStatus] += 1
    }
    return map
  }, [scoped])

  const filtered = useMemo(() => {
    const list = scoped.filter((order) => selected.has(order.status as ChipStatus))
    return [...list].sort((left, right) => {
      const leftUpcoming = left.deliveryDate >= today
      const rightUpcoming = right.deliveryDate >= today
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
      if (left.deliveryDate !== right.deliveryDate) {
        if (leftUpcoming) return left.deliveryDate < right.deliveryDate ? -1 : 1
        return left.deliveryDate > right.deliveryDate ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
  }, [scoped, selected, today])

  if (loading) {
    return (
      <section className="page">
        <Spinner label="Cargando retiros…" />
      </section>
    )
  }

  if (!user) return null

  return (
    <section className="page">
      <header className="page-header">
        <h1>Retiros</h1>
        <p>Pedidos para retirar por el local.</p>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <label className="block text-sm">
          <span className="sr-only">Buscar retiro</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cliente, teléfono, pedido o factura"
            className="w-full rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={selected.has(chip.value) ? 'zone-chip active' : 'zone-chip'}
              onClick={() => setSelected((prev) => toggleChip(prev, chip.value))}
            >
              {chip.label} ({counts[chip.value]})
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
        {filtered.length} retiro{filtered.length === 1 ? '' : 's'}
      </p>

      {ordersError ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm font-semibold text-lumi-danger shadow-sm">
          {ordersError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-lumi-muted shadow-sm">
          {pickups.length === 0
            ? 'No hay retiros para mostrar.'
            : 'No hay retiros que coincidan con la búsqueda o los filtros.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {filtered.map((order) => (
            <li key={order.id}>
              <PickupCard
                order={order}
                today={today}
                role={user.role}
                busy={busyId === order.id}
                onBusy={(busy) => setBusyId(busy ? order.id : '')}
                transition={transitionOrder}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PickupCard({
  order,
  today,
  role,
  busy,
  onBusy,
  transition,
}: {
  order: Order
  today: string
  role: Role
  busy: boolean
  onBusy: (busy: boolean) => void
  transition: (id: string, body: Record<string, unknown>) => Promise<OrderSaveResult>
}) {
  const overdue = isOverdue(order, today)
  const withdrawnAt = formatWhen(order.deliveredAt)
  const status = order.status as OrderStatus

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong>
              <Link className="order-link" to={`/pedidos/${order.id}`}>
                {order.id}
              </Link>
            </strong>
            <span className={`status-pill status-${status}`}>{statusPillFor(order, status)}</span>
            {overdue && (
              <span className="inline-flex rounded-full bg-[#fde8e7] px-2.5 py-0.5 text-xs font-medium text-lumi-danger">
                Atrasado
              </span>
            )}
          </div>
          <p className="mt-2 font-semibold uppercase">
            <Link className="order-link" to={`/pedidos/${order.id}`}>
              {order.client}
            </Link>
          </p>
          <div className="mt-3 flex flex-col gap-1 text-sm text-[#5f5b55]">
            {order.phone && <p>Teléfono: {order.phone}</p>}
            <p>Fecha de retiro: {formatIsoDate(order.deliveryDate)}</p>
            {order.invoices && order.invoices.length > 0 && (
              <p>Factura: {order.invoices.join(', ')}</p>
            )}
            {order.packages != null && <p>Bultos: {order.packages}</p>}
            {order.status === 'entregado' && order.receiverName && (
              <p>
                Retirado por {order.receiverName}
                {withdrawnAt ? ` · ${withdrawnAt}` : ''}
              </p>
            )}
          </div>
          <div className="mt-3">
            <OrderStepper order={order} variant="compact" />
          </div>
        </div>
        <div className="shrink-0">
          <OrderFlowButtons
            order={order}
            role={role}
            via="retiros"
            busy={busy}
            onBusy={onBusy}
            transition={transition}
            layout="stretch"
          />
        </div>
      </div>
    </article>
  )
}
