import { useEffect, useRef, useState } from 'react'
import { Button, Page, PageHeader } from '../components/ui'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { PriorityChip } from '../components/PriorityChip'
import { isOwnDelivery } from '../data/catalog'
import { STATUS_PILL, type Order } from '../data/orders'
import { confirm, error as showError, success } from '../lib/alerts'
import { placeLine } from '../lib/place'
import { compareOpenPriority } from '../lib/priority'
import {
  drivingRoute,
  geocode,
  optimizedRoute,
  type LatLng,
  type PlannedRoute,
} from '../lib/route'
import { deleteRouteSheet, isRouteSheet, listRouteSheets, saveRouteSheet, type RouteSheet } from '../lib/routeSheetsApi'
import { driverSlotCount, normalizeTimeWindow, slotQuestion } from '../lib/slot'
import { cssVar } from '../lib/theme'
import { DAY_SHORT, MONTH_SHORT, formatDayLabel, toIso, weekDays, weekOffsetForIso } from '../lib/week'
import { listUsers } from '../lib/usersApi'
import { isSession } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'
import 'leaflet/dist/leaflet.css'

const DEFAULT_ORIGIN = 'Warnes 986, Buenos Aires'
const SHEET_LABEL: Record<RouteSheet['status'], string> = {
  planificada: 'Planificada',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
}

type Stop = {
  key: string
  title: string
  detail: string
  point: LatLng
}

function otherSlotReason(order: Order, driverId: string) {
  if (order.status === 'pendiente') return 'Pendiente: falta preparar'
  if (order.status === 'en-viaje') return 'En viaje'
  if (order.status === 'entregado') return 'Entregado'
  if (order.driverId && order.driverId !== driverId) return 'Asignado a otro chofer'
  return 'No seleccionable'
}

function emptySelectableMessage(othersCount: number, withoutSlot: number, used: number) {
  if (othersCount > 0) {
    return 'No hay pedidos seleccionables en esta franja. Los demás aparecen abajo con el motivo.'
  }
  if (withoutSlot > 0) {
    return `No hay pedidos en esta franja. Hay ${withoutSlot} preparado${withoutSlot === 1 ? '' : 's'} sin franja ese día.`
  }
  if (used > 0) {
    return 'No hay pedidos seleccionables en esta franja para este chofer.'
  }
  return 'No hay pedidos para esta franja.'
}

type DriverOption = { id: string; name: string }

function placeQuery(value: string) {
  const trimmed = value.trim()
  if (/buenos aires|caba|argentina/i.test(trimmed)) return trimmed
  return `${trimmed}, Buenos Aires, Argentina`
}

function pointOf(order: Order): LatLng | null {
  if (typeof order.lat !== 'number' || typeof order.lng !== 'number') return null
  if (!Number.isFinite(order.lat) || !Number.isFinite(order.lng)) return null
  return { lat: order.lat, lng: order.lng }
}

function formatKm(kilometers: number) {
  return `${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: kilometers < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(kilometers)} km`
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function locate(origin: string, chosen: Order[]) {
  const items: { label: string; query: string; known: LatLng | null }[] = [
    { label: 'origen', query: placeQuery(origin), known: null },
    ...chosen.map((order) => ({
      label: order.id,
      query: placeQuery(order.address ?? ''),
      known: pointOf(order),
    })),
  ]
  const points: LatLng[] = []
  let lookedUp = false
  for (const item of items) {
    if (item.known) {
      points.push(item.known)
      continue
    }
    if (lookedUp) await pause(1100)
    lookedUp = true
    const point = await geocode(item.query)
    if (!point) {
      throw new Error(item.label === 'origen' ? 'No encontré el origen en el mapa.' : `No ubiqué la dirección de ${item.label}.`)
    }
    points.push(point)
  }
  return points
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions, { padding: [28, 28] })
  }, [map, positions])
  return null
}

function MapSize() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const update = () => {
      map.invalidateSize()
    }
    update()
    const observer = new ResizeObserver(() => update())
    observer.observe(container)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [map])
  return null
}

