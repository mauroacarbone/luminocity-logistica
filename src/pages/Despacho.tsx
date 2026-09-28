import { useEffect, useState } from 'react'
import { OrderAttachmentLink } from '../components/OrderAttachmentLink'
import { withExtras } from '../data/catalog'
import {
  type Order,
  type OrderStatus,
} from '../data/orders'
import {
  DAY_LONG,
  MONTH_SHORT,
  formatDayLabel,
  toIso,
  weekDays,
  weekOffsetForIso,
} from '../lib/week'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'

type DispatchTab = 'pendiente' | 'preparado' | 'viaje' | 'entregado'
type DialogKind = 'caratula' | 'entrega'

const TABS: { id: DispatchTab; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'preparado', label: 'Preparados' },
  { id: 'viaje', label: 'En viaje / Asignados' },
  { id: 'entregado', label: 'Entregados' },
]

const STATUS_CHOICES: { status: OrderStatus; label: string }[] = [
  { status: 'pendiente', label: 'Pendiente' },
  { status: 'preparado', label: 'Preparado' },
  { status: 'asignado', label: 'Asignado' },
  { status: 'en-viaje', label: 'En viaje' },
  { status: 'entregado', label: 'Entregado' },
]

const BADGE: Record<OrderStatus, string> = {
  pendiente: 'bg-[#fff4cc] text-lumi-ink',
  preparado: 'bg-[#e7f0ff] text-[#2458a6]',
  asignado: 'bg-[#efe8ff] text-[#5b3d99]',
  'en-viaje': 'bg-[#ffe8cc] text-[#9a4d00]',
  entregado: 'bg-[#e5f6ea] text-[#1d7a3a]',
}

function matchesTab(order: Order, tab: DispatchTab) {
  if (tab === 'viaje') return order.status === 'asignado' || order.status === 'en-viaje'
  return order.status === tab
}

function tabFor(status: OrderStatus): DispatchTab {
  if (status === 'asignado' || status === 'en-viaje') return 'viaje'
  return status
}

