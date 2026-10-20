import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { OrderStepper } from '../components/OrderStepper'
import { StopRouteMap, type MapStop } from '../components/StopRouteMap'
import { PriorityChip } from '../components/PriorityChip'
import { FinishTripDialog } from '../components/FinishTripDialog'
import { ChoiceGroup } from '../components/ChoiceGroup'
import { Badge, Button, Drawer, EmptyState, KpiCard, Page, PageHeader } from '../components/ui'
import { type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { clearDriverLocation, postDriverLocation } from '../lib/driversApi'
import { mapsLink, onTheWayText, whatsappLink } from '../lib/whatsapp'
import { placeLine } from '../lib/place'
import { finishRouteSheet, listRouteSheets, startRouteSheet, type RouteSheet } from '../lib/routeSheetsApi'
import { departureBlock, sheetIsReady, WAITING_SHEET } from '../lib/routeReady'
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
const SHEETS_EVERY_MS = 60_000
const coordsAsked = new Set<string>()

function sheetPrimary(sheet: RouteSheet, role: string | undefined, today: string, canFinish: boolean) {
  if (sheet.status === 'en_curso' && canFinish) return 'finish' as const
  if (role === 'chofer' && sheet.status === 'planificada' && sheet.date <= today) return 'start' as const
  return null
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

function sortDeliveries(list: Order[], now = Date.now()) {
  return [...list].sort((left, right) => compareDriverQueue(left, right, now))
}

export function MisEntregas() {
  const { user } = useAuth()
  const { orders, loading, error: ordersError, transitionOrder, refresh } = useOrders()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('asignados')
  const [busy, setBusy] = useState('')
  const [here, setHere] = useState<Point | null>(null)
  const [gps, setGps] = useState<Gps>('off')
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [sheetsError, setSheetsError] = useState('')
  const [starting, setStarting] = useState('')
  const [finishTarget, setFinishTarget] = useState<RouteSheet | null>(null)
  const [finishing, setFinishing] = useState(false)
  const today = businessToday()
  const canFinish = user?.role === 'chofer'
  const tracking =
    user?.role === 'chofer' && !loading && !ordersError && orders.some((order) => order.status === 'en-viaje')
  const hadTraveling = useRef(false)
  const userId = user?.id

  useEffect(() => {
    let cancelled = false
    function loadSheets() {
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
            if (sheet.status === 'cerrada') continue
            open.push(sheet)
          }
        }
        open.sort((left, right) => {
          if (left.date !== right.date) return left.date < right.date ? -1 : 1
          if (left.slot !== right.slot) return left.slot < right.slot ? -1 : 1
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
        })
        setSheets(open)
      })
    }
    loadSheets()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadSheets()
    }, SHEETS_EVERY_MS)
    function onVisibility() {
      if (document.visibilityState === 'visible') loadSheets()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
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
  const headerSheet = visibleSheets.find((sheet) => sheetPrimary(sheet, user?.role, today, canFinish))
  const headerKind = headerSheet ? sheetPrimary(headerSheet, user?.role, today, canFinish) : null
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
  const openId = searchParams.get('pedido') || searchParams.get('id')
  const openOrder = orders.find((order) => order.id === openId) ?? null
  const missingDetail = useRef('')

  const closeDetail = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('pedido')
        next.delete('id')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  useEffect(() => {
    if (!openId) {
      missingDetail.current = ''
      return
    }
    if (loading || openOrder) return
    if (missingDetail.current === openId) return
    missingDetail.current = openId
    void error('Ese pedido ya no está en tus entregas.')
    closeDetail()
  }, [loading, openId, openOrder, closeDetail])

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

  async function finishSheet(reasons?: Record<string, { reason: string; note?: string }>) {
    if (!finishTarget) return
    setFinishing(true)
    const result = await finishRouteSheet(finishTarget.id, reasons)
    setFinishing(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    setSheets((current) => current.filter((item) => item.id !== finishTarget.id))
    setFinishTarget(null)
    await refresh({ silent: true })
    await success('Viaje finalizado')
  }

  return (
    <Page>
      <PageHeader
        className="no-print"
        title="Mis entregas"
        subtitle={user?.carrierName?.trim() || undefined}
        actions={
          headerSheet && headerKind === 'finish' ? (
            <Button
              variant="primary"
              size="lg"
              disabled={finishing}
              onClick={() => setFinishTarget(headerSheet)}
            >
              Finalizar viaje
            </Button>
          ) : headerSheet && headerKind === 'start' ? (
            <Button
              variant="primary"
              size="lg"
              disabled={starting === headerSheet.id || !sheetIsReady(headerSheet, orders)}
              onClick={() => void startSheet(headerSheet)}
            >
              Iniciar recorrido
            </Button>
          ) : undefined
        }
      />
      {user?.role === 'chofer' && (
        <div className="no-print mt-3">
          <Badge tone={shownGps === 'on' ? 'success' : 'neutral'}>
            {shownGps === 'on' ? 'Ubicación activa' : 'Ubicación apagada'}
          </Badge>
        </div>
      )}
      {user?.role === 'chofer' && shownGps === 'denied' && (
        <p className="no-print mt-3 text-sm text-muted">Activá la ubicación para ordenar las entregas</p>
      )}
      {sheetsError && <p className="no-print mt-4 text-sm font-semibold text-danger">{sheetsError}</p>}
      {visibleSheets.map((sheet) => {
        const stops = sheet.orderIds
          .map((id) => orders.find((order) => order.id === id))
          .filter((order): order is Order => Boolean(order))
        const sheetDateLabel = formatIsoDate(sheet.date)
        const nextId = stops.find((order) => order.status !== 'entregado')?.id
        const origin = position ? `${position.lat},${position.lng}` : sheet.origin
        const pendingStops = stops.filter((order) => order.status !== 'entregado')
        const legs = mapsRouteLegs(
          origin,
          pendingStops.map((order) => stopPoint(order)),
        )
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
            <h2 className="text-xl font-semibold">
              Hoja de ruta · {sheetDateLabel} · Franja {sheet.slot}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <KpiCard title="Paradas" value={stops.length} />
              <KpiCard title="Entregadas" value={deliveredCount} />
              <KpiCard title="Pendientes" value={pendingCount} />
              <KpiCard
                title="Atrasadas"
                value={<span className={lateCount > 0 ? 'text-danger' : undefined}>{lateCount}</span>}
              />
              <KpiCard title="Bultos" value={packageCount} />
              <KpiCard
                title="Recorrido"
                value={sheet.km > 0 || sheet.minutes > 0 ? `${sheet.km} km · ${sheet.minutes} min` : '—'}
              />
            </div>
            <div className="no-print mt-3 flex flex-col gap-2">
              {sheet.status === 'en_curso' && canFinish && sheet.id !== headerSheet?.id && (
                <Button variant="secondary" size="lg" fullWidth disabled={finishing} onClick={() => setFinishTarget(sheet)}>
                  Finalizar viaje
                </Button>
              )}
              {user?.role === 'chofer' && sheet.status === 'planificada' && sheet.date <= today && (
                <>
                  {!sheetIsReady(sheet, orders) && (
                    <p className="rounded-md border border-border px-4 py-3 text-sm font-semibold">
                      {WAITING_SHEET}
                    </p>
                  )}
                  {sheet.id !== headerSheet?.id && (
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      disabled={starting === sheet.id || !sheetIsReady(sheet, orders)}
                      onClick={() => void startSheet(sheet)}
                    >
                      Iniciar recorrido
                    </Button>
                  )}
                </>
              )}
              {sheet.status === 'planificada' && sheet.date > today && (
                <p className="rounded-md border border-border px-4 py-3 text-sm font-semibold">
                  Se inicia el {sheetDateLabel}
                </p>
              )}
              {legs.map((leg) => (
                <a
                  key={leg.href}
                  className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] border border-border bg-btn-secondary px-5 text-base font-semibold text-text"
                  href={leg.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {leg.label}
                </a>
              ))}
            </div>
            <div className="mt-3 h-56 overflow-hidden rounded-md border border-border bg-surface">
              <StopRouteMap stops={mapStops} />
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              {stops.map((order, index) => (
                <DeliveryCard
                  key={order.id}
                  order={order}
                  distance=""
                  busy={busy === order.id}
                  stopNumber={index + 1}
                  inSheet
                  done={order.status === 'entregado'}
                  highlight={order.id === nextId}
                  allowLeave={sheet.status === 'en_curso'}
                  routeReady={!departureBlock(order, sheets, orders)}
                  sheetNotice={departureBlock(order, sheets, orders)}
                  onLeave={() => void changeStatus(order, 'en-viaje')}
                  onDelivered={() => void changeStatus(order, 'entregado')}
                />
              ))}
            </div>
          </section>
        )
      })}
      {finishTarget ? (
        <FinishTripDialog
          sheet={finishTarget}
          orders={orders}
          busy={finishing}
          onClose={() => {
            if (!finishing) setFinishTarget(null)
          }}
          onConfirm={(reasons) => void finishSheet(reasons)}
        />
      ) : null}
      <div className="mt-4">
        <ChoiceGroup
          label="Entregas"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'asignados', label: 'Asignados', count: assignedCount },
            { value: 'en-viaje', label: 'En viaje', count: travelingCount },
          ]}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          variant="plain"
          className="no-print"
          title={
            (tab === 'asignados' ? assignedCount : travelingCount) > 0
              ? 'Tus entregas están en la hoja de ruta de arriba.'
              : 'No hay entregas.'
          }
        />
      ) : (
        <div className="no-print mt-4 overflow-hidden rounded-md border border-border">
          {visible.map((order) => {
            const place = position ? pointOf(order) : null
            return (
              <DeliveryCard
                key={order.id}
                order={order}
                distance={place && position ? formatDistance(haversine(position, place)) : ''}
                busy={busy === order.id}
                routeReady={!departureBlock(order, sheets, orders)}
                sheetNotice={departureBlock(order, sheets, orders)}
                onLeave={() => void changeStatus(order, 'en-viaje')}
                onDelivered={() => void changeStatus(order, 'entregado')}
              />
            )
          })}
        </div>
      )}
      {openOrder ? (
        <Drawer
          open
          onClose={closeDetail}
          title={openOrder.id}
          subtitle={openOrder.client.toUpperCase()}
          footer={
            <DriverDetailActions
              order={openOrder}
              busy={busy === openOrder.id}
              inSheet={sheets.some(
                (sheet) => sheet.status !== 'cerrada' && sheet.orderIds.includes(openOrder.id),
              )}
              allowLeave={sheets.some(
                (sheet) => sheet.status === 'en_curso' && sheet.orderIds.includes(openOrder.id),
              )}
              routeReady={!departureBlock(openOrder, sheets, orders)}
              sheetNotice={departureBlock(openOrder, sheets, orders)}
              onLeave={() => void changeStatus(openOrder, 'en-viaje')}
              onDelivered={() => void changeStatus(openOrder, 'entregado')}
            />
          }
        >
          <div className="flex flex-col gap-4">
            <OrderStepper order={openOrder} variant="full" />
            <OrderDetail order={openOrder} />
          </div>
        </Drawer>
      ) : null}
    </Page>
  )
}

