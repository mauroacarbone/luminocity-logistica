export const DELIVERY_GRACE_MS = 30 * 60 * 1000

/** Igual que normalizeTimeWindow de orders.js y de src/lib/slot.ts. */
function normalizeTimeWindow(value) {
  if (typeof value !== 'string') return ''
  const compact = value.trim().replace(/[–—]/g, '-').replace(/\s+/g, '')
  if (!compact) return ''
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(compact)
  if (!match) return compact
  const hour = (part) => part.padStart(2, '0')
  return `${hour(match[1])}:${match[2]}-${hour(match[3])}:${match[4]}`
}

export const DELIVERED_TIMELINESS_LABEL = {
  antes: 'Entregado antes',
  'en-horario': 'En horario',
  'con-demora': 'Entregado con demora',
}

function slotInstant(deliveryDate, hours, minutes) {
  const at = Date.parse(`${deliveryDate}T${hours}:${minutes}:00-03:00`)
  return Number.isFinite(at) ? at : null
}

/** Inicio y fin de la franja, en hora de Buenos Aires (-03:00). */
export function slotRange(deliveryDate, timeWindow) {
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return null
  const window = normalizeTimeWindow(timeWindow)
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window)
  if (!match) return null
  const start = slotInstant(deliveryDate, match[1], match[2])
  const end = slotInstant(deliveryDate, match[3], match[4])
  if (start == null || end == null) return null
  return { start, end }
}

/**
 * 'antes' | 'en-horario' | 'con-demora' | null.
 * null si no está entregado, no tiene franja o no tiene deliveredAt.
 */
export function deliveredTimeliness(order) {
  if (!order || order.status !== 'entregado' || !order.deliveredAt) return null
  const at = Date.parse(order.deliveredAt)
  if (!Number.isFinite(at)) return null
  const range = slotRange(order.deliveryDate, order.timeWindow)
  if (!range) return null
  if (at < range.start) return 'antes'
  if (at <= range.end + DELIVERY_GRACE_MS) return 'en-horario'
  return 'con-demora'
}
