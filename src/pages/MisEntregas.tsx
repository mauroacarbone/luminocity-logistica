import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderStepper } from '../components/OrderStepper'
import { StopRouteMap, type MapStop } from '../components/StopRouteMap'
import { PriorityChip } from '../components/PriorityChip'
import { Badge } from '../components/ui'
import { type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { clearDriverLocation, postDriverLocation } from '../lib/driversApi'
import { mapsLink, onTheWayText, whatsappLink } from '../lib/whatsapp'
import { placeLine } from '../lib/place'
import { listRouteSheets, startRouteSheet, type RouteSheet } from '../lib/routeSheetsApi'
import { sheetIsReady, WAITING_SHEET } from '../lib/routeReady'
import { businessOffset, businessToday, googleNavigate, mapsRouteLegs, stopPoint, wazeNavigate } from '../lib/schedule'
import { compareDriverQueue, deliveryTimeliness, TIMELINESS_LABEL, timelinessTone } from '../lib/timeliness'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

type Tab = 'asignados' | 'en-viaje'
type Gps = 'off' | 'on' | 'denied'
type Point = { lat: number; lng: number }

const SEND_EVERY_MS = 30_000
const RELOAD_AFTER_MS = 4000
const coordsAsked = new Set<string>()

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

function sortDeliveries(list: Order[], now = Date.now()) {
  return [...list].sort((left, right) => compareDriverQueue(left, right, now))
}

export function MisEntregas() {
  const { user } = useAuth()
  const { orders, loading, error: ordersError, transitionOrder, refresh } = useOrders()
  const [tab, setTab] = useState<Tab>('asignados')
  const [busy, setBusy] = useState('')
  const [here, setHere] = useState<Point | null>(null)
  const [gps, setGps] = useState<Gps>('off')
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [sheetsError, setSheetsError] = useState('')
  const [starting, setStarting] = useState('')
  const today = businessToday()
  const tracking = !loading && !ordersError && orders.some((order) => order.status === 'en-viaje')
  const hadTraveling = useRef(false)
  const userId = user?.id

  useEffect(() => {
    let cancelled = false
    const yesterday = businessOffset(-1)
    const dates = new Set<string>([today, yesterday])
    for (const order of orders) {
      if (!order.sheetPlanned && !order.routeId) continue
      if (typeof order.deliveryDate === 'string' && order.deliveryDate.trim()) {
        dates.add(order.deliveryDate)
      }
    }
    void Promise.all([...dates].map((date) => listRouteSheets(date))).then((results) => {
      if (cancelled) return
      const failed = results.find((result) => !result.ok)
      if (failed && !failed.ok) {
        setSheetsError(failed.message)
      } else {
        setSheetsError('')
      }
      const open: RouteSheet[] = []
      for (const result of results) {
        if (!result.ok) continue
        for (const sheet of result.data) {
          if (open.some((item) => item.id === sheet.id)) continue
          if (sheet.status === 'cerrada' || sheet.date > today) continue
          open.push(sheet)
        }
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
  )
  const traveling = sortDeliveries(loose.filter((order) => order.status === 'en-viaje'))
  const assignedCount = orders.filter(
    (order) => order.status === 'preparado' || order.status === 'asignado',
  ).length
  const travelingCount = orders.filter((order) => order.status === 'en-viaje').length
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
    const result = await transitionOrder(order.id, { to: status, via: 'mis-entregas' })
    setBusy('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return
    }
    if (leaving) setTab('en-viaje')
    await success(
      leaving ? 'Pedido en viaje' : `Pedido ${order.id} entregado. Avisamos al vendedor.`,
    )
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

  return (
    <section className="page">
      <header className="page-header no-print">
        <h1>Mis entregas</h1>
        {user?.carrierName?.trim() ? <p>{user.carrierName}</p> : null}
      </header>
      <p className={`no-print mt-3 text-sm font-semibold ${shownGps === 'on' ? 'text-lumi-ink' : 'text-lumi-muted'}`}>
        {shownGps === 'on' ? 'Ubicación activa' : 'Ubicación apagada'}
      </p>
      {shownGps === 'denied' && (
        <p className="no-print mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
          Activá la ubicación para ordenar las entregas
        </p>
      )}
      {sheetsError && (
        <p className="no-print mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-lumi-danger shadow-sm">
          {sheetsError}
        </p>
      )}
      {visibleSheets.map((sheet) => {
        const stops = sheet.orderIds
          .map((id) => orders.find((order) => order.id === id))
          .filter((order): order is Order => Boolean(order))
        const sheetDateLabel = formatIsoDate(sheet.date)
        const nextId = stops.find((order) => order.status !== 'entregado')?.id
        const origin = position ? `${position.lat},${position.lng}` : sheet.origin
        const legs = mapsRouteLegs(origin, stops.map((order) => stopPoint(order)))
        const deliveredCount = stops.filter((order) => order.status === 'entregado').length
        const pendingCount = stops.length - deliveredCount
        const lateCount = stops.filter(
          (order) => order.status !== 'entregado' && deliveryTimeliness(order) === 'atrasado',
        ).length
        const packageCount = stops.reduce(
          (sum, order) => sum + (typeof order.packages === 'number' ? order.packages : 0),
          0,
        )
        const mapStops: MapStop[] = stops.flatMap((order, index) => {
          const place = pointOf(order)
          if (!place) return []
          return [
            {
              key: order.id,
              title: order.client,
              lat: place.lat,
              lng: place.lng,
              done: order.status === 'entregado',
              next: order.id === nextId,
              number: index + 1,
            },
          ]
        })
        return (
          <section key={sheet.id} className="driver-sheet mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">
                Hoja de ruta · {sheetDateLabel} · Franja {sheet.slot}
              </h2>
              <button
                type="button"
                className="no-print min-h-12 rounded-xl border border-lumi-line bg-white px-4 text-base font-semibold"
                onClick={() => window.print()}
              >
                Descargar PDF
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-base sm:grid-cols-3">
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Paradas</dt>
                <dd className="text-lg font-semibold">{stops.length}</dd>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Entregadas</dt>
                <dd className="text-lg font-semibold">{deliveredCount}</dd>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Pendientes</dt>
                <dd className="text-lg font-semibold">{pendingCount}</dd>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Atrasadas</dt>
                <dd className="text-lg font-semibold">{lateCount}</dd>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Bultos</dt>
                <dd className="text-lg font-semibold">{packageCount}</dd>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <dt className="text-sm text-lumi-muted">Recorrido</dt>
                <dd className="text-lg font-semibold">
                  {sheet.km > 0 || sheet.minutes > 0 ? `${sheet.km} km · ${sheet.minutes} min` : '—'}
                </dd>
              </div>
            </dl>
            <div className="no-print mt-3 flex flex-col gap-2">
              {sheet.status === 'planificada' && sheet.date <= today && (
                <>
                  {!sheetIsReady(sheet, orders) && (
                    <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
                      {WAITING_SHEET}
                    </p>
                  )}
                  <button
                    type="button"
                    className="min-h-12 rounded-xl bg-lumi-yellow px-4 text-base font-semibold text-lumi-yellow-ink disabled:opacity-50"
                    disabled={starting === sheet.id || !sheetIsReady(sheet, orders)}
                    onClick={() => void startSheet(sheet)}
                  >
                    Iniciar recorrido
                  </button>
                </>
              )}
              {sheet.status === 'planificada' && sheet.date > today && (
                <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm">
                  Se inicia el {sheetDateLabel}
                </p>
              )}
              {legs.map((leg) => (
                <a
                  key={leg.href}
                  className="grid min-h-12 place-items-center rounded-xl bg-lumi-ink px-4 text-base font-semibold text-white"
                  href={leg.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {leg.label}
                </a>
              ))}
            </div>
            <div className="mt-3 h-56 overflow-hidden rounded-2xl bg-border-strong">
              <StopRouteMap stops={mapStops} />
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {stops.map((order, index) => (
                <li key={order.id}>
                  <DeliveryCard
                    order={order}
                    distance=""
                    busy={busy === order.id}
                    stopNumber={index + 1}
                    inSheet
                    done={order.status === 'entregado'}
                    highlight={order.id === nextId}
                    allowLeave={sheet.status === 'en_curso'}
                    routeReady={sheetIsReady(sheet, orders)}
                    onLeave={() => void changeStatus(order, 'en-viaje')}
                    onDelivered={() => void changeStatus(order, 'entregado')}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <div className="view-toggle no-print mt-4" role="tablist" aria-label="Entregas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'asignados'}
          className={tab === 'asignados' ? 'active' : undefined}
          onClick={() => setTab('asignados')}
        >
          Asignados
          <span>{assignedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'en-viaje'}
          className={tab === 'en-viaje' ? 'active' : undefined}
          onClick={() => setTab('en-viaje')}
        >
          En viaje
          <span>{travelingCount}</span>
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="no-print mt-6 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
          {(tab === 'asignados' ? assignedCount : travelingCount) > 0
            ? 'Tus entregas están en la hoja de ruta de arriba.'
            : 'No hay entregas.'}
        </p>
      ) : (
        <ul className="no-print mt-4 flex flex-col gap-3">
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
  stopNumber,
  inSheet = false,
  done = false,
  highlight = false,
  allowLeave = false,
  routeReady = false,
  onLeave,
  onDelivered,
}: {
  order: Order
  distance: string
  busy: boolean
  stopNumber?: number
  inSheet?: boolean
  done?: boolean
  highlight?: boolean
  allowLeave?: boolean
  routeReady?: boolean
  onLeave: () => void
  onDelivered: () => void
}) {
  const place = pointOf(order)
  const maps = inSheet ? googleNavigate(stopPoint(order)) : mapsLink(order.address ?? '')
  const waze = place ? wazeNavigate(place.lat, place.lng) : ''
  const notice = whatsappLink(order.phone ?? '', onTheWayText(order.client, order.id))
  const punctuality = deliveryTimeliness(order)
  const waiting = order.status === 'preparado'
  const canLeave = order.status === 'asignado'
  const canDeliver = order.status === 'en-viaje'
  const showLeave = canLeave && !order.sheetPlanned && (!inSheet || allowLeave)
  const plannedNotice = canLeave && Boolean(order.sheetPlanned)
  const strike = done ? 'line-through' : ''

  return (
    <article className={`rounded-2xl bg-white p-4 shadow-sm ${highlight ? 'ring-2 ring-lumi-yellow' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {stopNumber != null && (
          <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-lumi-yellow text-sm font-semibold text-lumi-yellow-ink">
            {stopNumber}
          </span>
        )}
        <p className={`text-lg font-bold ${strike}`}>{order.id}</p>
        <PriorityChip order={order} showNormal />
        <Badge tone={timelinessTone(punctuality)}>{TIMELINESS_LABEL[punctuality]}</Badge>
        <OrderStepper order={order} variant="compact" />
      </div>
      <p className={`mt-1 text-lg font-semibold ${strike}`}>{order.client}</p>
      <p className={`mt-2 text-base ${strike}`}>{order.address || 'Sin dirección'}</p>
      {placeLine(order) && <p className="text-base">{placeLine(order)}</p>}
      <p className="text-base text-lumi-muted">{order.zone || 'Sin zona'}</p>
      {distance && <p className="mt-1 text-base font-semibold">{distance}</p>}
      {inSheet && <p className="mt-2 text-base">Franja: {order.timeWindow || '—'}</p>}
      <p className="text-base">Teléfono: {order.phone || '—'}</p>
      <p className="text-base">Bultos: {order.packages ?? '—'}</p>
      {inSheet && <p className="text-base">Notas: {order.notes?.trim() || '—'}</p>}
      <p className="mt-2">
        <Link className="order-link text-sm font-semibold" to={`/pedidos/${order.id}`}>
          Ver detalle
        </Link>
      </p>
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
              {inSheet ? 'Navegar' : 'Cómo llegar'}
            </a>
          ) : (
            <button type="button" className="min-h-12 rounded-xl bg-lumi-line px-4 text-base font-semibold" disabled>
              {inSheet ? 'Navegar' : 'Cómo llegar'}
            </button>
          )}
          {inSheet && waze && (
            <a
              className="grid min-h-12 place-items-center rounded-xl border border-lumi-line px-4 text-base font-semibold"
              href={waze}
              target="_blank"
              rel="noreferrer"
            >
              Waze
            </a>
          )}
          {plannedNotice && routeReady && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm font-semibold">
              En hoja de ruta planificada para el {formatIsoDate(order.deliveryDate)}. Salís con
              «Iniciar recorrido».
            </p>
          )}
          {canLeave && !routeReady && !inSheet && (
            <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm">{WAITING_SHEET}</p>
          )}
          {showLeave && (
            <button
              type="button"
              className="min-h-12 rounded-xl bg-lumi-yellow px-4 text-base font-semibold text-lumi-yellow-ink disabled:opacity-50"
              disabled={busy || !routeReady}
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
              className="min-h-12 rounded-xl bg-success px-4 text-base font-semibold text-inverse disabled:opacity-50"
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
