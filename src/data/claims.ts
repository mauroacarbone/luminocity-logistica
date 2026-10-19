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
  by?: { userId: string; userName: string }
}

export type RepairStep =
  | 'por-levantar'
  | 'diagnostico'
  | 'presupuesto-enviado'
  | 'presupuesto-vencido'
  | 'aceptado'
  | 'rechazado'
  | 'en-reparacion'
  | 'listo'
  | 'entregado'

export type RepairCoverage = 'garantia' | 'cobro'

export type RepairContact = {
  at: string
  channel: 'whatsapp' | 'llamada'
  kind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo'
  result?: string
  by?: { id: string; name: string }
}

export type ClaimRepair = {
  intakeAt: string
  product: string
  coverage: RepairCoverage
  diagnosis: string
  quote: {
    amount?: number
    etaDate?: string
    sentAt?: string
    expiresAt?: string
    expiredNotifiedAt?: string
  }
  step: RepairStep
  contacts: RepairContact[]
  answer?: { value: 'acepta' | 'rechaza' | 'sin-respuesta'; at: string; by?: { id: string; name: string } }
  receivedBy: { id: string; name: string }
  technician?: { id: string; name: string }
  intake?: { condition: string; accessories?: string }
  finish?: { note: string; cost?: number; at: string; by?: { id: string; name: string } }
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
  hasPhotos?: boolean
  hasAttachment?: boolean
  createdBy?: string
  importedBy?: string
  phoneKind?: 'movil' | 'fijo'
  repair?: ClaimRepair
}

export function isOpenClaim(status: ClaimStatus) {
  return status !== 'entregado' && status !== 'cancelado'
}
