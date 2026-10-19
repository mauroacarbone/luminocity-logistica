import {
  type Claim,
  type ClaimEvent,
  type ClaimFile,
  type ClaimProduct,
  type ClaimStatus,
  type RepairStep,
} from '../data/claims'
import { apiRequest, type ApiResult } from './api'
import { loadToken, rememberSessionNotice } from './authStore'

const STATUSES = new Set<ClaimStatus>([
  'nuevo',
  'recepcion',
  'pendiente-retiro',
  'enviado-proveedor',
  'reparacion',
  'entregado',
  'cancelado',
])

export type NewClaimBody = {
  client: string
  invoices: string[]
  phone: string
  email: string
  seller: string
  motive: string
  description: string
  products: ClaimProduct[]
  photos?: ClaimFile[]
  attachment?: ClaimFile
  intake?: {
    invoice: string
    client: string
    product: string
    coverage: 'garantia' | 'cobro'
    intakeAt: string
    intakeCondition: string
    intakeAccessories?: string
  }
}

export type ClaimsImportSummary = {
  imported: number
  skipped: string[]
}

export type ClaimsImportResult =
  | { ok: true; data: ClaimsImportSummary }
  | { ok: false; status: number; message: string }

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function isClaimFile(value: unknown): value is ClaimFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Record<string, unknown>
  return (
    typeof file.name === 'string' &&
    file.name.length > 0 &&
    typeof file.dataUrl === 'string' &&
    file.dataUrl.startsWith('data:')
  )
}

function isProduct(value: unknown): value is ClaimProduct {
  if (!value || typeof value !== 'object') return false
  const product = value as Record<string, unknown>
  return (
    typeof product.name === 'string' &&
    typeof product.quantity === 'number' &&
    Number.isInteger(product.quantity) &&
    product.quantity >= 1
  )
}

function isRepair(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const repair = value as Record<string, unknown>
  return typeof repair.step === 'string' && typeof repair.product === 'string'
}

function isEvent(value: unknown): value is ClaimEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  if (typeof event.at !== 'string') return false
  if (typeof event.status !== 'string' || !STATUSES.has(event.status as ClaimStatus)) return false
  if (event.note !== undefined && typeof event.note !== 'string') return false
  if (event.by !== undefined) {
    if (!event.by || typeof event.by !== 'object') return false
    const by = event.by as Record<string, unknown>
    if (typeof by.userId !== 'string' || typeof by.userName !== 'string') return false
  }
  return true
}

export function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== 'object') return false
  const claim = value as Record<string, unknown>
  if (typeof claim.id !== 'string' || claim.id.length === 0) return false
  if (typeof claim.client !== 'string') return false
  if (typeof claim.phone !== 'string') return false
  if (typeof claim.email !== 'string') return false
  if (typeof claim.seller !== 'string') return false
  if (typeof claim.motive !== 'string') return false
  if (typeof claim.description !== 'string') return false
  if (typeof claim.attachmentName !== 'string') return false
  if (typeof claim.createdAt !== 'string') return false
  if (claim.resolvedAt !== undefined && typeof claim.resolvedAt !== 'string') return false
  if (typeof claim.status !== 'string' || !STATUSES.has(claim.status as ClaimStatus)) return false
  if (!Array.isArray(claim.invoices) || claim.invoices.some((item) => typeof item !== 'string')) {
    return false
  }
  if (!Array.isArray(claim.products) || !claim.products.every(isProduct)) return false
  if (!Array.isArray(claim.photoNames) || claim.photoNames.some((item) => typeof item !== 'string')) {
    return false
  }
  if (
    claim.photos !== undefined &&
    (!Array.isArray(claim.photos) || claim.photos.length > 5 || !claim.photos.every(isClaimFile))
  ) {
    return false
  }
  if (claim.attachment !== undefined && !isClaimFile(claim.attachment)) return false
  if (!Array.isArray(claim.events) || !claim.events.every(isEvent)) return false
  if (claim.hasPhotos !== undefined && typeof claim.hasPhotos !== 'boolean') return false
  if (claim.hasAttachment !== undefined && typeof claim.hasAttachment !== 'boolean') return false
  if (claim.createdBy !== undefined && typeof claim.createdBy !== 'string') return false
  if (claim.importedBy !== undefined && typeof claim.importedBy !== 'string') return false
  if (claim.phoneKind !== undefined && claim.phoneKind !== 'movil' && claim.phoneKind !== 'fijo') return false
  if (claim.repair !== undefined && !isRepair(claim.repair)) return false
  return true
}

