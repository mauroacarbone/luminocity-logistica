import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrderAttachmentLink } from '../components/OrderAttachmentLink'
import { QrCoverDialog } from '../components/QrCoverDialog'
import { QrScanDialog } from '../components/QrScanDialog'
import { DISPATCH_LABEL, listForDispatch, withCurrent, withExtras } from '../data/catalog'
import {
  pendingEdit,
  type Order,
  type OrderStatus,
} from '../data/orders'
import {
  DAY_LONG,
  DAY_SHORT,
  MONTH_SHORT,
  formatDayLabel,
  formatIsoDate,
  toIso,
  weekDays,
  weekOffsetForIso,
} from '../lib/week'
import { askReason, confirm, error, success } from '../lib/alerts'
import { canAssignDispatch, canConfirmDelivery, canEditOrder, statusChoices } from '../lib/access'
import { STATUS_RANK, statusPillFor } from '../lib/orderFlow'
import { placeLine } from '../lib/place'
import { driverSlotCount, normalizeTimeWindow, SLOT_LIMIT, slotQuestion } from '../lib/slot'
import { isSession } from '../lib/authStore'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { clockTime, leftAgo, slotEnded } from '../lib/schedule'
import { listUsers } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'

type DispatchTab = 'pendiente' | 'preparado' | 'asignado' | 'en-viaje' | 'entregado'
type DialogKind = 'caratula' | 'entrega'

const TABS: { id: DispatchTab; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'preparado', label: 'Preparados' },
  { id: 'asignado', label: 'Esperando salida' },
  { id: 'en-viaje', label: 'En viaje' },
  { id: 'entregado', label: 'Entregados' },
]

function matchesTab(order: Order, tab: DispatchTab) {
  return order.status === tab
}

function statusPrompt(id: string, status: OrderStatus, order?: Order) {
  if (status === 'preparado') {
    return { title: 'Marcar preparado', text: `El pedido ${id} pasa a preparado.`, done: 'Pedido preparado', peligro: false }
  }
  if (status === 'asignado' && order?.dispatchType === 'correo') {
    return {
      title: 'Despachar',
      text: `El pedido ${id} queda despachado.`,
      done: 'Pedido despachado',
      peligro: false,
    }
  }
  if (status === 'en-viaje') {
    return { title: 'Salir a reparto', text: `El pedido ${id} sale a reparto.`, done: 'Pedido en viaje', peligro: false }
  }
  if (status === 'entregado') {
    return { title: 'Entregado', text: `El pedido ${id} queda entregado.`, done: 'Pedido entregado', peligro: false }
  }
  return {
    title: 'Cambiar estado',
    text: `El pedido ${id} pasa a ${statusPillFor(order ?? { dispatchType: undefined }, status).toLowerCase()}.`,
    done: 'Estado actualizado',
    peligro: false,
  }
}

function SlotUsage({ orders, order }: { orders: Order[]; order: Order }) {
  if (!order.driverId || !normalizeTimeWindow(order.timeWindow)) return null
  const count = driverSlotCount(orders, order.driverId, order.deliveryDate, order.timeWindow)
  const full = count >= SLOT_LIMIT
  return (
    <p className={`text-xs ${full ? 'text-lumi-danger' : 'text-lumi-muted'}`}>
      Cupo en la franja: {count}/{SLOT_LIMIT}
    </p>
  )
}

function DriverChoice({
  orders,
  order,
  driverId,
  name,
}: {
  orders: Order[]
  order: Order
  driverId: string
  name: string
}) {
  const count = driverSlotCount(orders, driverId, order.deliveryDate, order.timeWindow)
  const full = Boolean(order.timeWindow) && count >= SLOT_LIMIT
  return (
    <option
      value={driverId}
      className={full ? 'text-lumi-danger' : undefined}
      style={full ? { color: '#e25b57' } : undefined}
    >
      {order.timeWindow ? `${name} (${count}/${SLOT_LIMIT})` : name}
    </option>
  )
}

function choferOptions(
  drivers: { id: string; name: string; active: boolean }[],
  order: Order,
) {
  const current = drivers.find((driver) => driver.id === order.driverId)
  const active = drivers.filter((driver) => driver.active)
  if (!normalizeTimeWindow(order.timeWindow)) return current ? [current] : []
  if (current && !current.active) return [...active, current]
  return active
}

function tabFor(status: OrderStatus): DispatchTab {
  return status
}

