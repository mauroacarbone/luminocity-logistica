import type { Order } from '../data/orders'

export const SLOT_LIMIT = 3

export function driverSlotCount(orders: Order[], driverId: string, deliveryDate: string, timeWindow?: string) {
  if (!driverId || !timeWindow) return 0
  return orders.filter((order) => {
    const status: string = order.status
    return (
      order.driverId === driverId &&
      order.deliveryDate === deliveryDate &&
      order.timeWindow === timeWindow &&
      status !== 'cancelado'
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
