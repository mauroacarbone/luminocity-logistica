import { isOwnDelivery } from '../data/catalog'
import type { Order } from '../data/orders'
import type { RouteSheet } from './routeSheetsApi'
import { normalizeTimeWindow } from './slot'

export const WAITING_SHEET = 'Esperando hoja de ruta del encargado'

export function departureBlock(order: Order, sheets: RouteSheet[], orders: Order[]) {
  const routeId = typeof order.routeId === 'string' ? order.routeId : ''
  const sheet = routeId
    ? sheets.find((item) => item.id === routeId)
    : sheets.find(
        (item) =>
          item.status !== 'cerrada' &&
          item.driverId === order.driverId &&
          item.date === order.deliveryDate &&
          normalizeTimeWindow(item.slot) === normalizeTimeWindow(order.timeWindow),
      )
  if (!sheet || sheet.status === 'cerrada') return 'No está en ninguna hoja abierta'
  if (sheet.driverId !== order.driverId) return 'La hoja es de otro chofer'
  if (!sheet.orderIds.includes(order.id)) return 'No está en ninguna hoja abierta'
  if (sheet.stale === true || !sheetCoversAssigned(sheet, orders)) return 'La hoja está desactualizada'
  return ''
}

function sheetCoversAssigned(sheet: RouteSheet, orders: Order[]) {
  const slot = normalizeTimeWindow(sheet.slot)
  const ids = new Set(sheet.orderIds)
  return !orders.some(
    (order) =>
      order.status === 'asignado' &&
      order.driverId === sheet.driverId &&
      order.deliveryDate === sheet.date &&
      normalizeTimeWindow(order.timeWindow) === slot &&
      isOwnDelivery(order) &&
      !ids.has(order.id),
  )
}

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
