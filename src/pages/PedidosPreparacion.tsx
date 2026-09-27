import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Order } from '../data/orders'
import {
  DAY_LONG,
  MONTH_SHORT,
  formatDayLabel,
  toIso,
  weekDays,
} from '../lib/week'
import { useOrders } from '../state/OrdersContext'

function addressLine(order: Order) {
  const between = [order.betweenStreet1, order.betweenStreet2].filter(Boolean)
  if (!order.address) return between.join(' y ')
  if (between.length === 0) return order.address
  return `${order.address} · entre ${between.join(' y ')}`
}

export function PedidosPreparacion() {
  const navigate = useNavigate()
  const { orders, removeOrder } = useOrders()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => toIso(new Date()))
  const days = weekDays(weekOffset)
  const pending = orders.filter((order) => order.status === 'pendiente')
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const dayOrders = pending.filter((order) => order.deliveryDate === toIso(selectedDate))

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = toIso(new Date())
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
  }

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  return (
    <section className="page">
      <header className="page-header">
        <h1>Pedidos y Preparación</h1>
        <p>Pedidos de la semana, listos para preparar y editar.</p>
      </header>

      <div className="mt-6 grid grid-cols-3 items-center gap-2">
        <button
          type="button"
          className="justify-self-start rounded-xl px-3 py-2 text-sm text-lumi-ink hover:bg-white"
          onClick={() => showWeek(weekOffset - 1)}
        >
          ‹ Sem. anterior
        </button>
        <p className="text-center font-semibold">{weekTitle}</p>
        <button
          type="button"
          className="justify-self-end rounded-xl px-3 py-2 text-sm text-lumi-ink hover:bg-white"
          onClick={() => showWeek(weekOffset + 1)}
        >
          Sem. siguiente ›
        </button>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = toIso(day)
          const count = pending.filter((order) => order.deliveryDate === iso).length
          const selected = iso === toIso(selectedDate)
          return (
            <button
              key={iso}
              type="button"
              className={`flex min-w-0 flex-col items-center gap-1 border-b-2 px-0.5 py-2 text-xs sm:text-sm ${
                selected
                  ? 'border-lumi-yellow font-semibold text-lumi-ink'
                  : 'border-transparent text-lumi-muted'
              }`}
              onClick={() => setSelectedIso(iso)}
            >
              <span className="truncate">{formatDayLabel(day)}</span>
              <span
                className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                  selected ? 'bg-lumi-yellow text-lumi-yellow-ink' : 'bg-white text-lumi-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">{DAY_LONG[selectedDate.getDay()]}</h2>
        <p className="text-sm text-lumi-muted">
          {dayOrders.length} pedido{dayOrders.length === 1 ? '' : 's'}
        </p>
      </div>

      {dayOrders.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-lumi-muted shadow-sm">
          Sin pedidos para este día.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {dayOrders.map((order) => (
            <article key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong>{order.id}</strong>
                    <span className="rounded-full bg-[#fff4cc] px-2 py-0.5 text-xs font-medium">
                      Pendiente
                    </span>
                  </div>
                  <p className="mt-2 font-semibold uppercase">{order.client}</p>
                  {addressLine(order) && (
                    <p className="mt-1 text-sm text-lumi-muted">{addressLine(order)}</p>
                  )}
                  <div className="mt-3 flex flex-col gap-1 text-sm text-[#5f5b55]">
                    {order.transporter && <p>Transportista: {order.transporter}</p>}
                    {order.timeWindow && <p>{order.timeWindow}</p>}
                    {order.invoices && order.invoices.length > 0 && (
                      <p>{order.invoices.join(', ')}</p>
                    )}
                    {order.seller && <p>{order.seller}</p>}
                    <p>Bultos: a definir</p>
                    <p>Cargado: {order.loadedAt}</p>
                  </div>
                  {order.notes && (
                    <p className="mt-3 rounded-xl bg-[#f7f4ea] px-3 py-2 text-sm">{order.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    type="button"
                    className="text-sm text-lumi-ink hover:underline"
                    onClick={() =>
                      navigate('/nuevo-pedido', { state: { orderId: order.id } })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-sm text-lumi-danger hover:underline"
                    onClick={() => removeOrder(order.id)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