function sheetProgress(order: Order, sheets: RouteSheet[], orders: Order[]) {
  const sheet = sheets.find((item) => item.orderIds.includes(order.id))
  if (!sheet) return ''
  const delivered = sheet.orderIds.filter((id) => orders.find((item) => item.id === id)?.status === 'entregado').length
  return `${delivered} de ${sheet.orderIds.length} entregados`
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

export function Despacho() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { orders, patchFields, transitionOrder } = useOrders()
  const { transporters: catalogTransporters, ownTransporters, courierTransporters } = useCatalog()
  const [drivers, setDrivers] = useState<{ id: string; name: string; active: boolean }[]>([])
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [tab, setTab] = useState<DispatchTab>('en-viaje')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => toIso(new Date()))
  const [query, setQuery] = useState('')
  const [transporter, setTransporter] = useState('todos')
  const [openStatusId, setOpenStatusId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [coverId, setCoverId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const assign = Boolean(user && canAssignDispatch(user.role))
  const confirmDelivery = Boolean(user && canConfirmDelivery(user.role))

  useEffect(() => {
    if (!assign) return
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        return
      }
      if (!Array.isArray(result.data)) return
      setDrivers(
        result.data.filter(isSession).flatMap((item) =>
          item.role === 'chofer' ? [{ id: item.id, name: item.name, active: item.active }] : [],
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [assign, logout])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

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

  useEffect(() => {
    let cancelled = false
    async function loadSheets() {
      if (searching) {
        const needle = query.trim().toLowerCase()
        const matches = orders.filter((order) => {
          if (!matchesTab(order, tab)) return false
          if (transporter !== 'todos' && order.transporter !== transporter) return false
          if (order.id.toLowerCase().includes(needle)) return true
          if (order.client.toLowerCase().includes(needle)) return true
          return order.invoices?.some((invoice) => invoice.toLowerCase().includes(needle)) ?? false
        })
        const dates = [...new Set(matches.map((order) => order.deliveryDate).filter(Boolean))]
        if (dates.length === 0) {
          if (!cancelled) setSheets([])
          return
        }
        const results = await Promise.all(dates.map((date) => listRouteSheets(date)))
        if (cancelled) return
        const merged: RouteSheet[] = []
        for (const result of results) {
          if (!result.ok) continue
          for (const sheet of result.data) {
            if (!merged.some((item) => item.id === sheet.id)) merged.push(sheet)
          }
        }
        setSheets(merged)
        return
      }
      const result = await listRouteSheets(selectedIso)
      if (cancelled || !result.ok) return
      setSheets(result.data)
    }
    void loadSheets()
    return () => {
      cancelled = true
    }
  }, [selectedIso, orders, searching, query, tab, transporter])

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

  async function assignTransporter(order: Order, next: string) {
    const name = next.trim()
    const accepted = await confirm(
      name ? 'Asignar transportista' : 'Quitar transportista',
      name ? `El pedido ${order.id} queda con ${name}.` : `El pedido ${order.id} queda sin transportista.`,
    )
    if (!accepted) return false
    setBusyId(order.id)
    const result = await patchFields(order.id, { transporter: name || null })
    setBusyId('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    await success(name ? 'Transportista asignado' : 'Transportista quitado')
    return true
  }

  function driverName(driverId: string) {
    return drivers.find((driver) => driver.id === driverId)?.name ?? 'el chofer'
  }

  async function assignDriver(order: Order, driverId: string) {
    const assigns = Boolean(driverId) && order.status === 'preparado'
    const reassigns = Boolean(driverId) && Boolean(order.driverId) && order.driverId !== driverId
    const clears = !driverId && Boolean(order.driverId) && order.status === 'asignado'
    if (reassigns) {
      const accepted = await confirm(
        'Reasignar chofer',
        `El pedido ${order.id} pasa de ${driverName(order.driverId ?? '')} a ${driverName(driverId)}.`,
      )
      if (!accepted) return false
    } else if (assigns) {
      const accepted = await confirm(
        'Asignar chofer',
        `El pedido ${order.id} pasa a asignado con ${driverName(driverId)}.`,
      )
      if (!accepted) return false
    } else if (clears) {
      const reason = await askReason('Quitar chofer', `El pedido ${order.id} vuelve a preparado.`)
      if (!reason) return false
      return saveClearDriver(order, reason)
    } else if (!driverId && Boolean(order.driverId)) {
      const accepted = await confirm('Quitar chofer', `El pedido ${order.id} queda sin chofer.`)
      if (!accepted) return false
    }
    return saveDriver(order, driverId, assigns)
  }

  async function saveClearDriver(order: Order, reason: string) {
    setBusyId(order.id)
    const result = await transitionOrder(order.id, {
      to: 'preparado',
      reason,
      via: 'despacho',
    })
    setBusyId('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    await success('Chofer quitado')
    return true
  }

  async function saveDriver(order: Order, driverId: string, assigns: boolean, override = false) {
    setBusyId(order.id)
    if (assigns) {
      const fields: Record<string, unknown> = {
        to: 'asignado',
        driverId,
        via: 'despacho',
      }
      if (override) fields.override = true
      const result = await transitionOrder(order.id, fields)
      setBusyId('')
      if (result.status === 'not-saved' && result.code === 'FRANJA_LLENA' && result.slot && !override) {
        if (user && (user.role === 'encargado_deposito' || user.role === 'admin')) {
          const accepted = await confirm(
            'Franja llena',
            slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
          )
          if (!accepted) return false
          return saveDriver(order, driverId, assigns, true)
        }
        await error(result.message)
        return false
      }
      if (result.status === 'not-saved') {
        await error(result.message)
        return false
      }
      await success('Chofer asignado')
      return true
    }
    const fields: Record<string, unknown> = { driverId: driverId || null }
    if (override) fields.override = true
    const result = await patchFields(order.id, fields)
    setBusyId('')
    if (result.status === 'not-saved' && result.code === 'FRANJA_LLENA' && result.slot && !override) {
      if (user && (user.role === 'encargado_deposito' || user.role === 'admin')) {
        const accepted = await confirm(
          'Franja llena',
          slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
        )
        if (!accepted) return false
        return saveDriver(order, driverId, assigns, true)
      }
      await error(result.message)
      return false
    }
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    return true
  }

  async function changeStatus(order: Order, status: OrderStatus) {
    setOpenStatusId(null)
    const prompt = statusPrompt(order.id, status, order)
    if (
      status === 'asignado' &&
      order.dispatchType !== 'correo' &&
      !order.driverId
    ) {
      await error('Elegí un chofer para asignar el pedido.')
      return
    }
    const goingBack = STATUS_RANK[status] < STATUS_RANK[order.status]
    let reason: string | undefined
    let trackingNumber: string | undefined
    let packages: number | undefined
    if (goingBack) {
      const typed = await askReason(prompt.title, prompt.text)
      if (!typed) return
      reason = typed
    } else {
      const accepted = await confirm(prompt.title, prompt.text, { peligro: prompt.peligro })
      if (!accepted) return
      if (status === 'preparado') {
        const raw = window.prompt('Cantidad de bultos')
        if (raw === null) return
        const value = Number(raw.trim())
        if (!Number.isInteger(value) || value < 1) {
          await error('Ingresá una cantidad entera de bultos (1 o más).')
          return
        }
        packages = value
      }
      if (status === 'asignado' && order.dispatchType === 'correo') {
        const tracking = window.prompt('Tracking (opcional)')
        if (tracking === null) return
        trackingNumber = tracking.trim()
      }
    }
    setBusyId(order.id)
    const body: Record<string, unknown> = { to: status, via: 'despacho' }
    if (reason) body.reason = reason
    if (packages != null) body.packages = packages
    if (trackingNumber) body.trackingNumber = trackingNumber
    if (status === 'asignado' && order.driverId) body.driverId = order.driverId
    const result = await transitionOrder(order.id, body)
    setBusyId('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return
    }
    await success(prompt.done)
  }

  async function submitCode(code: string) {
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
      const accepted = await confirm('Entregado', `El pedido ${order.id} queda entregado.`)
      if (!accepted) return
      setScanBusy(true)
      const result = await transitionOrder(order.id, { to: 'entregado', via: 'qr' })
      setScanBusy(false)
      if (result.status === 'not-saved') {
        await error(result.message)
        return
      }
      focusOrder(result.order)
      setNotice(`Entrega confirmada: ${result.order.id}`)
      setDialog(null)
      await success('Pedido entregado')
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

  const coverOrder = coverId ? orders.find((order) => order.id === coverId) : undefined

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
        {confirmDelivery && (
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
        )}
      </header>

      {notice && (
        <p className="mt-4 rounded-xl bg-[#e5f6ea] px-4 py-2 text-sm text-[#1d7a3a]">{notice}</p>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-lumi-line">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
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
          className="justify-self-start rounded-xl px-2 py-2 text-sm text-lumi-ink hover:bg-white sm:px-3"
          onClick={() => showWeek(weekOffset - 1)}
        >
          <span className="sm:hidden">‹</span>
          <span className="hidden sm:inline">‹ Sem. anterior</span>
        </button>
        <p className="text-center text-sm font-semibold sm:text-base">{weekTitle}</p>
        <button
          type="button"
          className="justify-self-end rounded-xl px-2 py-2 text-sm text-lumi-ink hover:bg-white sm:px-3"
          onClick={() => showWeek(weekOffset + 1)}
        >
          <span className="sm:hidden">›</span>
          <span className="hidden sm:inline">Sem. siguiente ›</span>
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
              <span className="truncate sm:hidden">{DAY_SHORT[day.getDay()]}</span>
              <span className="hidden truncate sm:inline">{formatDayLabel(day)}</span>
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
          {searching ? 'Ningún pedido coincide con la búsqueda.' : 'No hay pedidos.'}
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong>{order.id}</strong>
                    <span className={`status-pill status-${order.status}`}>
                      {statusPillFor(order, order.status)}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold uppercase">{order.client}</p>
                  {addressLine(order) && (
                    <p className="mt-1 text-sm text-lumi-muted">{addressLine(order)}</p>
                  )}
                  {placeLine(order) && (
                    <p className="mt-1 text-sm text-lumi-muted">{placeLine(order)}</p>
                  )}
                  <div className="mt-3 flex flex-col gap-1 text-sm text-[#5f5b55]">
                    {order.zone && <p>Zona: {order.zone}</p>}
                    {order.dispatchType && <p>Despacho: {DISPATCH_LABEL[order.dispatchType]}</p>}
                    {order.transporter && <p>Transportista: {order.transporter}</p>}
                    {pendingEdit(order) && <p>Esperando confirmación</p>}
                    <p>Bultos: {order.packages != null ? order.packages : 'a definir'}</p>
                    {order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}
                    {order.timeWindow && <p>{order.timeWindow}</p>}
                    {order.status === 'en-viaje' &&
                      (leftAgo(order.departedAt, now) || sheetProgress(order, sheets, orders)) && (
                      <p>
                        {[leftAgo(order.departedAt, now), sheetProgress(order, sheets, orders)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {(order.status === 'asignado' || order.status === 'en-viaje') &&
                      slotEnded(order.deliveryDate, order.timeWindow, now) && (
                      <p className="font-semibold text-lumi-danger">Atrasado</p>
                    )}
                    {order.status === 'entregado' && order.deliveredAt && <p>Entregado {clockTime(order.deliveredAt)}</p>}
                    {order.invoices && order.invoices.length > 0 && (
                      <p>{order.invoices.join(', ')}</p>
                    )}
                    {searching && <p>Entrega: {formatIsoDate(order.deliveryDate)}</p>}
                    <OrderAttachmentLink name={order.attachmentName} dataUrl={order.attachmentDataUrl} />
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-56 sm:shrink-0 sm:items-end">
                  {assign && (
                    <>
                      <label className="text-xs text-lumi-muted">
                        Transportista
                        <select
                          value={order.transporter ?? ''}
                          disabled={busyId === order.id}
                          className="mt-1 block w-full rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm text-lumi-ink disabled:opacity-50 sm:max-w-44"
                          onChange={(event) => {
                            const select = event.target
                            const next = select.value
                            const previous = order.transporter ?? ''
                            void assignTransporter(order, next).then((saved) => {
                              if (!saved) select.value = previous
                            })
                          }}
                        >
                          <option value="">Sin transportista</option>
                          {withCurrent(
                            listForDispatch(order.dispatchType ?? 'propia', {
                              ownTransporters,
                              courierTransporters,
                            }),
                            order.transporter,
                          ).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {order.dispatchType !== 'correo' && (
                      <div className="text-xs text-lumi-muted">
                        <label htmlFor={`chofer-${order.id}`}>Chofer</label>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {order.status === 'pendiente' ? (
                            <select
                              id={`chofer-${order.id}`}
                              value=""
                              disabled
                              className="block w-full rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm text-lumi-ink disabled:opacity-50 sm:max-w-44"
                            >
                              <option value="">Primero marcá preparado</option>
                            </select>
                          ) : order.status === 'en-viaje' || order.status === 'entregado' ? (
                            <select
                              id={`chofer-${order.id}`}
                              value={order.driverId ?? ''}
                              disabled
                              className="block w-full rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm text-lumi-ink disabled:opacity-50 sm:max-w-44"
                            >
                              <option value={order.driverId ?? ''}>
                                {order.driverId
                                  ? drivers.find((driver) => driver.id === order.driverId)?.name ??
                                    order.driverId
                                  : 'Sin chofer'}
                              </option>
                            </select>
                          ) : !normalizeTimeWindow(order.timeWindow) && !order.driverId ? (
                            <select
                              id={`chofer-${order.id}`}
                              value=""
                              disabled
                              className="block w-full rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm text-lumi-ink disabled:opacity-50 sm:max-w-44"
                            >
                              <option value="">Asigná una franja primero</option>
                            </select>
                          ) : (
                            <select
                              id={`chofer-${order.id}`}
                              value={order.driverId ?? ''}
                              disabled={busyId === order.id}
                              aria-describedby={
                                !normalizeTimeWindow(order.timeWindow) && order.driverId
                                  ? `franja-${order.id}`
                                  : undefined
                              }
                              className="block min-w-0 flex-1 rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm text-lumi-ink disabled:opacity-50 sm:max-w-44"
                              onChange={(event) => {
                                const select = event.target
                                const driverId = select.value
                                const previous = order.driverId ?? ''
                                void assignDriver(order, driverId).then((saved) => {
                                  if (!saved) select.value = previous
                                })
                              }}
                            >
                              <option value="">Sin chofer</option>
                              {choferOptions(drivers, order).map((driver) => (
                                <DriverChoice
                                  key={driver.id}
                                  orders={orders}
                                  order={order}
                                  driverId={driver.id}
                                  name={driver.active ? driver.name : `${driver.name} (inactivo)`}
                                />
                              ))}
                              {order.driverId && !drivers.some((driver) => driver.id === order.driverId) && (
                                <DriverChoice
                                  orders={orders}
                                  order={order}
                                  driverId={order.driverId}
                                  name={order.driverId}
                                />
                              )}
                            </select>
                          )}
                          {order.status !== 'pendiente' &&
                            order.status !== 'en-viaje' &&
                            order.status !== 'entregado' &&
                            !normalizeTimeWindow(order.timeWindow) &&
                            order.driverId && (
                            <p id={`franja-${order.id}`} className="shrink-0">
                              Asigná una franja primero
                            </p>
                          )}
                        </div>
                      </div>
                      )}
                      {order.dispatchType !== 'correo' && <SlotUsage orders={orders} order={order} />}
                    </>
                  )}
                  {user && statusChoices(user.role, order).length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        className="min-h-11 rounded-xl border border-lumi-line px-3 py-1.5 text-sm hover:bg-[#f7f4ea] disabled:opacity-50"
                        disabled={busyId === order.id}
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
                          {statusChoices(user.role, order)
                            .filter((status) => status !== order.status)
                            .map((status) => (
                            <button
                              key={status}
                              type="button"
                              role="menuitem"
                              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea] ${
                                order.status === status ? 'font-semibold' : ''
                              }`}
                              onClick={() => void changeStatus(order, status)}
                            >
                              {statusPillFor(order, status)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {user && canEditOrder(user, order) && (
                    <button
                      type="button"
                      className="text-sm text-lumi-ink hover:underline"
                      onClick={() => navigate('/nuevo-pedido', { state: { orderId: order.id } })}
                    >
                      Editar
                    </button>
                  )}
                  {(assign || confirmDelivery) && (
                    <button
                      type="button"
                      className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm hover:bg-[#f7f4ea]"
                      onClick={() => {
                        setOpenStatusId(null)
                        setCoverId(order.id)
                      }}
                    >
                      Carátula
                    </button>
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
        <QrScanDialog
          key={dialog}
          title={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar carátula'}
          hint="Apuntá la cámara al QR, o pegá el N° de pedido o la factura."
          confirmLabel={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar'}
          error={dialogError}
          pending={scanBusy}
          onClose={() => {
            if (scanBusy) return
            setDialog(null)
          }}
          onSubmit={submitCode}
        />
      )}
      {coverOrder && <QrCoverDialog order={coverOrder} onClose={() => setCoverId(null)} />}
    </section>
  )
}
