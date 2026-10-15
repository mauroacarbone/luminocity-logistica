import { loadToken } from './authStore'
import type { SlotFull } from './ordersApi'

export type RouteSheetStatus = 'planificada' | 'en_curso' | 'cerrada'

export type RouteSheet = {
  id: string
  driverId: string
  date: string
  slot: string
  origin: string
  orderIds: string[]
  km: number
  minutes: number
  status: RouteSheetStatus
  stale?: boolean
  createdBy: string
  createdAt: string
  startedAt?: string
  closedAt?: string
}

export type SheetFailure = { ok: false; status: number; message: string; code?: string; slot?: SlotFull }
export type SheetResult<T> = { ok: true; data: T } | SheetFailure

const STATUSES = new Set<RouteSheetStatus>(['planificada', 'en_curso', 'cerrada'])

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function codeFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('code' in data)) return undefined
  const code = data.code
  return typeof code === 'string' && code.trim() ? code : undefined
}

function slotFrom(data: unknown): SlotFull | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  if (record.code !== 'FRANJA_LLENA') return undefined
  if (typeof record.driver !== 'string' || !record.driver.trim()) return undefined
  if (typeof record.deliveryDate !== 'string' || typeof record.timeWindow !== 'string') return undefined
  if (typeof record.count !== 'number') return undefined
  return {
    driver: record.driver,
    deliveryDate: record.deliveryDate,
    timeWindow: record.timeWindow,
    count: record.count,
  }
}

export function isRouteSheet(value: unknown): value is RouteSheet {
  if (!value || typeof value !== 'object') return false
  const sheet = value as Record<string, unknown>
  return (
    typeof sheet.id === 'string' &&
    sheet.id.length > 0 &&
    typeof sheet.driverId === 'string' &&
    typeof sheet.date === 'string' &&
    typeof sheet.slot === 'string' &&
    typeof sheet.origin === 'string' &&
    Array.isArray(sheet.orderIds) &&
    sheet.orderIds.every((id) => typeof id === 'string') &&
    typeof sheet.km === 'number' &&
    typeof sheet.minutes === 'number' &&
    typeof sheet.status === 'string' &&
    STATUSES.has(sheet.status as RouteSheetStatus) &&
    typeof sheet.createdBy === 'string' &&
    typeof sheet.createdAt === 'string'
  )
}

async function request(path: string, method: string, body: unknown, fallback: string): Promise<SheetResult<unknown>> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401, message: 'Tenés que iniciar sesión.' }
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' }
  }
  if (response.status === 204) return { ok: true, data: null }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: messageFrom(data, fallback),
      code: codeFrom(data),
      slot: slotFrom(data),
    }
  }
  return { ok: true, data }
}

export async function listRouteSheets(date: string): Promise<SheetResult<RouteSheet[]>> {
  const result = await request(
    `/api/route-sheets?date=${encodeURIComponent(date)}`,
    'GET',
    undefined,
    'No se pudieron cargar las hojas de ruta.',
  )
  if (!result.ok) return result
  if (!Array.isArray(result.data) || !result.data.every(isRouteSheet)) {
    return { ok: false, status: 500, message: 'No se pudieron leer las hojas de ruta.' }
  }
  return { ok: true, data: result.data }
}

export function saveRouteSheet(
  input: {
    driverId: string
    date: string
    slot: string
    origin: string
    orderIds: string[]
    km: number
    minutes: number
  },
  override = false,
) {
  const body = override ? { ...input, override: true } : input
  return request('/api/route-sheets', 'POST', body, 'No se pudo guardar la hoja de ruta.')
}

export function deleteRouteSheet(id: string) {
  return request(
    `/api/route-sheets/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    'No se pudo borrar la hoja de ruta.',
  )
}

export type TripStop = {
  orderId: string
  zone: string
  delivered: boolean
}

export type DriverTrip = {
  id: string
  driverId: string
  driverName: string
  date: string
  slot: string
  status: RouteSheetStatus
  startedAt: string | null
  closedAt: string | null
  delivered: number
  undelivered: number
  zones: string[]
  km: number
  kmEstimated: boolean
  stops: TripStop[]
  amount: number | null
}

function isTripStop(value: unknown): value is TripStop {
  if (!value || typeof value !== 'object') return false
  const stop = value as Record<string, unknown>
  return (
    typeof stop.orderId === 'string' &&
    stop.orderId.length > 0 &&
    typeof stop.zone === 'string' &&
    stop.zone.trim().length > 0 &&
    typeof stop.delivered === 'boolean'
  )
}

function isDriverTrip(value: unknown): value is DriverTrip {
  if (!value || typeof value !== 'object') return false
  const trip = value as Record<string, unknown>
  return (
    typeof trip.id === 'string' &&
    trip.id.length > 0 &&
    typeof trip.driverId === 'string' &&
    typeof trip.driverName === 'string' &&
    typeof trip.date === 'string' &&
    typeof trip.slot === 'string' &&
    typeof trip.status === 'string' &&
    STATUSES.has(trip.status as RouteSheetStatus) &&
    (trip.startedAt === null || typeof trip.startedAt === 'string') &&
    (trip.closedAt === null || typeof trip.closedAt === 'string') &&
    typeof trip.delivered === 'number' &&
    typeof trip.undelivered === 'number' &&
    Array.isArray(trip.zones) &&
    trip.zones.every((zone) => typeof zone === 'string') &&
    typeof trip.km === 'number' &&
    typeof trip.kmEstimated === 'boolean' &&
    Array.isArray(trip.stops) &&
    trip.stops.every(isTripStop) &&
    (trip.amount === null || (typeof trip.amount === 'number' && Number.isFinite(trip.amount)))
  )
}

export async function listDriverTrips(
  from: string,
  to: string,
  driverId?: string,
): Promise<SheetResult<DriverTrip[]>> {
  const params = new URLSearchParams({ from, to })
  if (driverId) params.set('driverId', driverId)
  const result = await request(
    `/api/route-sheets/trips?${params.toString()}`,
    'GET',
    undefined,
    'No se pudieron cargar los viajes.',
  )
  if (!result.ok) return result
  if (!Array.isArray(result.data) || !result.data.every(isDriverTrip)) {
    return { ok: false, status: 500, message: 'No se pudieron leer los viajes.' }
  }
  return { ok: true, data: result.data }
}

export function finishRouteSheet(id: string) {
  return request(
    `/api/route-sheets/${encodeURIComponent(id)}/finish`,
    'POST',
    {},
    'No se pudo finalizar el viaje.',
  )
}

export function startRouteSheet(id: string) {
  return request(
    `/api/route-sheets/${encodeURIComponent(id)}/start`,
    'POST',
    {},
    'No se pudo iniciar el recorrido.',
  )
}
