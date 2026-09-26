export type OrderStatus =
  | 'pendiente'
  | 'preparado'
  | 'asignado'
  | 'en-viaje'
  | 'entregado'

export type Order = {
  id: string
  client: string
  zone?: string
  loadedAt: string
  deliveryDate: string
  status: OrderStatus
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendientes',
  preparado: 'Preparados',
  asignado: 'Asignados',
  'en-viaje': 'En viaje',
  entregado: 'Entregados',
}

export const STATUS_ORDER: OrderStatus[] = [
  'pendiente',
  'preparado',
  'asignado',
  'en-viaje',
  'entregado',
]

export const orders: Order[] = []

export function ordersByStatus(status: OrderStatus) {
  return orders.filter((order) => order.status === status)
}
