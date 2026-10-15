import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NoAccess } from '../components/NoAccess'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { ServerDown, Spinner } from '../components/LoadState'
import { DISPATCH_LABEL } from '../data/catalog'
import { type Order, type OrderHistoryEntry, type OrderPriority, type OrderStatus } from '../data/orders'
import { confirm, error as showError } from '../lib/alerts'
import { placeLine } from '../lib/place'
import { statusPillFor } from '../lib/orderFlow'
import { getOrder } from '../lib/ordersApi'
import { PRIORITIES, PRIORITY_LABEL, priorityOf } from '../lib/priority'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

const VIA_LABEL: Record<string, string> = {
  pedidos: 'Pedidos',
  despacho: 'Despacho',
  hoja: 'Hoja de ruta',
  'mis-entregas': 'Mis entregas',
  qr: 'QR',
  picking: 'desde picking',
  panel: 'Panel',
  retiros: 'Retiros',
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.client === 'string' && typeof item.status === 'string'
}

function historyOf(order: Order): OrderHistoryEntry[] {
  if (!Array.isArray(order.history) || order.history.length === 0) return []
  return [...order.history].sort((left, right) => (left.at < right.at ? 1 : left.at > right.at ? -1 : 0))
}

function statusText(order: Order, status: OrderStatus | null) {
  if (!status) return '—'
  return statusPillFor(order, status)
}

function PedidoDetalleView({ id }: { id: string }) {
  const { user, logout } = useAuth()
  const { transitionOrder, updateOrder } = useOrders()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [priorityBusy, setPriorityBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    void getOrder(id).then((result) => {
      if (!alive) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        if (result.status === 403) {
          setForbidden(true)
          setLoading(false)
          return
        }
        if (result.status === 404) {
          setMissing(true)
          setLoading(false)
          return
        }
        setError(result.message)
        setLoading(false)
        return
      }
      if (!isOrder(result.data)) {
        setError('No se pudo leer el pedido.')
        setLoading(false)
        return
      }
      setOrder(result.data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id, logout, reloadKey])

  if (forbidden) return <NoAccess />
  if (missing) {
    return (
      <section className="page">
        <header className="page-header">
          <h1>No existe ese pedido</h1>
          <p>
            <Link to="/pedidos">Volver a pedidos</Link>
          </p>
        </header>
      </section>
    )
  }
  if (loading) {
    return (
      <section className="page">
        <Spinner label="Cargando pedido…" />
      </section>
    )
  }
  if (error) {
    return (
      <section className="page">
        <ServerDown
          message={error}
          onRetry={() => {
            setError('')
            setLoading(true)
            setReloadKey((key) => key + 1)
          }}
        />
      </section>
    )
  }
  if (!order || !user) return <NoAccess />

  const history = historyOf(order)
  const currentPriority = priorityOf(order)
  const canEditPriority =
    (user.role === 'encargado_deposito' || user.role === 'admin') && order.status !== 'entregado'

  async function changePriority(next: OrderPriority) {
    if (!order || next === priorityOf(order)) return
    const accepted = await confirm(
      'Cambiar prioridad',
      `Pasar de ${PRIORITY_LABEL[priorityOf(order)]} a ${PRIORITY_LABEL[next]}.`,
    )
    if (!accepted) return
    setPriorityBusy(true)
    const result = await updateOrder({ ...order, priority: next })
    setPriorityBusy(false)
    if (result.status === 'not-saved') {
      await showError('No se pudo cambiar la prioridad', result.message)
      return
    }
    setOrder(result.order)
    setReloadKey((key) => key + 1)
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="text-sm text-lumi-muted">
          <Link to={user.role === 'chofer' ? '/mis-entregas' : '/pedidos'}>
            {user.role === 'chofer' ? 'Mis entregas' : 'Pedidos'}
          </Link>
          {' · '}
          {order.id}
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="inline-flex flex-wrap items-center gap-2">
              <span>{order.id}</span>
              <PriorityChip order={order} />
            </h1>
            <p className="font-semibold uppercase">{order.client}</p>
          </div>
          <OrderFlowButtons
            order={order}
            role={user.role}
            via="pedidos"
            busy={busy}
            onBusy={setBusy}
            transition={transitionOrder}
            onDone={() => setReloadKey((key) => key + 1)}
          />
        </div>
      </header>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
        <OrderStepper order={order} variant="full" />
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">Datos del pedido</h2>
        <dl className="order-detail-grid mt-3">
          <div>
            <dt>Cliente</dt>
            <dd>{order.client}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{order.phone || '—'}</dd>
          </div>
          <div>
            <dt>Vendedor</dt>
            <dd>{order.seller || '—'}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>
              {order.address || '—'}
              {placeLine(order) ? <span className="block text-lumi-muted">{placeLine(order)}</span> : null}
              {order.zone ? <span className="block text-lumi-muted">{order.zone}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Despacho</dt>
            <dd>{order.dispatchType ? DISPATCH_LABEL[order.dispatchType] : 'Entrega propia'}</dd>
          </div>
          <div>
            <dt>Prioridad</dt>
            <dd>
              {canEditPriority ? (
                <select
                  className="mt-1"
                  value={currentPriority}
                  disabled={priorityBusy || busy}
                  onChange={(event) => {
                    void changePriority(event.target.value as OrderPriority)
                  }}
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABEL[value]}
                    </option>
                  ))}
                </select>
              ) : (
                PRIORITY_LABEL[currentPriority]
              )}
            </dd>
          </div>
          <div>
            <dt>Transportista</dt>
            <dd>{order.transporter || '—'}</dd>
          </div>
          <div>
            <dt>Chofer</dt>
            <dd>{order.driverName || (order.driverId ? 'Chofer asignado' : '—')}</dd>
          </div>
          <div>
            <dt>Franja</dt>
            <dd>{order.timeWindow || '—'}</dd>
          </div>
          <div>
            <dt>Bultos</dt>
            <dd>{order.packages != null ? order.packages : '—'}</dd>
          </div>
          <div>
            <dt>Tracking</dt>
            <dd>{order.trackingNumber || '—'}</dd>
          </div>
          <div>
            <dt>Facturas</dt>
            <dd>{order.invoices && order.invoices.length > 0 ? order.invoices.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>Fecha de entrega</dt>
            <dd>{order.deliveryDate ? formatIsoDate(order.deliveryDate) : '—'}</dd>
          </div>
          <div>
            <dt>Notas</dt>
            <dd>{order.notes?.trim() ? order.notes : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">Historial</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-lumi-muted">Sin movimientos registrados.</p>
        ) : (
          <ol className="order-history mt-3">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="order-history-item">
                <p className="order-history-when">{formatWhen(entry.at)}</p>
                <p className="font-semibold">
                  {statusText(order, entry.from)} → {statusText(order, entry.to)}
                </p>
                <p className="text-sm text-lumi-muted">
                  {entry.by?.name || '—'}
                  {entry.via ? ` · ${VIA_LABEL[entry.via] ?? entry.via}` : ''}
                </p>
                {entry.reason ? <p className="mt-1 text-sm">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

export function PedidoDetalle() {
  const { id = '' } = useParams()
  if (!id) return <NoAccess />
  return <PedidoDetalleView key={id} id={id} />
}