function RouteMap({ stops, line }: { stops: Stop[]; line: [number, number][] }) {
  const origin = stops[0]?.point ?? { lat: -34.6, lng: -58.44 }
  return (
    <MapContainer
      center={[origin.lat, origin.lng]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <MapSize />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline
        positions={line}
        pathOptions={{ color: cssVar('--text', '#111827'), weight: 4 }}
      />
      {stops.map((stop, index) => (
        <CircleMarker
          key={stop.key}
          center={[stop.point.lat, stop.point.lng]}
          radius={index === 0 ? 9 : 7}
          pathOptions={{
            color: cssVar('--accent-fg', '#FFFFFF'),
            weight: 2,
            fillColor:
              index === 0 ? cssVar('--accent', '#2563EB') : cssVar('--surface', '#F9FAFB'),
            fillOpacity: 1,
          }}
        >
          <Tooltip>{`${index + 1}. ${stop.title}`}</Tooltip>
        </CircleMarker>
      ))}
      <FitBounds positions={line.length > 0 ? line : stops.map((stop) => [stop.point.lat, stop.point.lng])} />
    </MapContainer>
  )
}

export function PlanificadorRutas() {
  const [searchParams] = useSearchParams()
  const presetDriver = searchParams.get('chofer')?.trim() ?? ''
  const presetFecha = searchParams.get('fecha')?.trim() ?? ''
  const presetIso = /^\d{4}-\d{2}-\d{2}$/.test(presetFecha) ? presetFecha : ''
  const { logout } = useAuth()
  const { orders, refresh } = useOrders()
  const { timeWindows } = useCatalog()
  const [weekOffset, setWeekOffset] = useState(() => (presetIso ? weekOffsetForIso(presetIso) : 0))
  const [selectedIso, setSelectedIso] = useState(() => presetIso || toIso(new Date()))
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [driverId, setDriverId] = useState(presetDriver)
  const [slot, setSlot] = useState('')
  const [sheet, setSheet] = useState<RouteSheet | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [stops, setStops] = useState<Stop[]>([])
  const [route, setRoute] = useState<PlannedRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ordersRef = useRef(orders)
  const drawRef = useRef<(from: string, ids: string[], optimize: boolean) => Promise<boolean>>(async () => false)
  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  const days = weekDays(weekOffset)
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const iso = toIso(selectedDate)
  const timeWindow = normalizeTimeWindow(slot)
  const readOnly = Boolean(sheet && sheet.status !== 'planificada')
  const driverName = drivers.find((driver) => driver.id === driverId)?.name ?? ''
  const used = driverId && timeWindow ? driverSlotCount(orders, driverId, iso, timeWindow) : 0

  const pool = orders.filter((order) => {
    if (order.deliveryDate !== iso || normalizeTimeWindow(order.timeWindow) !== timeWindow) return false
    if (!isOwnDelivery(order)) return false
    return true
  })
  const listed = readOnly
    ? (sheet?.orderIds ?? [])
        .map((id) => orders.find((order) => order.id === id))
        .filter((order): order is Order => Boolean(order))
    : pool.filter((order) => {
        if (order.driverId === driverId) return order.status === 'preparado' || order.status === 'asignado'
        return !order.driverId && order.status === 'preparado'
      })
  const listedIds = new Set(listed.map((order) => order.id))
  const others = readOnly
    ? []
    : pool.filter((order) => !listedIds.has(order.id))
  const sortListed = (left: Order, right: Order) => {
    const byPriority = compareOpenPriority(left, right)
    if (byPriority !== 0) return byPriority
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  }
  const listedView = [...listed].sort(sortListed)
  const othersView = [...others].sort(sortListed)
  const preparedWithoutSlot = orders.filter((order) => {
    if (order.deliveryDate !== iso || order.status !== 'preparado') return false
    if (!isOwnDelivery(order)) return false
    return !normalizeTimeWindow(order.timeWindow)
  })

  useEffect(() => {
    void listUsers().then((result) => {
      if (!result.ok) {
        if (result.status === 401) logout()
        return
      }
      if (!Array.isArray(result.data)) return
      setDrivers(
        result.data.flatMap((item) =>
          isSession(item) && item.role === 'chofer' && item.active ? [{ id: item.id, name: item.name }] : [],
        ),
      )
    })
  }, [logout])

  function ordersByIds(list: Order[], ids: string[]) {
    return ids
      .map((id) => list.find((order) => order.id === id))
      .filter((order): order is Order => Boolean(order))
  }

  async function draw(from: string, ids: string[], optimize: boolean) {
    const chosen = ordersByIds(ordersRef.current, ids)
    if (!from.trim()) {
      setError('Completá el origen de la ruta.')
      return false
    }
    if (chosen.length === 0) {
      setError('Seleccioná al menos un pedido.')
      return false
    }
    const missing = chosen.find((order) => !order.address?.trim() && !pointOf(order))
    if (missing) {
      setError(`${missing.id} no tiene dirección.`)
      return false
    }
    setLoading(true)
    setError('')
    try {
      const located = await locate(from, chosen)
      const planned = optimize ? await optimizedRoute(located) : await drivingRoute(located)
      const ordered = planned.sequence.map((index) => {
        if (index === 0) {
          return { key: 'origen', title: 'Salida', detail: from.trim(), point: located[0] }
        }
        const order = chosen[index - 1]
        return {
          key: order.id,
          title: `${order.id} — ${order.client}`,
          detail: order.address ?? '',
          point: located[index],
        }
      })
      setStops(ordered)
      setRoute(planned)
      if (optimize) setSelectedIds(ordered.filter((stop) => stop.key !== 'origen').map((stop) => stop.key))
      return true
    } catch (caught) {
      setStops([])
      setRoute(null)
      setError(caught instanceof Error ? caught.message : 'No se pudo calcular la ruta.')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    drawRef.current = draw
  })

  useEffect(() => {
    if (!driverId || !timeWindow) return
    let cancelled = false
    void listRouteSheets(iso).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      const found =
        result.data.find(
          (item) => item.driverId === driverId && normalizeTimeWindow(item.slot) === timeWindow,
        ) ?? null
      setSheet(found)
      setOrigin(found?.origin || DEFAULT_ORIGIN)
      setSelectedIds(found?.orderIds ?? [])
      setStops([])
      setRoute(
        found
          ? { kilometers: found.km, minutes: found.minutes, line: [], sequence: [] }
          : null,
      )
      setError('')
      if (found) void drawRef.current(found.origin, found.orderIds, false)
    })
    return () => {
      cancelled = true
    }
  }, [driverId, timeWindow, iso, logout])

  const sheetId = sheet?.id
  const sheetStatus = sheet?.status
  useEffect(() => {
    if (!sheetId || sheetStatus !== 'en_curso' || !driverId || !timeWindow) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void listRouteSheets(iso).then((result) => {
        if (cancelled || !result.ok) return
        const found =
          result.data.find(
            (item) => item.driverId === driverId && normalizeTimeWindow(item.slot) === timeWindow,
          ) ?? null
        setSheet(found)
      })
    }, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sheetId, sheetStatus, driverId, timeWindow, iso])

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = toIso(new Date())
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
    setError('')
  }

  function pickDay(next: string) {
    setSelectedIso(next)
    setError('')
  }

  function toggle(id: string) {
    if (readOnly) return
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
    setStops([])
    setRoute(null)
    setError('')
  }

  function clearPlan() {
    if (readOnly) return
    setSelectedIds([])
    setOrigin(DEFAULT_ORIGIN)
    setStops([])
    setRoute(null)
    setError('')
  }

  async function confirmSheet(override = false) {
    if (readOnly || !driverId || !timeWindow) return
    let ids =
      stops.length > 1 ? stops.filter((stop) => stop.key !== 'origen').map((stop) => stop.key) : selectedIds
    if (ids.length === 0) {
      setError('Seleccioná al menos un pedido.')
      return
    }
    let km = route?.kilometers ?? 0
    let minutes = route?.minutes ?? 0
    if (!route || route.line.length === 0) {
      const chosen = ordersByIds(ordersRef.current, ids)
      if (!origin.trim()) {
        setError('Completá el origen de la ruta.')
        return
      }
      if (chosen.length === 0) {
        setError('Seleccioná al menos un pedido.')
        return
      }
      const missing = chosen.find((order) => !order.address?.trim() && !pointOf(order))
      if (missing) {
        setError(`${missing.id} no tiene dirección.`)
        return
      }
      setLoading(true)
      setError('')
      try {
        const located = await locate(origin, chosen)
        const planned = await drivingRoute(located)
        const ordered = planned.sequence.map((index) => {
          if (index === 0) {
            return { key: 'origen', title: 'Salida', detail: origin.trim(), point: located[0] }
          }
          const order = chosen[index - 1]
          return {
            key: order.id,
            title: `${order.id} — ${order.client}`,
            detail: order.address ?? '',
            point: located[index],
          }
        })
        setStops(ordered)
        setRoute(planned)
        ids = ordered.filter((stop) => stop.key !== 'origen').map((stop) => stop.key)
        km = planned.kilometers
        minutes = planned.minutes
      } catch (caught) {
        setLoading(false)
        setError(caught instanceof Error ? caught.message : 'No se pudo calcular la ruta.')
        const accepted = await confirm(
          'Sin recorrido',
          'No se pudo calcular la ruta. ¿Confirmás la hoja igual?',
        )
        if (!accepted) return
        km = 0
        minutes = 0
        setLoading(true)
        setError('')
      }
    } else {
      setLoading(true)
      setError('')
    }
    const result = await saveRouteSheet(
      {
        driverId,
        date: iso,
        slot: timeWindow,
        origin: origin.trim(),
        orderIds: ids,
        km,
        minutes,
      },
      override,
    )
    setLoading(false)
    if (!result.ok) {
      if (result.status === 401) {
        logout()
        return
      }
      if (result.code === 'FRANJA_LLENA' && result.slot && !override) {
        const accepted = await confirm(
          'Franja llena',
          slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
        )
        if (accepted) await confirmSheet(true)
        return
      }
      await showError(result.message)
      return
    }
    if (!isRouteSheet(result.data)) {
      await showError('No se pudo leer la hoja de ruta.')
      return
    }
    setSheet(result.data)
    setSelectedIds(result.data.orderIds)
    await refresh({ silent: true })
    await success('Hoja de ruta confirmada')
  }

  async function removeSheet() {
    if (!sheet || sheet.status !== 'planificada') return
    const accepted = await confirm('Borrar hoja', 'Los pedidos quedan con el chofer, pero salen de la hoja.')
    if (!accepted) return
    setLoading(true)
    const result = await deleteRouteSheet(sheet.id)
    setLoading(false)
    if (!result.ok) {
      if (result.status === 401) logout()
      else await showError(result.message)
      return
    }
    setSheet(null)
    setSelectedIds([])
    setStops([])
    setRoute(null)
    await refresh({ silent: true })
    await success('Hoja borrada')
  }

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`
  const mobileTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()}/${days[0].getMonth() + 1}–${days[6].getDate()}/${days[6].getMonth() + 1}`
  const deliveryStops = Math.max(0, stops.filter((stop) => stop.key !== 'origen').length || selectedIds.length)
  const printOrders = ordersByIds(
    orders,
    stops.some((stop) => stop.key !== 'origen')
      ? stops.filter((stop) => stop.key !== 'origen').map((stop) => stop.key)
      : selectedIds,
  )

  return (
    <Page width="full" className="planner-screen">
      <PageHeader
        title="Planificador de Rutas"
        subtitle="Armá la hoja de un chofer para una fecha y una franja"
      />

      <div className="planner-toolbar">
      <div className="planner-week no-print grid grid-cols-3 items-center gap-2">
        <button
          type="button"
          className="justify-self-start rounded-xl px-2 py-2 text-sm text-lumi-ink hover:bg-surface-muted sm:px-3"
          onClick={() => showWeek(weekOffset - 1)}
        >
          <span className="sm:hidden">‹</span>
          <span className="hidden sm:inline">‹ Sem. anterior</span>
        </button>
        <p className="text-center text-sm font-semibold sm:text-base">
          <span className="sm:hidden">{mobileTitle}</span>
          <span className="hidden sm:inline">{weekTitle}</span>
        </p>
        <button
          type="button"
          className="justify-self-end rounded-xl px-2 py-2 text-sm text-lumi-ink hover:bg-surface-muted sm:px-3"
          onClick={() => showWeek(weekOffset + 1)}
        >
          <span className="sm:hidden">›</span>
          <span className="hidden sm:inline">Sem. siguiente ›</span>
        </button>
      </div>

      <div className="planner-days no-print grid min-w-0 grid-cols-7 gap-1">
        {days.map((day) => {
          const dayIso = toIso(day)
          const count = orders.filter((order) => order.deliveryDate === dayIso && order.status !== 'entregado').length
          const selected = dayIso === iso
          return (
            <button
              key={dayIso}
              type="button"
              className={`flex w-full min-w-0 flex-col items-center gap-1 overflow-hidden border-b-2 px-0.5 py-2 text-xs sm:text-sm ${
                selected ? 'border-accent font-semibold text-lumi-ink' : 'border-transparent text-lumi-muted'
              }`}
              onClick={() => pickDay(dayIso)}
            >
              <span className="w-full truncate text-center sm:hidden">{DAY_SHORT[day.getDay()]}</span>
              <span className="w-full text-center sm:hidden">{day.getDate()}</span>
              <span className="hidden w-full truncate text-center sm:inline">{formatDayLabel(day)}</span>
              <span
                className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                  selected ? 'bg-accent text-accent-fg' : 'bg-surface text-lumi-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="planner-filters no-print flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Fecha
          <input
            readOnly
            value={iso}
            className="mt-1 block w-full rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="min-w-40 flex-1 text-sm">
          Chofer
          <select
            value={driverId}
            className="mt-1 block w-full rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm"
            onChange={(event) => {
              setDriverId(event.target.value)
              setSheet(null)
              setSelectedIds([])
              setStops([])
              setRoute(null)
            }}
          >
            <option value="">Elegir chofer</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Franja
          <select
            value={slot}
            className="mt-1 block w-full rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm"
            onChange={(event) => {
              setSlot(event.target.value)
              setSheet(null)
              setSelectedIds([])
              setStops([])
              setRoute(null)
            }}
          >
            <option value="">Elegir franja</option>
            {timeWindows.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <p className={`pb-2 text-sm font-semibold ${used >= 3 ? 'text-lumi-danger' : ''}`}>
          {driverId && timeWindow ? `${used}/3 en la franja` : ''}
        </p>
        {sheet && (
          <span className="mb-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold">{SHEET_LABEL[sheet.status]}</span>
        )}
      </div>
      </div>

      <div className="planner-body">
      <div className="planner-side">
      <div className="planner-side-scroll">
      <div className="planner-list no-print flex flex-col gap-4">
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-lumi-muted">PEDIDOS DE LA FRANJA</h2>
            <p className="text-sm text-lumi-muted">
              {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
            </p>
          </div>
          {!driverId || !timeWindow ? (
            <div className="mt-3 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              Elegí chofer y franja.
            </div>
          ) : (
            <>
              {listedView.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
                  {emptySelectableMessage(others.length, preparedWithoutSlot.length, used)}
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {listedView.map((order) => (
                    <label
                      key={order.id}
                      className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.includes(order.id)}
                        disabled={readOnly}
                        onChange={() => toggle(order.id)}
                        style={{ accentColor: cssVar('--accent', '#2563EB') }}
                      />
                      <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            <span>
                              {order.id} — {order.client.toUpperCase()}
                            </span>
                            <PriorityChip order={order} />
                          </span>
                          {order.address && (
                            <span className="mt-1 block text-sm text-lumi-muted">{order.address}</span>
                          )}
                        </span>
                        <span className={`status-pill status-${order.status} shrink-0`}>
                          {STATUS_PILL[order.status]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {preparedWithoutSlot.length > 0 && (
                <p className="mt-3 text-sm text-lumi-muted">
                  {preparedWithoutSlot.length === 1
                    ? '1 pedido preparado de este día sin franja.'
                    : `${preparedWithoutSlot.length} pedidos preparados de este día sin franja.`}{' '}
                  <Link className="order-link" to="/despacho">
                    Despacho
                  </Link>
                </p>
              )}

              {othersView.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold tracking-wide text-lumi-muted">
                    Otros pedidos de la franja
                  </h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {othersView.map((order) => (
                      <li
                        key={order.id}
                        className="rounded-2xl bg-surface px-4 py-3 text-sm text-lumi-muted shadow-sm"
                      >
                        <p className="flex flex-wrap items-center gap-2">
                          <Link className="order-link font-medium" to={`/pedidos/${order.id}`}>
                            {order.id}
                          </Link>
                          <span>— {order.client.toUpperCase()}</span>
                          <PriorityChip order={order} />
                        </p>
                        <p className="mt-1">{otherSlotReason(order, driverId)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold tracking-wide text-lumi-muted">ORDEN DE ENTREGA</h2>
          {stops.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              El orden aparece al calcular la ruta.
            </div>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {stops.map((stop, index) => (
                <li key={stop.key} className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
                  <p className="font-medium">
                    <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-fg">
                      {index + 1}
                    </span>
                    {stop.title}
                  </p>
                  <p className="mt-1 pl-8 text-sm text-lumi-muted">{stop.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <input
        value={origin}
        onChange={(event) => {
          setOrigin(event.target.value)
          setStops([])
          setRoute(null)
        }}
        disabled={readOnly}
        aria-label="Origen de la ruta"
        className="mt-3 w-full min-w-0 rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm disabled:opacity-60"
      />

      {error && <p className="no-print mt-3 text-sm text-lumi-danger">{error}</p>}

      <p className="planner-stats no-print mt-3 text-sm text-lumi-muted">
        {deliveryStops} parada{deliveryStops === 1 ? '' : 's'}
        {' · '}
        {route && route.line.length > 0 ? formatKm(route.kilometers) : sheet ? formatKm(sheet.km) : '— km'}
        {' · '}
        {route && route.line.length > 0 ? `${route.minutes} min` : sheet ? `${sheet.minutes} min` : '—'}
      </p>
      </div>

      <div className="planner-actions no-print sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-surface py-3">
        <Button
          variant="primary"
          size="lg"
          disabled={loading || readOnly || !driverId || !timeWindow}
          onClick={() => void confirmSheet()}
        >
          Confirmar hoja de ruta
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={loading || readOnly}
          onClick={() => void draw(origin, selectedIds, false)}
        >
          {loading ? 'Calculando…' : 'Calcular ruta'}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          disabled={loading || readOnly}
          onClick={() => void draw(origin, selectedIds, true)}
        >
          Optimizar orden
        </Button>
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          Imprimir
        </Button>
        {sheet?.status === 'planificada' && (
          <Button variant="secondary" size="lg" disabled={loading} onClick={() => void removeSheet()}>
            Borrar hoja
          </Button>
        )}
        <Button variant="ghost" size="lg" disabled={readOnly} onClick={clearPlan}>
          Limpiar
        </Button>
      </div>
      </div>

      <div className="planner-map no-print overflow-hidden rounded-2xl bg-border-strong">
        {route && stops.length > 0 && route.line.length > 0 ? (
          <RouteMap stops={stops} line={route.line} />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-lumi-muted">
            El mapa aparecerá aquí al calcular la ruta
          </div>
        )}
      </div>
      </div>

      <section className="route-print">
        <h2 className="text-xl font-semibold">Hoja de ruta</h2>
        <p className="mt-1 text-sm">
          {driverName || 'Sin chofer'} · {iso} · {timeWindow || 'Sin franja'}
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {printOrders.map((order, index) => (
            <li key={order.id}>
              <p className="font-semibold">
                {index + 1}. {order.client}
              </p>
              <p>{order.address || 'Sin dirección'}</p>
              {placeLine(order) && <p>{placeLine(order)}</p>}
              <p>Teléfono: {order.phone || '—'}</p>
              <p>Bultos: {order.packages ?? '—'}</p>
            </li>
          ))}
        </ol>
      </section>

    </Page>
  )
}
