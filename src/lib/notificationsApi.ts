import { apiRequest } from './api'

export type AppNotification = {
  id: string
  to: string
  text: string
  orderId?: string
  claimId?: string
  read: boolean
  createdAt: string
  channel: 'app' | 'whatsapp'
  status?: 'pendiente' | 'enviado'
  phone?: string
}

export function isNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.to === 'string' &&
    typeof item.text === 'string' &&
    typeof item.read === 'boolean' &&
    typeof item.createdAt === 'string' &&
    (item.channel === 'app' || item.channel === 'whatsapp') &&
    (item.orderId === undefined || typeof item.orderId === 'string') &&
    (item.claimId === undefined || typeof item.claimId === 'string') &&
    (item.phone === undefined || typeof item.phone === 'string') &&
    (item.status === undefined || item.status === 'pendiente' || item.status === 'enviado')
  )
}

export function listNotifications() {
  return apiRequest('/api/notifications', 'GET', undefined, 'No se pudieron cargar los avisos.')
}

export function markNotificationSent(id: string) {
  return apiRequest(
    `/api/notifications/${encodeURIComponent(id)}/sent`,
    'PATCH',
    {},
    'No se pudo marcar el aviso como enviado.',
  )
}

export function markNotificationRead(id: string) {
  return apiRequest(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    'PATCH',
    {},
    'No se pudo marcar el aviso como leído.',
  )
}
