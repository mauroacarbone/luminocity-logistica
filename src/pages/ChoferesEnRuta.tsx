import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { ServerDown, Spinner } from '../components/LoadState'
import { fetchDriverLocations, type LiveDriver } from '../lib/driversApi'
import { useAuth } from '../state/AuthContext'
import 'leaflet/dist/leaflet.css'

const REFRESH_MS = 30_000
const STALE_MS = 10 * 60 * 1000
const CENTER: [number, number] = [-34.6, -58.44]

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const key = positions.map((point) => point.join(',')).join(';')
  useEffect(() => {
    if (positions.length === 0) return
    map.fitBounds(positions, { padding: [28, 28], maxZoom: 14 })
  }, [map, key, positions])
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

function DriversMap({ drivers, now }: { drivers: LiveDriver[]; now: number }) {
  const positions = drivers.map((driver) => [driver.lat, driver.lng] as [number, number])
  return (
    <MapContainer center={CENTER} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution="&copy; OpenStreetMap"
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
              color: '#1a1a1a',
              weight: 2,
              fillColor: stale ? '#b9b9b9' : '#f5c400',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <span className="block font-semibold">{driver.name}</span>
              <span className="block">{driver.carrierName}</span>
              <span className="block">{minutesAgo(driver.updatedAt, now)}</span>
              <span className="block">{travelingLabel(driver.traveling)}</span>
              {stale && <span className="block">sin señal</span>}
            </Popup>
          </CircleMarker>
        )
      })}
      <FitBounds positions={positions} />
    </MapContainer>
  )
}

export function ChoferesEnRuta() {
  const { logout } = useAuth()
  const [drivers, setDrivers] = useState<LiveDriver[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)

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
      setDrivers(result.data)
      setNow(Date.now())
      setStatus('ready')
    }

    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [logout, attempt])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Choferes en ruta</h1>
        <p>Última posición de los que están en viaje</p>
      </header>
      {status === 'loading' && <Spinner label="Cargando choferes…" />}
      {status === 'error' && <ServerDown message={message} onRetry={() => {
        setStatus('loading')
        setAttempt((current) => current + 1)
      }} />}
      {status === 'ready' && (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl bg-[#e6e2d8]" style={{ height: 480 }}>
            <DriversMap drivers={drivers} now={now} />
          </div>
          {drivers.length === 0 && (
            <p className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              No hay choferes en ruta.
            </p>
          )}
        </>
      )}
    </section>
  )
}
