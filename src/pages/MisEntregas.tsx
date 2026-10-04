import { useEffect, useRef, useState } from 'react'
import { STATUS_PILL, type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { clearDriverLocation, postDriverLocation } from '../lib/driversApi'
import { mapsLink, onTheWayText, whatsappLink } from '../lib/whatsapp'
import { placeLine } from '../lib/place'
import { listRouteSheets, startRouteSheet, type RouteSheet } from '../lib/routeSheetsApi'
import { businessOffset, businessToday, mapsDirections, stopPoint } from '../lib/schedule'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

type Tab = 'asignados' | 'en-viaje'
type Gps = 'off' | 'on' | 'denied'
type Point = { lat: number; lng: number }

const SEND_EVERY_MS = 30_000
const RELOAD_AFTER_MS = 4000
const coordsAsked = new Set<string>()

function byZoneThenAddress(left: Order, right: Order) {
  const zone = (left.zone ?? '').localeCompare(right.zone ?? '', 'es')
  if (zone !== 0) return zone
  return (left.address ?? '').localeCompare(right.address ?? '', 'es')
}

function pointOf(order: Order): Point | null {
  if (typeof order.lat !== 'number' || typeof order.lng !== 'number') return null
  if (!Number.isFinite(order.lat) || !Number.isFinite(order.lng)) return null
  return { lat: order.lat, lng: order.lng }
}

function needsCoords(order: Order) {
  if (!order.address || pointOf(order) || order.geoMiss === true) return false
  if (typeof order.geoRetryAt === 'string') {
    const at = Date.parse(order.geoRetryAt)
    if (Number.isFinite(at) && at > Date.now()) return false
  }
  return true
}

function haversine(from: Point, to: Point) {
  const earth = 6371000
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const lat1 = rad(from.lat)
  const lat2 = rad(to.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)))
}

function formatDistance(meters: number) {
  const text = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000)
  return `a ${text} km`
}

function sortDeliveries(list: Order[], here: Point | null) {
  if (!here) return [...list].sort(byZoneThenAddress)
  const located = list.filter((order) => pointOf(order))
  const missing = list.filter((order) => !pointOf(order))
  located.sort((left, right) => {
    const leftPoint = pointOf(left)
    const rightPoint = pointOf(right)
    if (!leftPoint || !rightPoint) return 0
    const distance = haversine(here, leftPoint) - haversine(here, rightPoint)
    if (distance !== 0) return distance
    return byZoneThenAddress(left, right)
  })
  missing.sort(byZoneThenAddress)
  return [...located, ...missing]
}

