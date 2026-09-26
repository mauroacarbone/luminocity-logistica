import { useState } from 'react'
import {
  orders,
  ordersByStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  type Order,
  type OrderStatus,
} from '../data/orders'

type View = 'kanban' | 'tabla'

const SUMMARY: { key: 'total' | OrderStatus; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'preparado', label: 'Preparados' },
  { key: 'en-viaje', label: 'En viaje' },
  { key: 'entregado', label: 'Entregados' },
]

function countFor(key: 'total' | OrderStatus) {
  if (key === 'total') return orders.length
  return ordersByStatus(key).length
}

function OrderCard({ order }: { order: Order }) {
  return (
    <article className="order-card">
      <div className="order-card-top">
        <strong>{order.id}</strong>
        <button type="button" className="icon-button" aria-label={`Editar ${order.id}`}>
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
      </div>
      <p className="order-client">{order.client}</p>
      {order.zone && <p className="order-zone">{order.zone}</p>}
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
        {order.deliveryDate}
      </p>
    </article>
  )
}

export function PanelOperativo() {
  const [view, setView] = useState<View>('kanban')

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
            Kanban
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
        {SUMMARY.map((item) => (
          <article key={item.key} className="stat-card">
            <strong>{countFor(item.key)}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>

      {view === 'kanban' ? (
        <div className="board-scroll">
          <div className="kanban">
            {STATUS_ORDER.map((status) => {
              const column = ordersByStatus(status)
              return (
                <section key={status} className="column" aria-label={STATUS_LABEL[status]}>
                  <header className="column-head">
                    <span>{STATUS_LABEL[status]}</span>
                    <span className="count">{column.length}</span>
                  </header>
                  {column.length === 0 ? (
                    <p className="empty">Sin pedidos</p>
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
                <th>Cargado</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>
                    {order.client}
                    {order.zone ? <span className="zone-inline"> · {order.zone}</span> : null}
                  </td>
                  <td>
                    <span className={`status-pill status-${order.status}`}>
                      {STATUS_LABEL[order.status].replace(/s$/, '')}
                    </span>
                  </td>
                  <td>{order.loadedAt}</td>
                  <td>{order.deliveryDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
