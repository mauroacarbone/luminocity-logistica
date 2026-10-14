import { normalizeTimeWindow } from './slot'

export function businessToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Día hábil corrido en calendario (America/Argentina), p. ej. -1 = ayer. */
export function businessOffset(days: number) {
  const today = businessToday()
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export type MapsLeg = { label: string; href: string }

/** Recorrido en Google Maps. Más de 9 paradas intermedias se parte en tramos. */
export function mapsRouteLegs(origin: string, stops: string[]): MapsLeg[] {
  const points = [origin.trim(), ...stops.map((stop) => stop.trim())].filter(Boolean)
  if (points.length < 2) return []
  const hrefs: string[] = []
  let start = 0
  while (start < points.length - 1) {
    const end = Math.min(start + 10, points.length - 1)
    const via = points.slice(start + 1, end)
    const params = [
      'api=1',
      `origin=${encodeURIComponent(points[start])}`,
      `destination=${encodeURIComponent(points[end])}`,
      'travelmode=driving',
    ]
    if (via.length > 0) params.push(`waypoints=${via.map((stop) => encodeURIComponent(stop)).join('|')}`)
    hrefs.push(`https://www.google.com/maps/dir/?${params.join('&')}`)
    if (end >= points.length - 1) break
    start = end
  }
  const many = hrefs.length > 1
  return hrefs.map((href, index) => ({
    href,
    label: many ? `Tramo ${index + 1}` : 'Abrir recorrido en GPS',
  }))
}

export function googleNavigate(point: string) {
  const destination = point.trim()
  if (!destination) return ''
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
}

export function wazeNavigate(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
}

export function stopPoint(order: { lat?: number; lng?: number; address?: string }) {
  if (typeof order.lat === 'number' && typeof order.lng === 'number' && Number.isFinite(order.lat) && Number.isFinite(order.lng)) {
    return `${order.lat},${order.lng}`
  }
  return order.address?.trim() ?? ''
}