const LEFT_BY_EDIT = /Salió de la hoja .+ por edición/

function waitingCopy(order: Order, sheetNotice: string) {
  const recent = (order.history ?? []).slice(-5)
  if (recent.some((entry) => LEFT_BY_EDIT.test(entry.reason ?? ''))) {
    return 'El pedido cambió y el encargado tiene que volver a planificarlo'
  }
  return sheetNotice || WAITING_SHEET
}

function DriverDetailActions({
  order,
  busy,
  inSheet,
  allowLeave,
  routeReady,
  sheetNotice,
  onLeave,
  onDelivered,
}: {
  order: Order
  busy: boolean
  inSheet: boolean
  allowLeave: boolean
  routeReady: boolean
  sheetNotice: string
  onLeave: () => void
  onDelivered: () => void
}) {
  const waiting = order.status === 'preparado'
  const canLeave = order.status === 'asignado'
  const canDeliver = order.status === 'en-viaje'
  const showLeave = canLeave && !order.sheetPlanned && (!inSheet || allowLeave)
  if (waiting) {
    return <p className="w-full text-sm font-semibold">Esperando asignación del encargado</p>
  }
  return (
    <div className="flex w-full flex-col gap-2">
      {order.sheetPlanned && (
        <p className="rounded-md border border-border px-3 py-2 text-sm font-semibold">
          En hoja de ruta planificada para el {formatIsoDate(order.deliveryDate)}
        </p>
      )}
      {canLeave && !routeReady && !order.sheetPlanned && (
        <p className="rounded-md border border-border px-3 py-2 text-sm font-semibold">
          {waitingCopy(order, sheetNotice)}
        </p>
      )}
      {showLeave && (
        <Button variant="primary" size="lg" fullWidth disabled={busy || !routeReady} onClick={onLeave}>
          Salir a reparto
        </Button>
      )}
      {canDeliver && (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={onDelivered}>
          Confirmar entrega
        </Button>
      )}
    </div>
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
  sheetNotice = '',
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
  sheetNotice?: string
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
  const strike = done ? 'line-through' : ''

  return (
    <div className={`driver-stop border-b border-border px-4 py-3 last:border-b-0 ${highlight ? 'bg-surface-2' : ''}`}>
      <div className="flex items-start gap-3">
        {stopNumber != null && (
          <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
            {stopNumber}
          </span>
        )}
        <div className="min-w-0">
          <p className={`font-semibold ${strike}`}>{order.client}</p>
          <p className={`text-sm text-muted ${strike}`}>{order.address || 'Sin dirección'}</p>
          <p className="text-sm text-muted">{order.timeWindow || 'Sin franja'}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className={`text-sm font-semibold ${strike}`}>{order.id}</p>
        <PriorityChip order={order} showNormal />
        {order.status !== 'entregado' && (
          <Badge tone={timelinessTone(punctuality)}>{TIMELINESS_LABEL[punctuality]}</Badge>
        )}
        <OrderStepper order={order} variant="compact" />
      </div>
      {placeLine(order) && <p className="mt-1 text-sm text-muted">{placeLine(order)}</p>}
      <p className="text-sm text-muted">{order.zone || 'Sin zona'}</p>
      {distance && <p className="mt-1 text-sm font-semibold">{distance}</p>}
      <p className="text-sm text-muted">Teléfono: {order.phone || '—'}</p>
      <p className="text-sm text-muted">Bultos: {order.packages ?? '—'}</p>
      {inSheet && <p className="text-sm text-muted">Notas: {order.notes?.trim() || '—'}</p>}
      <p className="mt-2">
        <Link
          className="text-sm font-semibold text-accent hover:underline"
          to={`/mis-entregas?pedido=${encodeURIComponent(order.id)}`}
        >
          Ver detalle
        </Link>
      </p>
      {waiting ? (
        <p className="mt-4 text-sm font-semibold">Esperando asignación del encargado</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {maps ? (
            <a
              className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] border border-border bg-btn-secondary px-5 text-base font-semibold text-text hover:bg-btn-secondary-hover"
              href={maps}
              target="_blank"
              rel="noreferrer"
            >
              {inSheet ? 'Navegar' : 'Cómo llegar'}
            </a>
          ) : (
            <Button variant="secondary" size="lg" fullWidth disabled>
              {inSheet ? 'Navegar' : 'Cómo llegar'}
            </Button>
          )}
          {inSheet && waze && (
            <a
              className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] border border-border bg-btn-secondary px-5 text-base font-semibold text-text"
              href={waze}
              target="_blank"
              rel="noreferrer"
            >
              Waze
            </a>
          )}
          {order.sheetPlanned && (
            <p className="rounded-md border border-border px-3 py-2 text-sm font-semibold">
              En hoja de ruta planificada para el {formatIsoDate(order.deliveryDate)}
            </p>
          )}
          {canLeave && !routeReady && !order.sheetPlanned && (
            <p className="rounded-md border border-border px-3 py-2 text-sm font-semibold">
              {waitingCopy(order, sheetNotice)}
            </p>
          )}
          {showLeave && (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={busy || !routeReady}
              onClick={onLeave}
            >
              Salir a reparto
            </Button>
          )}
          {order.status === 'en-viaje' &&
            (notice ? (
              <a
                className="inline-flex h-[52px] w-full items-center justify-center rounded-[10px] border border-border bg-btn-secondary px-5 text-base font-semibold text-text"
                href={notice}
                target="_blank"
                rel="noreferrer"
              >
                Avisar al cliente
              </a>
            ) : (
              <Button variant="secondary" size="lg" fullWidth disabled>
                Avisar al cliente
              </Button>
            ))}
          {canDeliver && (
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              className="border border-border"
              disabled={busy}
              onClick={onDelivered}
            >
              Confirmar entrega
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
