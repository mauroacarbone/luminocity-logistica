import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { ServerDown, Spinner } from '../components/LoadState'
import { Modal } from '../components/ui/Modal'
import { isOwnDelivery } from '../data/catalog'
import { error, success } from '../lib/alerts'
import { fetchDriverLocations, type LiveDriver } from '../lib/driversApi'
import { finishRouteSheet, listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { businessToday } from '../lib/schedule'
import { cssVar } from '../lib/theme'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import 'leaflet/dist/leaflet.css'

const REFRESH_MS = 30_000
const STALE_MS = 10 * 60 * 1000
const CENTER: [number, number] = [-34.6, -58.44]

function FitBounds({ fitKey, positions }: { fitKey: string; positions: [number, number][] }) {
  const map = useMap()
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (positions.length === 0) return
    if (lastKey.current === fitKey) return
    lastKey.current = fitKey
    map.fitBounds(positions, { padding: [28, 28], maxZoom: 14 })
  }, [map, fitKey, positions])
  return null
}

function minutesAgo(updatedAt: string, now: number) {
  const at = new Date(updatedAt).getTime()
  if (!Number.isFinite(at)) return 'sin hora'
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  if (minutes < 1) return 'hace un momento'
  if (minutes === 1) return 'hace 1 minuto'
  if (minutes < 60) return `hace ${minutes} minutos`
  const hours = Math.round(minutes / 60)
  if (hours === 1) return 'hace 1 hora'
  return `hace ${hours} horas`
}

function isStale(updatedAt: string, now: number) {
  const at = new Date(updatedAt).getTime()
  return !Number.isFinite(at) || now - at > STALE_MS
}

function travelingLabel(count: number) {
  return count === 1 ? '1 pedido en viaje' : `${count} pedidos en viaje`
}

function sheetLine(driverId: string, sheets: RouteSheet[], orders: { id: string; client: string; status: string }[]) {
  const sheet = sheets.find((item) => item.driverId === driverId && item.status === 'en_curso')
  if (!sheet) return null
  const stops = sheet.orderIds
    .map((id) => orders.find((order) => order.id === id))
    .filter((order): order is { id: string; client: string; status: string } => Boolean(order))
  const delivered = stops.filter((order) => order.status === 'entregado').length
  const next = stops.find((order) => order.status !== 'entregado')
  return {
    progress: `${delivered} de ${sheet.orderIds.length} entregados`,
    next: next ? `Próxima parada: ${next.client}` : 'Sin paradas pendientes',
    slot: sheet.slot,
  }
}

function DriversMap({
  drivers,
  now,
  sheets,
  orders,
}: {
  drivers: LiveDriver[]
  now: number
  sheets: RouteSheet[]
  orders: { id: string; client: string; status: string }[]
}) {
  const positions = drivers.map((driver) => [driver.lat, driver.lng] as [number, number])
  const fitKey = drivers
    .map((driver) => driver.id)
    .sort()
    .join('|')
  return (
    <MapContainer center={CENTER} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {drivers.map((driver) => {
        const stale = isStale(driver.updatedAt, now)
        return (
          <CircleMarker
            key={driver.id}
            center={[driver.lat, driver.lng]}
            radius={11}
            pathOptions={{
              color: cssVar('--accent-fg', '#FFFFFF'),
              weight: 2,
              fillColor: stale
                ? cssVar('--text-muted', '#5B6472')
                : cssVar('--accent', '#2563EB'),
              fillOpacity: 1,
            }}
          >
            <Popup>
              <span className="block font-semibold">{driver.name}</span>
              <span className="block">{driver.carrierName}</span>
              <span className="block">{minutesAgo(driver.updatedAt, now)}</span>
              <span className="block">{travelingLabel(driver.traveling)}</span>
              {sheetLine(driver.id, sheets, orders) && (
                <>
                  <span className="block">Hoja en curso · {sheetLine(driver.id, sheets, orders)?.slot}</span>
                  <span className="block">{sheetLine(driver.id, sheets, orders)?.next}</span>
                  <span className="block">{sheetLine(driver.id, sheets, orders)?.progress}</span>
                </>
              )}
              {stale && <span className="block">sin señal</span>}
            </Popup>
          </CircleMarker>
        )
      })}
      <FitBounds fitKey={fitKey} positions={positions} />
    </MapContainer>
  )
}

function courseSheets(driverId: string, sheets: RouteSheet[]) {
  return sheets.filter((sheet) => sheet.driverId === driverId && sheet.status === 'en_curso')
}

