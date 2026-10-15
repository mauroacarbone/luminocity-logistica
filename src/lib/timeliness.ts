import type { Order } from '../data/orders'
import { compareOpenPriority } from './priority'
import { normalizeTimeWindow } from './slot'

export type Timeliness = 'en-horario' | 'por-vencer' | 'atrasado'

export const TIMELINESS_LABEL: Record<Timeliness, string> = {
  'en-horario': 'En horario',
  'por-vencer': 'Por vencer',
  atrasado: 'Atrasado',
}

const ZONE = 'America/Argentina/Buenos_Aires'
const HOUR_MS = 60 * 60 * 1000

/** Fecha calendario en Buenos Aires para un instante. */
export function businessDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

function slotInstant(deliveryDate: string, hours: string, minutes: string) {
  const at = Date.parse(`${deliveryDate}T${hours}:${minutes}:00-03:00`)
  return Number.isFinite(at) ? at : null
}

/** Inicio y fin de la franja, en hora de Buenos Aires. */
export function slotRange(deliveryDate: string | undefined, timeWindow: string | undefined) {
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
 * Puntualidad de una entrega respecto de ahora.
 * Atrasado: la fecha ya pasó o terminó la franja.
 * Por vencer: faltan 60 minutos o menos.
 * En horario: falta más de una hora para el fin de la franja.
 */
export function deliveryTimeliness(
  order: Pick<Order, 'deliveryDate' | 'timeWindow'>,
  now = Date.now(),
): Timeliness {
  const date = order.deliveryDate ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < businessDate(now)) return 'atrasado'
  const range = slotRange(date, order.timeWindow)
  if (!range) return 'en-horario'
  if (now >= range.end) return 'atrasado'
  if (range.end - now <= HOUR_MS) return 'por-vencer'
  return 'en-horario'
}

export { timelinessTone } from '../components/ui/tones'

/** Atrasados primero, después prioridad y después el inicio de la franja. */
export function compareDriverQueue(left: Order, right: Order, now = Date.now()) {
  const late = (order: Order) => (deliveryTimeliness(order, now) === 'atrasado' ? 0 : 1)
  const byLate = late(left) - late(right)
  if (byLate !== 0) return byLate
  const byPriority = compareOpenPriority(left, right)
  if (byPriority !== 0) return byPriority
  const leftStart = slotRange(left.deliveryDate, left.timeWindow)?.start ?? Number.MAX_SAFE_INTEGER
  const rightStart = slotRange(right.deliveryDate, right.timeWindow)?.start ?? Number.MAX_SAFE_INTEGER
  if (leftStart !== rightStart) return leftStart - rightStart
  return left.id.localeCompare(right.id, 'es')
}
