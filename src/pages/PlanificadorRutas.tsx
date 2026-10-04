import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { STATUS_PILL, type Order } from '../data/orders'
import { MONTH_SHORT, formatDayLabel, toIso, weekDays } from '../lib/week'
import {
  drivingRoute,
  geocodeAll,
  optimizedRoute,
  type LatLng,
  type PlannedRoute,
} from '../lib/route'
import { useOrders } from '../state/OrdersContext'
import 'leaflet/dist/leaflet.css'

const DEFAULT_ORIGIN = 'Warnes 986, Buenos Aires'

type Stop = {
  key: string
  title: string
  detail: string
  point: LatLng
}

function isRoutable(order: Order) {
  return order.status !== 'entregado'
}

function placeQuery(value: string) {
  const trimmed = value.trim()
  if (/buenos aires|caba|argentina/i.test(trimmed)) return trimmed
  return `${trimmed}, Buenos Aires, Argentina`
}

function formatKm(kilometers: number) {
  return `${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: kilometers < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(kilometers)} km`
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions, { padding: [28, 28] })
  }, [map, positions])
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={line} pathOptions={{ color: '#1c1b19', weight: 4 }} />
      {stops.map((stop, index) => (
        <CircleMarker
          key={stop.key}
          center={[stop.point.lat, stop.point.lng]}
          radius={index === 0 ? 9 : 7}
          pathOptions={{
            color: '#1a1a1a',
            weight: 2,
            fillColor: index === 0 ? '#f5c400' : '#ffffff',
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
  const { orders } = useOrders()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => toIso(new Date()))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [stops, setStops] = useState<Stop[]>([])
  const [route, setRoute] = useState<PlannedRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const days = weekDays(weekOffset)
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const routable = orders.filter(isRoutable)
  const dayOrders = routable.filter((order) => order.deliveryDate === toIso(selectedDate))
  const allSelected = dayOrders.length > 0 && dayOrders.every((order) => selectedIds.includes(order.id))

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = toIso(new Date())
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
    setSelectedIds([])
    setStops([])
    setRoute(null)
    setError('')
  }

  function pickDay(iso: string) {
    setSelectedIso(iso)
    setSelectedIds([])
    setStops([])
    setRoute(null)
    setError('')
  }

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
    setStops([])
    setRoute(null)
    setError('')
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : dayOrders.map((order) => order.id))
    setStops([])
    setRoute(null)
    setError('')
  }

  function clearPlan() {
    setSelectedIds([])
    setOrigin(DEFAULT_ORIGIN)
    setStops([])
    setRoute(null)
    setError('')
  }

  async function plan(optimize: boolean) {
    const chosen = selectedIds
      .map((id) => dayOrders.find((order) => order.id === id))
      .filter((order): order is Order => Boolean(order))
    if (!origin.trim()) {
      setError('Completá el origen de la ruta.')
      return
    }
    if (chosen.length === 0) {
      setError('Seleccioná al menos un pedido del día.')
      return
    }
    const missing = chosen.find((order) => !order.address?.trim())
    if (missing) {
      setError(`${missing.id} no tiene dirección.`)
      return
    }

    setLoading(true)
    setError('')
    try {
      const queries = [placeQuery(origin), ...chosen.map((order) => placeQuery(order.address ?? ''))]
      const points = await geocodeAll(queries)
      const missingPoint = points.findIndex((point) => !point)
      if (missingPoint === 0) throw new Error('No encontré el origen en el mapa.')
      if (missingPoint > 0) {
        throw new Error(`No ubiqué la dirección de ${chosen[missingPoint - 1].id}.`)
      }
      const located = points as LatLng[]
      const planned = optimize ? await optimizedRoute(located) : await drivingRoute(located)
      const ordered = planned.sequence.map((index) => {
        if (index === 0) {
          return {
            key: 'origen',
            title: 'Salida',
            detail: origin.trim(),
            point: located[0],
          }
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
    } catch (caught) {
      setStops([])
      setRoute(null)
      setError(caught instanceof Error ? caught.message : 'No se pudo calcular la ruta.')
    } finally {
      setLoading(false)
    }
  }

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  const deliveryStops = Math.max(0, stops.length - 1)

  return (
    <section className="page">
      <header className="page-header">
        <h1>Planificador de Rutas</h1>
        <p>Seleccioná pedidos del día y calculá la ruta óptima</p>
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
          const count = routable.filter((order) => order.deliveryDate === iso).length
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
              onClick={() => pickDay(iso)}
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

      <div className="no-print mt-4 flex flex-wrap items-center gap-2">
        <input
          value={origin}
          onChange={(event) => {
            setOrigin(event.target.value)
            setStops([])
            setRoute(null)
          }}
          aria-label="Origen de la ruta"
          className="min-w-0 flex-1 rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-60"
          disabled={loading}
          onClick={() => void plan(false)}
        >
          {loading ? 'Calculando…' : 'Calcular ruta'}
        </button>
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
          disabled={loading}
          onClick={() => void plan(true)}
        >
          Optimizar orden
        </button>
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm hover:bg-white"
          onClick={() => window.print()}
        >
          Imprimir
        </button>
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm text-lumi-muted hover:bg-white"
          onClick={clearPlan}
        >
          Limpiar
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-lumi-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-6 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
        <span>{deliveryStops} parada{deliveryStops === 1 ? '' : 's'}</span>
        <span>{route ? formatKm(route.kilometers) : '— km'}</span>
        <span>{route ? `${route.minutes} min` : '—'}</span>
      </div>

      <div
        className="mt-3 overflow-hidden rounded-2xl bg-[#e6e2d8]"
        style={{ height: 420 }}
      >
        {route && stops.length > 0 ? (
          <RouteMap stops={stops} line={route.line} />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-lumi-muted">
            El mapa aparecerá aquí al calcular la ruta
          </div>
        )}
      </div>

      <div
        className="mt-6 grid gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-lumi-muted">PEDIDOS DEL DÍA</h2>
            <p className="text-sm text-lumi-muted">
              {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
            </p>
          </div>
          {dayOrders.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              Sin pedidos para este día.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {dayOrders.length > 1 && (
                <label className="flex items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: '#f5c400' }}
                  />
                  Seleccionar todos
                </label>
              )}
              {dayOrders.map((order) => (
                <label
                  key={order.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.includes(order.id)}
                    onChange={() => toggle(order.id)}
                    style={{ accentColor: '#f5c400' }}
                  />
                  <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {order.id} — {order.client.toUpperCase()}
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
        </section>

        <section>
          <h2 className="text-sm font-semibold tracking-wide text-lumi-muted">ORDEN DE ENTREGA</h2>
          {stops.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              El orden aparece al calcular la ruta.
            </div>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {stops.map((stop, index) => (
                <li key={stop.key} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="font-medium">
                    <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-lumi-yellow text-xs font-semibold text-lumi-yellow-ink">
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
    </section>
  )
}