export function asClaimsList(result: ApiResult): Claim[] | null {
  if (!result.ok || !Array.isArray(result.data)) return null
  if (!result.data.every(isClaim)) return null
  return result.data
}

export function asClaim(result: ApiResult): Claim | null {
  if (!result.ok || !isClaim(result.data)) return null
  return result.data
}

export function listClaims() {
  return apiRequest('/api/claims', 'GET', undefined, 'No se pudieron cargar los reclamos.')
}

export function getClaim(id: string) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}`,
    'GET',
    undefined,
    'No se pudo cargar el reclamo.',
  )
}

export function createClaim(body: NewClaimBody) {
  return apiRequest('/api/claims', 'POST', body, 'No se pudo guardar el reclamo.')
}

export function repairStep(
  id: string,
  to: RepairStep,
  extra?: { note?: string; finalNote?: string; finalCost?: number },
) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/repair/step`,
    'POST',
    extra ? { to, ...extra } : { to },
    'No se pudo actualizar la reparación.',
  )
}

export function repairContact(
  id: string,
  body: {
    channel: 'whatsapp' | 'llamada'
    kind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo'
    result?: string
    phoneKind?: 'movil' | 'fijo'
  },
) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/repair/contact`,
    'POST',
    body,
    'No se pudo registrar el aviso.',
  )
}

export function openRepair(
  id: string,
  body: {
    invoice: string
    client: string
    product: string
    coverage: 'garantia' | 'cobro'
    intakeAt: string
    intakeCondition: string
    intakeAccessories?: string
  },
) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/repair`,
    'POST',
    body,
    'No se pudo abrir la reparación.',
  )
}

export function takeRepair(id: string, technicianId?: string) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/repair/take`,
    'POST',
    technicianId ? { technicianId } : {},
    technicianId ? 'No se pudo reasignar la reparación.' : 'No se pudo levantar la reparación.',
  )
}

export function updateRepair(
  id: string,
  body: {
    product?: string
    coverage?: 'garantia' | 'cobro'
    diagnosis?: string
    amount?: number
    etaDate?: string
    phoneKind?: 'movil' | 'fijo'
  },
) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/repair`,
    'PATCH',
    body,
    'No se pudo guardar la reparación.',
  )
}

export function patchClaimStatus(id: string, status: ClaimStatus) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/status`,
    'PATCH',
    { status },
    'No se pudo cambiar el estado del reclamo.',
  )
}

export function addClaimNote(id: string, note: string) {
  return apiRequest(
    `/api/claims/${encodeURIComponent(id)}/notes`,
    'POST',
    { note },
    'No se pudo guardar la nota.',
  )
}

export async function importClaims(claims: Claim[]): Promise<ClaimsImportResult> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401, message: 'Tenés que iniciar sesión.' }

  let response: Response
  try {
    response = await fetch('/api/claims/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ claims }),
    })
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' }
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = messageFrom(data, 'No se pudieron importar los reclamos.')
    if (response.status === 401) {
      const code =
        data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
          ? data.code
          : ''
      if (code === 'USER_INACTIVE' || code === 'SESSION_REVOKED') rememberSessionNotice(message)
    }
    return { ok: false, status: response.status, message }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, status: 500, message: 'No se pudieron importar los reclamos.' }
  }
  const summary = data as Record<string, unknown>
  if (typeof summary.imported !== 'number' || !Array.isArray(summary.skipped)) {
    return { ok: false, status: 500, message: 'No se pudieron importar los reclamos.' }
  }
  if (!summary.skipped.every((item) => typeof item === 'string')) {
    return { ok: false, status: 500, message: 'No se pudieron importar los reclamos.' }
  }
  return {
    ok: true,
    data: {
      imported: summary.imported,
      skipped: summary.skipped,
    },
  }
}
