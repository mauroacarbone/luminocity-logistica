import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { canEditOrder } from '../lib/access'
import { statusPillFor } from '../lib/orderFlow'
import { placeLine } from '../lib/place'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

type View = 'kanban' | 'tabla'

const SUMMARY: { key: 'total' | OrderStatus; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'preparado', label: 'Preparados' },
  { key: 'asignado', label: 'Asignados' },
  { key: 'en-viaje', label: 'En viaje' },
  { key: 'entregado', label: 'Entregados' },
]

function countFor(list: Order[], key: 'total' | OrderStatus) {
  if (key === 'total') return list.length
  return ordersByStatus(list, key).length
}

function OrderCard({ order }: { order: Order }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder } = useOrders()
  const [busy, setBusy] = useState(false)
  const waiting = pendingEdit(order)

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
      <div className="mt-2">
        <OrderStepper order={order} variant="compact" />
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
            order={order}
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

function TableActions({ order }: { order: Order }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { transitionOrder } = useOrders()
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex flex-col items-start gap-1.5">
      {user && (
        <OrderFlowButtons
          order={order}
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
  const { orders } = useOrders()
  const [view, setView] = useState<View>('kanban')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null)

  function selectSummary(key: 'total' | OrderStatus) {
    if (key === 'total') {
      setStatusFilter(null)
      return
    }
    setStatusFilter((current) => (current === key ? null : key))
  }

  const visibleOrders = statusFilter ? ordersByStatus(orders, statusFilter) : orders
  const columns = statusFilter ? [statusFilter] : STATUS_ORDER

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
            onClick={() => setView('kanban')}
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
            onClick={() => setView('tabla')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M4 10h16M4 15h16M10 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            Tabla
          </button>
        </div>
      </header>

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
              <strong>{countFor(orders, item.key)}</strong>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {view === 'kanban' ? (
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
                        <OrderCard key={order.id} order={order} />
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
                      <TableActions order={order} />
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
