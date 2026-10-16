import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { ServerDown, Spinner } from '../components/LoadState'
import { Badge, Button, EmptyState, FilterBar, ListBox, Modal, Page, PageHeader, Table, type TableColumn } from '../components/ui'
import { isOwnDelivery } from '../data/catalog'
import { error, success } from '../lib/alerts'
import { fetchDriverLocations, type LiveDriver } from '../lib/driversApi'
import { finishRouteSheet, listOpenRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { isSession } from '../lib/authStore'
import { listUsers } from '../lib/usersApi'
import { formatIsoDate } from '../lib/week'
import { clockTime } from '../lib/schedule'
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

function staleMinutes(updatedAt: string, now: number) {
  const at = new Date(updatedAt).getTime()
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.round((now - at) / 60000))
}

function staleLabel(updatedAt: string, now: number) {
  return `Sin señal hace ${staleMinutes(updatedAt, now)} min`
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
              color: cssVar('--accent-fg'),
              weight: 2,
              fillColor: stale ? cssVar('--text-muted') : cssVar('--accent'),
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
              {stale && (
                <span className="block">
                  {staleLabel(driver.updatedAt, now)} · {clockTime(driver.updatedAt)}
                </span>
              )}
            </Popup>
          </CircleMarker>
        )
      })}
      <FitBounds fitKey={fitKey} positions={positions} />
    </MapContainer>
  )
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
  const [accountNames, setAccountNames] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        return
      }
      if (!Array.isArray(result.data)) return
      const names = new Map<string, string>()
      for (const item of result.data) {
        if (isSession(item) && item.role === 'chofer' && item.name.trim()) names.set(item.id, item.name.trim())
      }
      setAccountNames(names)
    })
    return () => {
      cancelled = true
    }
  }, [logout])

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
      const sheetsResult = await listOpenRouteSheets()
      if (cancelled) return
      setDrivers(result.data)
      setSheets(sheetsResult.ok ? sheetsResult.data : [])
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

  const openTrips = useMemo(() => {
    const names = new Map(drivers.map((driver) => [driver.id, driver.name]))
    for (const order of orders) {
      if (!order.driverId || names.has(order.driverId)) continue
      if (order.driverName?.trim()) names.set(order.driverId, order.driverName.trim())
    }
    return sheets
      .filter((sheet) => sheet.status === 'en_curso')
      .map((sheet) => {
        const pending = sheet.orderIds.filter((id) => {
          const order = orders.find((item) => item.id === id)
          return Boolean(order) && order?.status !== 'entregado'
        }).length
        return {
          sheet,
          driverName: names.get(sheet.driverId) || accountNames.get(sheet.driverId) || 'Sin nombre',
          pending,
        }
      })
      .sort(
        (left, right) =>
          left.sheet.date.localeCompare(right.sheet.date) ||
          left.sheet.slot.localeCompare(right.sheet.slot) ||
          left.driverName.localeCompare(right.driverName, 'es'),
      )
  }, [accountNames, drivers, orders, sheets])

  const tripColumns: TableColumn<(typeof openTrips)[number]>[] = [
    { key: 'driver', header: 'Chofer', cell: (trip) => trip.driverName },
    { key: 'date', header: 'Fecha', cell: (trip) => formatIsoDate(trip.sheet.date) },
    { key: 'slot', header: 'Franja', cell: (trip) => trip.sheet.slot },
    {
      key: 'pending',
      header: 'Paradas pendientes',
      align: 'right',
      cell: (trip) => trip.pending,
    },
    {
      key: 'action',
      header: 'Acción',
      cell: (trip) => (
        <Button
          variant="secondary"
          size="lg"
          disabled={finishing}
          onClick={(event) => {
            event.stopPropagation()
            setFinishTarget(trip.sheet)
          }}
        >
          Finalizar viaje
        </Button>
      ),
    },
  ]

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
    <Page width="full">
      <PageHeader title="Choferes en ruta" subtitle="Última posición de los que están en viaje" />
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
          <ListBox
            className="mt-4"
            counters={[
              {
                key: 'curso',
                label: 'En curso',
                count: openTrips.length,
                active: true,
                onClick: () => undefined,
              },
            ]}
          >
            {openTrips.length === 0 ? (
              <EmptyState variant="plain" title="No hay viajes en curso" />
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table bare columns={tripColumns} rows={openTrips} rowKey={(trip) => trip.sheet.id} />
                </div>
                <div className="flex flex-col lg:hidden">
                  {openTrips.map(({ sheet, driverName, pending }) => (
                    <article key={sheet.id} className="border-b border-border px-4 py-3 last:border-b-0">
                      <p className="font-semibold">{driverName}</p>
                      <p className="mt-1 text-sm text-muted">
                        {formatIsoDate(sheet.date)} · {sheet.slot}
                      </p>
                      <p className="mt-1 text-sm">
                        {pending === 1 ? '1 parada pendiente' : `${pending} paradas pendientes`}
                      </p>
                      <Button
                        variant="secondary"
                        size="lg"
                        fullWidth
                        className="mt-3"
                        disabled={finishing}
                        onClick={() => setFinishTarget(sheet)}
                      >
                        Finalizar viaje
                      </Button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </ListBox>
          <FilterBar
            className="mt-4"
            search={{
              value: query,
              onChange: setQuery,
              label: 'Buscar chofer',
              srOnly: true,
              placeholder: 'Buscar por nombre o transportista',
            }}
            selects={[
              {
                id: 'chofer',
                label: 'Chofer',
                value: driverFilter,
                onChange: setDriverFilter,
                options: [
                  { value: '', label: 'Todos los choferes' },
                  ...drivers.map((driver) => ({ value: driver.id, label: driver.name })),
                  ...(filterMissing ? [{ value: driverFilter, label: 'Ese chofer no está en ruta' }] : []),
                ],
              },
            ]}
            activeCount={(query.trim() ? 1 : 0) + (driverFilter ? 1 : 0)}
            onClear={() => {
              setQuery('')
              setDriverFilter('')
            }}
          />

          <div className="mt-4 overflow-hidden rounded-md border border-border bg-surface" style={{ height: 480 }}>
            {visible.length > 0 ? (
              <DriversMap drivers={visible} now={now} sheets={sheets} orders={deliveryOrders} />
            ) : (
              <EmptyState
                variant="plain"
                title={
                  drivers.length === 0
                    ? 'No hay choferes en ruta'
                    : filterMissing
                      ? 'Ese chofer no está en ruta'
                      : 'Ningún chofer coincide con el filtro.'
                }
              />
            )}
          </div>
          {visible.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              {visible.map((driver) => {
                const line = sheetLine(driver.id, sheets, deliveryOrders)
                const stale = isStale(driver.updatedAt, now)
                return (
                  <article key={driver.id} className="border-b border-border px-4 py-3 text-sm last:border-b-0">
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
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      {stale ? (
                        <Badge tone="warning">{staleLabel(driver.updatedAt, now)}</Badge>
                      ) : (
                        <span className="text-muted">{minutesAgo(driver.updatedAt, now)}</span>
                      )}
                      <span className="text-muted">{clockTime(driver.updatedAt)}</span>
                    </p>
                    <p className="mt-2">
                      <Link className="text-sm font-semibold text-accent hover:underline" to={`/mis-viajes?chofer=${driver.id}`}>
                        Ver viajes
                      </Link>
                    </p>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
      {finishTarget && (
        <Modal
          labelledBy="finish-trip-title"
          closeOnEscape={!finishing}
          className="grid place-items-center bg-overlay p-4"
          onClose={() => {
            if (!finishing) setFinishTarget(null)
          }}
        >
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5">
            <h2 id="finish-trip-title" className="text-xl font-semibold">
              Finalizar viaje
            </h2>
            <p className="mt-2 text-sm">
              Las paradas pendientes quedan sin entregar y vuelven a asignado para reprogramarlas.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" size="lg" fullWidth loading={finishing} onClick={() => void finishSheet()}>
                Finalizar viaje
              </Button>
              <Button variant="secondary" size="lg" fullWidth disabled={finishing} onClick={() => setFinishTarget(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Page>
  )
}
