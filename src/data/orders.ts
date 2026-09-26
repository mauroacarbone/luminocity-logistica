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
  address?: string
  loadedAt: string
  deliveryDate: string
  status: OrderStatus
  seller?: string
  phone?: string
  invoices?: string[]
  collectOnDelivery?: boolean
  amount?: string
  betweenStreet1?: string
  betweenStreet2?: string
  propertyType?: string
  timeWindow?: string
  requiresPickup?: boolean
  transporter?: string
  notes?: string
  attachmentName?: string
  receiverName?: string
  receiverDni?: string
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

export function ordersByStatus(list: Order[], status: OrderStatus) {
  return list.filter((order) => order.status === status)
}
