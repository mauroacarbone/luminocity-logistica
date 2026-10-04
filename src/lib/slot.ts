import type { Order } from '../data/orders'

export const SLOT_LIMIT = 3

/** "09:00 - 13:00", "9:00–13:00" y "9:00-13:00" quedan como 09:00-13:00. */
export function normalizeTimeWindow(value?: string) {
  if (!value) return ''
  const compact = value.trim().replace(/[–—]/g, '-').replace(/\s+/g, '')
  if (!compact) return ''
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(compact)
  if (!match) return compact
  const hour = (part: string) => part.padStart(2, '0')
  return `${hour(match[1])}:${match[2]}-${hour(match[3])}:${match[4]}`
}

export function driverSlotCount(orders: Order[], driverId: string, deliveryDate: string, timeWindow?: string) {
  const window = normalizeTimeWindow(timeWindow)
  if (!driverId || !window) return 0
  return orders.filter((order) => {
    return (
      order.driverId === driverId &&
      order.deliveryDate === deliveryDate &&
      normalizeTimeWindow(order.timeWindow) === window
    )
  }).length
}

export function shortSlotDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}`
}

export function slotQuestion(timeWindow: string, deliveryDate: string, count: number) {
  const pedidos = count === 1 ? 'pedido' : 'pedidos'
  return `Este chofer ya tiene ${count} ${pedidos} en la franja ${timeWindow} del ${shortSlotDate(deliveryDate)}. ¿Autorizás uno más?`
}
