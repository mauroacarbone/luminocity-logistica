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
  packages?: number
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
  dispatchType?: 'propia' | 'correo'
  transporter?: string
  notes?: string
  attachmentName?: string
  attachmentDataUrl?: string
  receiverName?: string
  receiverDni?: string
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendientes',
  preparado: 'Preparados',
  asignado: 'Asignados',
  'en-viaje': 'En viaje',
  entregado: 'Entregados',
}

export const STATUS_PILL: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  preparado: 'Preparado',
  asignado: 'Asignado',
  'en-viaje': 'En viaje',
  entregado: 'Entregado',
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
