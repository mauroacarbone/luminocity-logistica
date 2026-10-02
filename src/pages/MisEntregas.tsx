import { useState } from 'react'
import { STATUS_PILL, type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { mapsLink, onTheWayText, whatsappLink } from '../lib/whatsapp'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

type Tab = 'asignados' | 'en-viaje'

function byZoneThenAddress(left: Order, right: Order) {
  // El orden por cercanía real va con el GPS en el 16b.
  const zone = (left.zone ?? '').localeCompare(right.zone ?? '', 'es')
  if (zone !== 0) return zone
  return (left.address ?? '').localeCompare(right.address ?? '', 'es')
}

export function MisEntregas() {
  const { user } = useAuth()
  const { orders, patchFields } = useOrders()
  const [tab, setTab] = useState<Tab>('asignados')
  const [busy, setBusy] = useState('')

  if (!user?.carrierName?.trim()) {
    return (
      <section className="page">
        <header className="page-header">
          <h1>Mis entregas</h1>
        </header>
        <p className="mt-6 text-base font-semibold">Tu usuario no está vinculado a un transportista</p>
      </section>
    )
  }

  const assigned = orders
    .filter((order) => order.status === 'preparado' || order.status === 'asignado')
    .sort(byZoneThenAddress)
  const traveling = orders.filter((order) => order.status === 'en-viaje').sort(byZoneThenAddress)
  const visible = tab === 'asignados' ? assigned : traveling

  async function changeStatus(order: Order, status: 'en-viaje' | 'entregado') {
    const leaving = status === 'en-viaje'
    const accepted = await confirm(
      leaving ? 'Salir a reparto' : 'Entregado',
      leaving
        ? `El pedido ${order.id} pasa a en viaje.`
        : `El pedido ${order.id} queda entregado.`,
    )
    if (!accepted) return
    setBusy(order.id)
    const result = await patchFields(order.id, { status })
    setBusy('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return
    }
    if (leaving) setTab('en-viaje')
    await success(leaving ? 'Pedido en viaje' : 'Pedido entregado')
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Mis entregas</h1>
        <p>{user.carrierName}</p>
      </header>
      <div className="view-toggle mt-4" role="tablist" aria-label="Entregas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'asignados'}
          className={tab === 'asignados' ? 'active' : undefined}
          onClick={() => setTab('asignados')}
        >
          Asignados
          <span>{assigned.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'en-viaje'}
          className={tab === 'en-viaje' ? 'active' : undefined}
          onClick={() => setTab('en-viaje')}
        >
          En viaje
          <span>{traveling.length}</span>
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
          No hay entregas.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((order) => (
            <li key={order.id}>
              <DeliveryCard
                order={order}
                busy={busy === order.id}
                onLeave={() => void changeStatus(order, 'en-viaje')}
                onDelivered={() => void changeStatus(order, 'entregado')}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DeliveryCard({
  order,
  busy,
  onLeave,
  onDelivered,
}: {
  order: Order
  busy: boolean
  onLeave: () => void
  onDelivered: () => void
}) {
  const maps = mapsLink(order.address ?? '')
  const notice = whatsappLink(order.phone ?? '', onTheWayText(order.client, order.id))
  const waiting = order.status === 'preparado'
  const canLeave = order.status === 'asignado'
  const canDeliver = order.status === 'en-viaje'

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-lg font-bold">{order.id}</p>
        <span className={`status-pill status-${order.status}`}>{STATUS_PILL[order.status]}</span>
      </div>
      <p className="mt-1 text-base font-semibold">{order.client}</p>
      <p className="mt-2 text-sm">{order.address || 'Sin dirección'}</p>
      <p className="text-sm text-lumi-muted">{order.zone || 'Sin zona'}</p>
      <p className="mt-2 text-sm">Bultos: {order.packages ?? '—'}</p>
      <p className="text-sm">Teléfono: {order.phone || '—'}</p>
      {waiting ? (
        <p className="mt-4 text-sm font-semibold">Esperando asignación del encargado</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {maps ? (
            <a
              className="grid min-h-12 place-items-center rounded-xl bg-lumi-ink px-4 text-base font-semibold text-white"
              href={maps}
              target="_blank"
              rel="noreferrer"
            >
              Cómo llegar
            </a>
          ) : (
            <button type="button" className="min-h-12 rounded-xl bg-lumi-line px-4 text-base font-semibold" disabled>
              Cómo llegar
            </button>
          )}
          {canLeave && (
            <button
              type="button"
              className="min-h-12 rounded-xl bg-lumi-yellow px-4 text-base font-semibold text-lumi-yellow-ink disabled:opacity-50"
              disabled={busy}
              onClick={onLeave}
            >
              Salir a reparto
            </button>
          )}
          {order.status === 'en-viaje' &&
            (notice ? (
              <a
                className="grid min-h-12 place-items-center rounded-xl border border-lumi-line px-4 text-base font-semibold"
                href={notice}
                target="_blank"
                rel="noreferrer"
              >
                Avisar al cliente
              </a>
            ) : (
              <button type="button" className="min-h-12 rounded-xl border border-lumi-line px-4 text-base font-semibold" disabled>
                Avisar al cliente
              </button>
            ))}
          {canDeliver && (
            <button
              type="button"
              className="min-h-12 rounded-xl bg-[#1d7a3a] px-4 text-base font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={onDelivered}
            >
              Entregado
            </button>
          )}
        </div>
      )}
    </article>
  )
}
