import type { Order, OrderStatus } from '../data/orders'
import type { Role } from './authStore'

export const STATUS_RANK: Record<OrderStatus, number> = {
  pendiente: 0,
  preparado: 1,
  asignado: 2,
  'en-viaje': 3,
  entregado: 4,
}

export type TransitionRule = {
  from: OrderStatus
  to: OrderStatus
  roles: Role[]
  courierOnly?: boolean
  ownDelivery?: boolean
}

/** Misma tabla que server/src/orderFlow.js. */
export const TRANSITIONS: TransitionRule[] = [
  { from: 'pendiente', to: 'preparado', roles: ['deposito', 'encargado_deposito', 'admin'] },
  { from: 'preparado', to: 'asignado', roles: ['encargado_deposito', 'admin'] },
  {
    from: 'asignado',
    to: 'en-viaje',
    roles: ['chofer', 'admin'],
    ownDelivery: true,
  },
  {
    from: 'en-viaje',
    to: 'entregado',
    roles: ['chofer', 'admin'],
    ownDelivery: true,
  },
  {
    from: 'asignado',
    to: 'entregado',
    roles: ['encargado_deposito', 'admin'],
    courierOnly: true,
  },
  { from: 'preparado', to: 'pendiente', roles: ['encargado_deposito', 'admin'] },
  { from: 'asignado', to: 'preparado', roles: ['encargado_deposito', 'admin'] },
  { from: 'en-viaje', to: 'asignado', roles: ['admin'] },
  { from: 'entregado', to: 'en-viaje', roles: ['admin'] },
]

function isCourier(order: Pick<Order, 'dispatchType'>) {
  return order.dispatchType === 'correo'
}

export function statusChoices(role: Role, order: Pick<Order, 'status' | 'dispatchType'>): OrderStatus[] {
  return TRANSITIONS.filter((rule) => {
    if (rule.from !== order.status) return false
    if (!rule.roles.includes(role)) return false
    if (rule.courierOnly && !isCourier(order)) return false
    if (rule.ownDelivery && isCourier(order)) return false
    return true
  }).map((rule) => rule.to)
}

export function statusPillFor(order: Pick<Order, 'dispatchType'>, status: OrderStatus) {
  if (status === 'asignado' && isCourier(order)) return 'Despachado'
  const labels: Record<OrderStatus, string> = {
    pendiente: 'Pendiente',
    preparado: 'Preparado',
    asignado: 'Asignado',
    'en-viaje': 'En viaje',
    entregado: 'Entregado',
  }
  return labels[status]
}
