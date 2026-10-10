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

/** Prioridad solo entre pedidos abiertos; un entregado no sube por prioridad. */
export function compareOpenPriority(left: Order, right: Order) {
  if (left.status === 'entregado' || right.status === 'entregado') return 0
  return comparePriority(left, right)
}
