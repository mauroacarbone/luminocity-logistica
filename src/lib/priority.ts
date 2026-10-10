import type { Order, OrderPriority } from '../data/orders'

export const PRIORITIES: OrderPriority[] = ['normal', 'alta', 'inmediata']

export const PRIORITY_LABEL: Record<OrderPriority, string> = {
  normal: 'Normal',
  alta: 'Alta',
  inmediata: 'Inmediata',
}

export const PRIORITY_RANK: Record<OrderPriority, number> = {
  inmediata: 0,
  alta: 1,
  normal: 2,
}

export function isOrderPriority(value: unknown): value is OrderPriority {
  return value === 'normal' || value === 'alta' || value === 'inmediata'
}

export function priorityOf(order: Pick<Order, 'priority'> | null | undefined): OrderPriority {
  return isOrderPriority(order?.priority) ? order.priority : 'normal'
}

export function comparePriority(
  left: Pick<Order, 'priority'> | null | undefined,
  right: Pick<Order, 'priority'> | null | undefined,
) {
  return PRIORITY_RANK[priorityOf(left)] - PRIORITY_RANK[priorityOf(right)]
}

/** Un entregado cuenta como normal para no subir por prioridad en listas mixtas. */
export function compareOpenPriority(left: Order, right: Order) {
  const rank = (order: Order) =>
    PRIORITY_RANK[order.status === 'entregado' ? 'normal' : priorityOf(order)]
  return rank(left) - rank(right)
}
