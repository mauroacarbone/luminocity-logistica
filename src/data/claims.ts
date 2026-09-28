export const CLAIM_MOTIVES = [
  'Falla técnica / Garantía',
  'Error de despacho (Producto equivocado)',
  'Faltante de accesorios',
  'Arrepentimiento (producto apto para volver a la venta)',
  'Faltante de mercadería',
] as const

export type ClaimStatus =
  | 'nuevo'
  | 'recepcion'
  | 'pendiente-retiro'
  | 'enviado-proveedor'
  | 'reparacion'
  | 'entregado'
  | 'cancelado'

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  nuevo: 'Nuevo',
  recepcion: 'Recepción de producto',
  'pendiente-retiro': 'Pendiente de retiro cliente',
  'enviado-proveedor': 'Enviado al proveedor para verificación',
  reparacion: 'Reparación',
  entregado: 'Entregado al cliente',
  cancelado: 'Cancelado',
}

export const CLAIM_STATUS_ORDER: ClaimStatus[] = [
  'nuevo',
  'recepcion',
  'pendiente-retiro',
  'enviado-proveedor',
  'reparacion',
  'entregado',
  'cancelado',
]

export type ClaimProduct = {
  name: string
  quantity: number
}

export type ClaimFile = {
  name: string
  dataUrl: string
}

export type ClaimEvent = {
  at: string
  status: ClaimStatus
  note?: string
}

export type Claim = {
  id: string
  client: string
  invoices: string[]
  phone: string
  email: string
  seller: string
  motive: string
  description: string
  products: ClaimProduct[]
  photoNames: string[]
  photos?: ClaimFile[]
  attachmentName: string
  attachment?: ClaimFile
  status: ClaimStatus
  createdAt: string
  resolvedAt?: string
  events: ClaimEvent[]
}

export function isOpenClaim(status: ClaimStatus) {
  return status !== 'entregado' && status !== 'cancelado'
}