export function MisEntregas() {
  const { user } = useAuth()
  const { orders, loading, error: ordersError, patchFields, refresh } = useOrders()
  const [tab, setTab] = useState<Tab>('asignados')
  const [busy, setBusy] = useState('')
  const [here, setHere] = useState<Point | null>(null)
  const [gps, setGps] = useState<Gps>('off')
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [starting, setStarting] = useState('')
  const today = businessToday()
  const tracking = !loading && !ordersError && orders.some((order) => order.status === 'en-viaje')
  const hadTraveling = useRef(false)
  const userId = user?.id

  useEffect(() => {
    let cancelled = false
    const yesterday = businessOffset(-1)
    void Promise.all([listRouteSheets(today), listRouteSheets(yesterday)]).then(([todayResult, yesterdayResult]) => {
      if (cancelled) return
      const open: RouteSheet[] = []
      if (todayResult.ok) {
        open.push(...todayResult.data.filter((sheet) => sheet.status !== 'cerrada'))
      }
      if (yesterdayResult.ok) {
        open.push(
          ...yesterdayResult.data.filter(
            (sheet) => sheet.status === 'en_curso' && !open.some((item) => item.id === sheet.id),
          ),
        )
      }
      setSheets(open)
    })
    return () => {
      cancelled = true
    }
  }, [today, orders])

  useEffect(() => {
    if (loading || ordersError) return
    const traveling = orders.some((order) => order.status === 'en-viaje')
    if (traveling) {
      hadTraveling.current = true
      return
    }
    if (!hadTraveling.current) return
    hadTraveling.current = false
    void clearDriverLocation()
  }, [loading, ordersError, orders])

  useEffect(() => {
    if (loading || ordersError || !userId || coordsAsked.has(userId)) return
    if (!orders.some(needsCoords)) return
    const timer = window.setTimeout(() => {
      coordsAsked.add(userId)
      void refresh({ silent: true })
    }, RELOAD_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [loading, ordersError, orders, refresh, userId])

  useEffect(() => {
    if (!tracking) return
    if (!navigator.geolocation) {
      const timer = window.setTimeout(() => setGps('denied'), 0)
      return () => window.clearTimeout(timer)
    }

    let stopped = false
    let latest: GeolocationPosition | null = null
    let started = false
    let timer = 0

    function schedule() {
      timer = window.setTimeout(() => {
        void sendLatest().finally(() => {
          if (!stopped && latest) schedule()
        })
      }, SEND_EVERY_MS)
    }

    async function sendLatest() {
      const pos = latest
      if (!pos || stopped) return
      await postDriverLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        timestamp: pos.timestamp,
      })
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (stopped) return
        latest = pos
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGps('on')
        if (started) return
        started = true
        void sendLatest().finally(() => {
          if (!stopped) schedule()
        })
      },
      (err) => {
        if (stopped) return
        if (err.code !== err.PERMISSION_DENIED) return
        stopped = true
        latest = null
        window.clearTimeout(timer)
        navigator.geolocation.clearWatch(watchId)
        setHere(null)
        setGps('denied')
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )

    return () => {
      stopped = true
      window.clearTimeout(timer)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [tracking])

  const shownGps: Gps = tracking ? gps : 'off'
  const position = shownGps === 'on' ? here : null
  const visibleSheets = sheets
  const onSheet = new Set(visibleSheets.flatMap((sheet) => sheet.orderIds))
  const loose = orders.filter((order) => !onSheet.has(order.id))
  const assigned = sortDeliveries(
    loose.filter((order) => order.status === 'preparado' || order.status === 'asignado'),
    position,
  )
  const traveling = sortDeliveries(
    loose.filter((order) => order.status === 'en-viaje'),
    position,
  )
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

  async function startSheet(sheet: RouteSheet) {
    const accepted = await confirm('Iniciar recorrido', `Salís con los pedidos de la franja ${sheet.slot}.`)
    if (!accepted) return
    setStarting(sheet.id)
    const result = await startRouteSheet(sheet.id)
    setStarting('')
    if (!result.ok) {
      await error(result.message)
      return
    }
    await refresh({ silent: true })
    await success('Recorrido iniciado')
  }

  function sheetDirections(sheet: RouteSheet) {
    const pending = sheet.orderIds
      .map((id) => orders.find((order) => order.id === id))
      .filter((order): order is Order => Boolean(order))
      .filter((order) => order.status !== 'entregado')
    const origin = position ? `${position.lat},${position.lng}` : sheet.origin
    const limited = pending.slice(0, 3)
    return {
      link: mapsDirections(origin, limited.map((order) => stopPoint(order))),
      more: pending.length > 3,
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Mis entregas</h1>
        {user?.carrierName?.trim() ? <p>{user.carrierName}</p> : null}
      </header>
      <p className={`mt-3 text-sm font-semibold ${shownGps === 'on' ? 'text-lumi-ink' : 'text-lumi-muted'}`}>
        {shownGps === 'on' ? 'Ubicación activa' : 'Ubicación apagada'}
      </p>
      {shownGps === 'denied' && (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
          Activá la ubicación para ordenar las entregas
        </p>
      )}
      {visibleSheets.map((sheet) => {
        const stops = sheet.orderIds
          .map((id) => orders.find((order) => order.id === id))
          .filter((order): order is Order => Boolean(order))
        const directions = sheetDirections(sheet)
        return (
          <section key={sheet.id} className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                Hoja de ruta · Franja {sheet.slot} · {stops.length} parada
                {stops.length === 1 ? '' : 's'}
                {sheet.date !== today ? ` · ${sheet.date}` : ''}
              </h2>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {sheet.status === 'planificada' && (
                <button
                  type="button"
                  className="min-h-12 rounded-xl bg-lumi-yellow px-4 text-base font-semibold text-lumi-yellow-ink disabled:opacity-50"
                  disabled={starting === sheet.id}
                  onClick={() => void startSheet(sheet)}
                >
                  Iniciar recorrido
                </button>
              )}
              {directions.link ? (
                <>
                  <a
                    className="grid min-h-12 place-items-center rounded-xl bg-lumi-ink px-4 text-base font-semibold text-white"
                    href={directions.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Cómo llegar
                  </a>
                  {directions.more ? (
                    <p className="text-sm text-lumi-muted">Abrí de nuevo después de la parada 3</p>
                  ) : null}
                </>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {stops.map((order, index) => (
                <li key={order.id}>
                  <DeliveryCard
                    order={order}
                    distance=""
                    busy={busy === order.id}
                    stopLabel={`Parada ${index + 1} de ${stops.length}`}
                    allowLeave={sheet.status === 'en_curso'}
                    onLeave={() => void changeStatus(order, 'en-viaje')}
                    onDelivered={() => void changeStatus(order, 'entregado')}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
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
          {visible.map((order) => {
            const place = position ? pointOf(order) : null
            return (
              <li key={order.id}>
                <DeliveryCard
                  order={order}
                  distance={place && position ? formatDistance(haversine(position, place)) : ''}
                  busy={busy === order.id}
                  onLeave={() => void changeStatus(order, 'en-viaje')}
                  onDelivered={() => void changeStatus(order, 'entregado')}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function DeliveryCard({
  order,
  distance,
  busy,
  stopLabel,
  allowLeave = false,
  onLeave,
  onDelivered,
}: {
  order: Order
  distance: string
  busy: boolean
  stopLabel?: string
  allowLeave?: boolean
  onLeave: () => void
  onDelivered: () => void
}) {
  const maps = mapsLink(order.address ?? '')
  const notice = whatsappLink(order.phone ?? '', onTheWayText(order.client, order.id))
  const waiting = order.status === 'preparado'
  const canLeave = order.status === 'asignado'
  const canDeliver = order.status === 'en-viaje'
  const showLeave = canLeave && (!stopLabel || allowLeave)

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-lg font-bold">{order.id}</p>
        <span className={`status-pill status-${order.status}`}>{STATUS_PILL[order.status]}</span>
      </div>
      {stopLabel && <p className="mt-1 text-sm font-semibold">{stopLabel}</p>}
      <p className="mt-1 text-base font-semibold">{order.client}</p>
      <p className="mt-2 text-sm">{order.address || 'Sin dirección'}</p>
      {placeLine(order) && <p className="text-sm">{placeLine(order)}</p>}
      <p className="text-sm text-lumi-muted">{order.zone || 'Sin zona'}</p>
      {distance && <p className="mt-1 text-sm font-semibold">{distance}</p>}
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
          {showLeave && (
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