function addressLine(order: Order) {
  const between = [order.betweenStreet1, order.betweenStreet2].filter(Boolean)
  if (!order.address) return between.join(' y ')
  if (between.length === 0) return order.address
  return `${order.address} · entre ${between.join(' y ')}`
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function findOrder(orders: Order[], raw: string) {
  const code = normalize(raw)
  if (code.length < 3) return undefined
  const exact = orders.find((order) => normalize(order.id) === code)
  if (exact) return exact
  return orders.find((order) =>
    order.invoices?.some((invoice) => normalize(invoice).includes(code)),
  )
}

function CodeDialog({
  title,
  hint,
  confirmLabel,
  error,
  onClose,
  onSubmit,
}: {
  title: string
  hint: string
  confirmLabel: string
  error: string
  onClose: () => void
  onSubmit: (code: string) => void
}) {
  const [code, setCode] = useState('')

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
      <form
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(code)
        }}
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-lumi-muted">{hint}</p>
        <label className="mt-4 block text-sm font-medium">
          N° de pedido o factura
          <input
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="P-1234567"
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
          />
        </label>
        {error && <p className="mt-2 text-sm text-lumi-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm text-lumi-muted hover:bg-[#f7f4ea]"
            onClick={onClose}
          >
            Cerrar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Despacho() {
  const { orders, updateOrder } = useOrders()
  const { transporters: catalogTransporters } = useCatalog()
  const [tab, setTab] = useState<DispatchTab>('viaje')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => toIso(new Date()))
  const [query, setQuery] = useState('')
  const [transporter, setTransporter] = useState('todos')
  const [openStatusId, setOpenStatusId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [notice, setNotice] = useState('')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const days = weekDays(weekOffset)
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const searching = query.trim().length > 0

  const transporters = withExtras(
    catalogTransporters,
    orders.map((order) => order.transporter),
  )

  function inScope(order: Order) {
    if (!matchesTab(order, tab)) return false
    if (transporter !== 'todos' && order.transporter !== transporter) return false
    return true
  }

  function matchesQuery(order: Order) {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const haystack = [order.id, order.client, ...(order.invoices ?? [])].join(' ').toLowerCase()
    return haystack.includes(needle)
  }

  const scoped = orders.filter(inScope)
  const dayOrders = searching
    ? scoped.filter(matchesQuery)
    : scoped.filter(
        (order) => order.deliveryDate === toIso(selectedDate) && matchesQuery(order),
      )

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = toIso(new Date())
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
  }

  function focusOrder(order: Order) {
    setTab(tabFor(order.status))
    setWeekOffset(weekOffsetForIso(order.deliveryDate))
    setSelectedIso(order.deliveryDate)
    setQuery('')
    setHighlightId(order.id)
    setOpenStatusId(null)
  }

  function changeStatus(order: Order, status: OrderStatus) {
    updateOrder({ ...order, status })
    setOpenStatusId(null)
  }

  function submitCode(code: string) {
    const order = findOrder(orders, code)
    if (!order) {
      setDialogError('No encontré un pedido con ese código.')
      return
    }
    if (dialog === 'entrega') {
      if (order.status === 'entregado') {
        setDialogError('Ese pedido ya está entregado.')
        return
      }
      updateOrder({ ...order, status: 'entregado' })
      focusOrder({ ...order, status: 'entregado' })
      setNotice(`Entrega confirmada: ${order.id}`)
    } else {
      focusOrder(order)
      setNotice(`Pedido encontrado: ${order.id}`)
    }
    setDialog(null)
    setDialogError('')
  }

  useEffect(() => {
    if (!highlightId) return
    document.getElementById(`order-${highlightId}`)?.scrollIntoView({ block: 'nearest' })
  }, [highlightId, tab, selectedIso, dayOrders.length])

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  return (
    <section className="page">
      <header className="page-header row">
        <div>
          <h1>Despacho</h1>
          <p>Seguimiento de pedidos en viaje y entregados</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-lumi-yellow px-4 py-2.5 text-sm font-semibold text-lumi-yellow-ink"
          onClick={() => {
            setDialogError('')
            setDialog('entrega')
          }}
        >
          Escanear QR y confirmar entrega
        </button>
      </header>

      {notice && (
        <p className="mt-4 rounded-xl bg-[#e5f6ea] px-4 py-2 text-sm text-[#1d7a3a]">{notice}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-lumi-line">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`border-b-2 px-3 py-2 text-sm ${
                active
                  ? 'border-lumi-yellow font-semibold text-lumi-ink'
                  : 'border-transparent text-lumi-muted'
              }`}
              onClick={() => {
                setTab(item.id)
                setOpenStatusId(null)
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 items-center gap-2">
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
          const count = scoped.filter((order) => order.deliveryDate === iso).length
          const selected = !searching && iso === toIso(selectedDate)
          return (
            <button
              key={iso}
              type="button"
              className={`flex min-w-0 flex-col items-center gap-1 border-b-2 px-0.5 py-2 text-xs sm:text-sm ${
                selected
                  ? 'border-lumi-yellow font-semibold text-lumi-ink'
                  : 'border-transparent text-lumi-muted'
              }`}
              onClick={() => {
                setSelectedIso(iso)
                setQuery('')
              }}
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="shrink-0 rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
          onClick={() => {
            setDialogError('')
            setDialog('caratula')
          }}
        >
          Escanear QR carátula
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en todos los días — cliente, factura o N° pedido..."
          className="min-w-0 flex-1 rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
        />
        <select
          value={transporter}
          onChange={(event) => setTransporter(event.target.value)}
          aria-label="Transportista"
          className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
        >
          <option value="todos">Todos los transportistas</option>
          {transporters.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">
          {searching ? 'Resultados' : DAY_LONG[selectedDate.getDay()]}
        </h2>
        <p className="text-sm text-lumi-muted">
          {dayOrders.length} pedido{dayOrders.length === 1 ? '' : 's'}
        </p>
      </div>

      {dayOrders.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-lumi-muted shadow-sm">
          {searching ? 'Ningún pedido coincide con la búsqueda.' : 'Sin pedidos para este día.'}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {dayOrders.map((order) => (
            <article
              key={order.id}
              id={`order-${order.id}`}
              className={`rounded-2xl bg-white p-4 shadow-sm ${
                highlightId === order.id ? 'ring-2 ring-lumi-yellow' : ''
              } ${openStatusId === order.id ? 'relative z-20' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong>{order.id}</strong>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[order.status]}`}
                    >
                      {STATUS_CHOICES.find((item) => item.status === order.status)?.label}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold uppercase">{order.client}</p>
                  {addressLine(order) && (
                    <p className="mt-1 text-sm text-lumi-muted">{addressLine(order)}</p>
                  )}
                  <div className="mt-3 flex flex-col gap-1 text-sm text-[#5f5b55]">
                    {order.zone && <p>Zona: {order.zone}</p>}
                    {order.transporter && <p>Transportista: {order.transporter}</p>}
                    <p>Bultos: {order.packages != null ? order.packages : 'a definir'}</p>
                    {order.timeWindow && <p>{order.timeWindow}</p>}
                    {order.invoices && order.invoices.length > 0 && (
                      <p>{order.invoices.join(', ')}</p>
                    )}
                    {searching && <p>Entrega: {order.deliveryDate}</p>}
                    <OrderAttachmentLink name={order.attachmentName} dataUrl={order.attachmentDataUrl} />
                  </div>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm hover:bg-[#f7f4ea]"
                    aria-expanded={openStatusId === order.id}
                    aria-haspopup="menu"
                    onClick={() =>
                      setOpenStatusId((current) => (current === order.id ? null : order.id))
                    }
                  >
                    Estado
                  </button>
                  {openStatusId === order.id && (
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-lumi-line bg-white p-1 shadow-lg"
                    >
                      {STATUS_CHOICES.map((choice) => (
                        <button
                          key={choice.status}
                          type="button"
                          role="menuitem"
                          className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea] ${
                            order.status === choice.status ? 'font-semibold' : ''
                          }`}
                          onClick={() => changeStatus(order, choice.status)}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {openStatusId && (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Cerrar menú de estado"
          onClick={() => setOpenStatusId(null)}
        />
      )}

      {dialog && (
        <CodeDialog
          title={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar carátula'}
          hint="Pegá el N° de pedido o la factura que figura en el QR."
          confirmLabel={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar'}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={submitCode}
        />
      )}
    </section>
  )
}