export function ChoferesEnRuta() {
  const { logout } = useAuth()
  const { orders, refresh } = useOrders()
  const [drivers, setDrivers] = useState<LiveDriver[]>([])
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [driverFilter, setDriverFilter] = useState('')
  const [finishTarget, setFinishTarget] = useState<RouteSheet | null>(null)
  const [finishing, setFinishing] = useState(false)

  const sheetDates = useMemo(() => {
    const dates = new Set<string>([businessToday()])
    for (const order of orders) {
      if (order.status !== 'en-viaje') continue
      if (typeof order.deliveryDate === 'string' && order.deliveryDate.trim()) dates.add(order.deliveryDate)
    }
    return [...dates].sort()
  }, [orders])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await fetchDriverLocations()
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        setMessage(result.status === 0 ? 'No se pudo conectar con el servidor' : result.message)
        setStatus('error')
        return
      }
      const sheetResults = await Promise.all(sheetDates.map((date) => listRouteSheets(date)))
      if (cancelled) return
      setDrivers(result.data)
      setSheets(sheetResults.flatMap((item) => (item.ok ? item.data : [])))
      setNow(Date.now())
      setStatus('ready')
    }

    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [logout, attempt, sheetDates])

  const filterMissing =
    driverFilter !== '' && !drivers.some((driver) => driver.id === driverFilter)

  const deliveryOrders = useMemo(
    () =>
      orders
        .filter((order) => isOwnDelivery(order))
        .map((order) => ({ id: order.id, client: order.client, status: order.status })),
    [orders],
  )

  async function finishSheet() {
    if (!finishTarget) return
    setFinishing(true)
    const result = await finishRouteSheet(finishTarget.id)
    setFinishing(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    setSheets((current) => current.filter((item) => item.id !== finishTarget.id))
    setFinishTarget(null)
    await refresh({ silent: true })
    setAttempt((current) => current + 1)
    await success('Viaje finalizado')
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return drivers.filter((driver) => {
      if (driverFilter && driver.id !== driverFilter) return false
      if (!needle) return true
      return (
        driver.name.toLowerCase().includes(needle) ||
        driver.carrierName.toLowerCase().includes(needle)
      )
    })
  }, [driverFilter, drivers, query])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Choferes en ruta</h1>
        <p>Última posición de los que están en viaje</p>
      </header>
      {status === 'loading' && <Spinner label="Cargando choferes…" />}
      {status === 'error' && (
        <ServerDown
          message={message}
          onRetry={() => {
            setStatus('loading')
            setAttempt((current) => current + 1)
          }}
        />
      )}
      {status === 'ready' && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o transportista"
              className="min-w-0 flex-1 rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm"
            />
            <select
              value={driverFilter}
              aria-label="Chofer"
              className="rounded-xl border border-lumi-line bg-surface px-3 py-2 text-sm"
              onChange={(event) => setDriverFilter(event.target.value)}
            >
              <option value="">Todos los choferes</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
              {filterMissing && <option value={driverFilter}>Ese chofer no está en ruta</option>}
            </select>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl bg-border-strong" style={{ height: 480 }}>
            {visible.length > 0 ? (
              <DriversMap drivers={visible} now={now} sheets={sheets} orders={deliveryOrders} />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-lumi-muted">
                {drivers.length === 0
                  ? 'No hay choferes en ruta.'
                  : filterMissing
                    ? 'Ese chofer no está en ruta'
                    : 'Ningún chofer coincide con el filtro.'}
              </div>
            )}
          </div>
          {visible.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {visible.map((driver) => {
                const line = sheetLine(driver.id, sheets, deliveryOrders)
                const openSheets = courseSheets(driver.id, sheets)
                return (
                  <li key={driver.id} className="rounded-2xl bg-surface px-4 py-3 text-sm shadow-sm">
                    <p className="font-semibold">{driver.name}</p>
                    <p>{driver.carrierName}</p>
                    <p>{travelingLabel(driver.traveling)}</p>
                    {line && (
                      <>
                        <p>Hoja en curso · {line.slot}</p>
                        <p>{line.next}</p>
                        <p>{line.progress}</p>
                      </>
                    )}
                    <p className="mt-2">
                      <Link className="order-link text-sm font-semibold" to={`/mis-viajes?chofer=${driver.id}`}>
                        Ver viajes
                      </Link>
                    </p>
                    {openSheets.map((sheet) => (
                      <button
                        key={sheet.id}
                        type="button"
                        className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50"
                        disabled={finishing}
                        onClick={() => setFinishTarget(sheet)}
                      >
                        Finalizar viaje
                      </button>
                    ))}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      {finishTarget && (
        <Modal
          labelledBy="finish-trip-title"
          closeOnEscape={!finishing}
          className="grid place-items-center bg-black/40 p-4"
          onClose={() => {
            if (!finishing) setFinishTarget(null)
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-lg">
            <h2 id="finish-trip-title" className="text-xl font-semibold">
              Finalizar viaje
            </h2>
            <p className="mt-2 text-sm">
              Las paradas pendientes quedan sin entregar y vuelven a asignado para reprogramarlas.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="min-h-12 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50"
                disabled={finishing}
                onClick={() => void finishSheet()}
              >
                {finishing ? 'Cerrando…' : 'Finalizar viaje'}
              </button>
              <button
                type="button"
                className="min-h-12 rounded-xl border border-lumi-line px-4 text-base font-semibold disabled:opacity-50"
                disabled={finishing}
                onClick={() => setFinishTarget(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
