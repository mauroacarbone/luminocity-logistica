export type OrderPriority = 'normal' | 'alta' | 'inmediata'

export type OrderStatus =
  | 'pendiente'
  | 'preparado'
  | 'asignado'
  | 'en-viaje'
  | 'entregado'

export type OrderEditStatus = 'aplicada' | 'pendiente' | 'rechazada'

export type OrderEdit = {
  id: string
  by: string
  at: string
  reason: string
  changes: Record<string, unknown>
  status: OrderEditStatus
}

export type SlotOverride = {
  by: string
  at: string
  driverId?: string
  deliveryDate?: string
  timeWindow?: string
}

export type OrderHistoryVia =
  | 'pedidos'
  | 'despacho'
  | 'hoja'
  | 'mis-entregas'
  | 'qr'
  | 'picking'
  | 'panel'
  | 'retiros'

export type OrderHistoryEntry = {
  at: string
  by: { id: string; name: string }
  from: OrderStatus | null
  to: OrderStatus
  reason?: string
  via: OrderHistoryVia
}

export type PrepActor = { id: string; name: string }

export type PrepSession = {
  by: PrepActor
  start: string
  end?: string
}

export type OrderPreparation = {
  takenBy?: PrepActor
  takenAt?: string
  sessions: PrepSession[]
}

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
  floor?: string
  unit?: string
  doorbell?: string
  timeWindow?: string
  requiresPickup?: boolean
  dispatchType?: 'propia' | 'correo' | 'retiro'
  priority?: OrderPriority
  transporter?: string
  notes?: string
  attachmentName?: string
  attachmentDataUrl?: string
  receiverName?: string
  receiverDni?: string
  driverId?: string
  driverName?: string
  trackingNumber?: string
  assignedAt?: string
  departedAt?: string
  deliveredAt?: string
  routeId?: string
  routeSeq?: number
  /** true si el pedido está en una hoja aún planificada (no iniciada). */
  sheetPlanned?: boolean
  lat?: number
  lng?: number
  geoMiss?: boolean
  geoRetryAt?: string
  edits?: OrderEdit[]
  history?: OrderHistoryEntry[]
  slotOverrides?: SlotOverride[]
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  preparation?: OrderPreparation
  preparedBy?: PrepActor
  preparedAt?: string
  prepMs?: number | null
  prepIncomplete?: boolean
  prepChecklist?: { done: number; total: number }
}

export function isSlotOverride(value: unknown): value is SlotOverride {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.by === 'string' && item.by.length > 0 && typeof item.at === 'string' && item.at.length > 0
}

export function pendingEdit(order: Order) {
  return order.edits?.find((edit) => edit.status === 'pendiente')
}

export function isOrderEdit(value: unknown): value is OrderEdit {
  if (!value || typeof value !== 'object') return false
  const edit = value as Record<string, unknown>
  return (
    typeof edit.id === 'string' &&
    edit.id.length > 0 &&
    typeof edit.by === 'string' &&
    typeof edit.at === 'string' &&
    typeof edit.reason === 'string' &&
    (edit.status === 'aplicada' || edit.status === 'pendiente' || edit.status === 'rechazada') &&
    Boolean(edit.changes) &&
    typeof edit.changes === 'object' &&
    !Array.isArray(edit.changes)
  )
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
