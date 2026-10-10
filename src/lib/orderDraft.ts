import type { DispatchType } from '../data/catalog'
import type { OrderPriority } from '../data/orders'

export const ORDER_DRAFT_PREFIX = 'luminocity.orderDraft.'
export const ORDER_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Tope para guardar el data URL del adjunto (~300 KB). */
export const ORDER_DRAFT_ATTACHMENT_BYTES = 300 * 1024

export type OrderDraftFields = {
  seller: string
  client: string
  phone: string
  invoices: string[]
  collectOnDelivery: boolean
  amount: string
  address: string
  deliveryZone: string
  zoneManual: boolean
  betweenStreet1: string
  betweenStreet2: string
  propertyType: string
  floor: string
  unit: string
  doorbell: string
  deliveryDate: string
  timeWindow: string
  requiresPickup: boolean
  dispatchType: DispatchType
  priority: OrderPriority
  transporter: string
  notes: string
  attachmentName: string
  attachmentDataUrl: string
  attachmentNeedsReupload?: boolean
  receiverName: string
  receiverDni: string
}

export type OrderDraftRecord = {
  v: 1
  savedAt: string
  fields: OrderDraftFields
}

export function orderDraftKey(userId: string, editingId?: string) {
  const mode = editingId ? `edit:${editingId}` : 'new'
  return `${ORDER_DRAFT_PREFIX}${userId}.${mode}`
}

export function isOrderDraftRecord(value: unknown): value is OrderDraftRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.v !== 1) return false
  if (typeof record.savedAt !== 'string' || !record.savedAt) return false
  if (!record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) return false
  return true
}

export function formatDraftAgo(savedAt: string, now = Date.now()) {
  const at = new Date(savedAt).getTime()
  if (!Number.isFinite(at)) return 'hace un rato'
  const minutes = Math.max(0, Math.floor((now - at) / 60000))
  if (minutes < 1) return 'hace un momento'
  if (minutes === 1) return 'hace 1 min'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return 'hace 1 h'
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

export function readOrderDraft(key: string): OrderDraftRecord | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isOrderDraftRecord(parsed)) {
      localStorage.removeItem(key)
      return null
    }
    const age = Date.now() - new Date(parsed.savedAt).getTime()
    if (!Number.isFinite(age) || age > ORDER_DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function writeOrderDraft(key: string, fields: OrderDraftFields): boolean {
  const payload: OrderDraftRecord = {
    v: 1,
    savedAt: new Date().toISOString(),
    fields: prepareFieldsForStorage(fields),
  }
  try {
    localStorage.setItem(key, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function clearOrderDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Borra todos los borradores de un usuario (al cerrar sesión). */
export function clearOrderDraftsForUser(userId: string) {
  const prefix = `${ORDER_DRAFT_PREFIX}${userId}.`
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function prepareFieldsForStorage(fields: OrderDraftFields): OrderDraftFields {
  const dataUrl = fields.attachmentDataUrl ?? ''
  if (!dataUrl) {
    return {
      ...fields,
      attachmentDataUrl: '',
      attachmentNeedsReupload: Boolean(fields.attachmentName && fields.attachmentNeedsReupload),
    }
  }
  // data URL en base64 ≈ 4/3 del binario; comparamos el tamaño aproximado del archivo.
  const comma = dataUrl.indexOf(',')
  const binaryLen = comma >= 0 ? Math.floor(((dataUrl.length - comma - 1) * 3) / 4) : dataUrl.length
  if (binaryLen > ORDER_DRAFT_ATTACHMENT_BYTES) {
    return {
      ...fields,
      attachmentDataUrl: '',
      attachmentNeedsReupload: true,
    }
  }
  return {
    ...fields,
    attachmentNeedsReupload: false,
  }
}
