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

/** Camino hacia adelante según la tabla de transiciones y el tipo de despacho. */
export function forwardPath(order: Pick<Order, 'dispatchType'>): OrderStatus[] {
  const path: OrderStatus[] = ['pendiente']
  let at: OrderStatus = 'pendiente'
  const seen = new Set<OrderStatus>()
  while (at !== 'entregado' && !seen.has(at)) {
    seen.add(at)
    const next = TRANSITIONS.find((rule) => {
      if (rule.from !== at) return false
      if (STATUS_RANK[rule.to] <= STATUS_RANK[rule.from]) return false
      if (rule.courierOnly && !isCourier(order)) return false
      if (rule.ownDelivery && isCourier(order)) return false
      return true
    })
    if (!next) break
    path.push(next.to)
    at = next.to
  }
  return path
}

export type FlowAction = {
  to: OrderStatus
  label: string
}

function allowedTransitions(
  role: Role,
  order: Pick<Order, 'status' | 'dispatchType'>,
  direction: 'forward' | 'back',
) {
  return TRANSITIONS.filter((rule) => {
    if (rule.from !== order.status) return false
    if (!rule.roles.includes(role)) return false
    if (rule.courierOnly && !isCourier(order)) return false
    if (rule.ownDelivery && isCourier(order)) return false
    const forward = STATUS_RANK[rule.to] > STATUS_RANK[rule.from]
    return direction === 'forward' ? forward : !forward
  })
}

function forwardLabel(order: Pick<Order, 'dispatchType'>, to: OrderStatus) {
  if (to === 'preparado') return 'Marcar preparado'
  if (to === 'asignado') return isCourier(order) ? 'Despachar' : 'Asignar chofer'
  if (to === 'en-viaje') return 'Iniciar viaje'
  if (to === 'entregado') return 'Marcar entregado'
  return statusPillFor(order, to)
}

/** Siguiente paso hacia adelante que este rol puede hacer ahora. */
export function nextAction(
  role: Role,
  order: Pick<Order, 'status' | 'dispatchType' | 'sheetPlanned'>,
): FlowAction | null {
  const forwards = allowedTransitions(role, order, 'forward').filter((rule) => {
    if (rule.to === 'en-viaje' && order.sheetPlanned) return false
    return true
  })
  if (forwards.length === 0) return null
  const path = forwardPath(order)
  const index = path.indexOf(order.status)
  const preferred = index >= 0 ? path[index + 1] : undefined
  const rule = forwards.find((item) => item.to === preferred) ?? forwards[0]
  return { to: rule.to, label: forwardLabel(order, rule.to) }
}

/** Pasos hacia atrás permitidos para este rol. */
export function backActions(
  role: Role,
  order: Pick<Order, 'status' | 'dispatchType'>,
): FlowAction[] {
  return allowedTransitions(role, order, 'back').map((rule) => ({
    to: rule.to,
    label: `Volver a ${statusPillFor(order, rule.to)}`,
  }))
}
