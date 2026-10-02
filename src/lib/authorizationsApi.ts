import { apiRequest } from './api'

export type AuthorizationStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'usada'

export type SellerAuthorization = {
  id: string
  requestedBy: string
  seller: string
  status: AuthorizationStatus
  createdAt: string
  resolvedBy?: string
  resolvedAt?: string
  usedAt?: string
  orderId?: string
}

export function isAuthorization(value: unknown): value is SellerAuthorization {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.requestedBy === 'string' &&
    typeof item.seller === 'string' &&
    typeof item.createdAt === 'string' &&
    (item.status === 'pendiente' ||
      item.status === 'aprobada' ||
      item.status === 'rechazada' ||
      item.status === 'usada')
  )
}

export function listAuthorizations() {
  return apiRequest('/api/authorizations', 'GET', undefined, 'No se pudieron cargar las autorizaciones.')
}

export function requestAuthorization(seller: string) {
  return apiRequest(
    '/api/authorizations',
    'POST',
    { seller },
    'No se pudo pedir la autorización.',
  )
}

export function resolveAuthorization(id: string, status: 'aprobada' | 'rechazada') {
  return apiRequest(
    `/api/authorizations/${encodeURIComponent(id)}`,
    'PATCH',
    { status },
    'No se pudo resolver la autorización.',
  )
}
