import { normalizeTimeWindow } from './slot'

export function businessToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function minutesSince(iso: string | undefined, now = Date.now()) {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  return Math.max(0, Math.round((now - at) / 60000))
}

export function leftAgo(iso: string | undefined, now = Date.now()) {
  const minutes = minutesSince(iso, now)
  if (minutes === null) return ''
  if (minutes < 1) return 'salió hace un momento'
  if (minutes === 1) return 'salió hace 1 min'
  return `salió hace ${minutes} min`
}

export function clockTime(iso: string | undefined) {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

/** La franja ya terminó ese día, en hora de Buenos Aires. */
export function slotEnded(deliveryDate: string, timeWindow: string | undefined, now = Date.now()) {
  const window = normalizeTimeWindow(timeWindow)
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window)
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return false
  const end = Date.parse(`${deliveryDate}T${match[3]}:${match[4]}:00-03:00`)
  return Number.isFinite(end) && now > end
}

export function mapsDirections(origin: string, stops: string[]) {
  const pending = stops.map((stop) => stop.trim()).filter(Boolean)
  if (!origin.trim() || pending.length === 0) return ''
  const destination = pending[pending.length - 1]
  const waypoints = pending.slice(0, -1)
  const params = [
    'api=1',
    `origin=${encodeURIComponent(origin.trim())}`,
    `destination=${encodeURIComponent(destination)}`,
  ]
  if (waypoints.length > 0) params.push(`waypoints=${waypoints.map((stop) => encodeURIComponent(stop)).join('|')}`)
  return `https://www.google.com/maps/dir/?${params.join('&')}`
}

export function stopPoint(order: { lat?: number; lng?: number; address?: string }) {
  if (typeof order.lat === 'number' && typeof order.lng === 'number' && Number.isFinite(order.lat) && Number.isFinite(order.lng)) {
    return `${order.lat},${order.lng}`
  }
  return order.address?.trim() ?? ''
}
