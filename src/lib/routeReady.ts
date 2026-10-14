import { isOwnDelivery } from '../data/catalog'
import type { Order } from '../data/orders'
import type { RouteSheet } from './routeSheetsApi'
import { normalizeTimeWindow } from './slot'

export const WAITING_SHEET = 'Esperando hoja de ruta del encargado'

export function sheetIsReady(sheet: RouteSheet | undefined, orders: Order[]) {
  if (!sheet || sheet.status === 'cerrada' || sheet.stale === true) return false
  const slot = normalizeTimeWindow(sheet.slot)
  if (!sheet.driverId || !sheet.date || !slot) return false
  const ids = new Set(sheet.orderIds)
  const assigned = orders.filter(
    (order) =>
      order.status === 'asignado' &&
      order.driverId === sheet.driverId &&
      order.deliveryDate === sheet.date &&
      normalizeTimeWindow(order.timeWindow) === slot &&
      isOwnDelivery(order),
  )
  if (assigned.length === 0) return false
  return assigned.every((order) => ids.has(order.id))
}
