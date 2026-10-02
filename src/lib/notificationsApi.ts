import { apiRequest } from './api'

export type AppNotification = {
  id: string
  to: string
  text: string
  orderId?: string
  read: boolean
  createdAt: string
  channel: 'app' | 'whatsapp'
  status?: string
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
    (item.channel === 'app' || item.channel === 'whatsapp')
  )
}

export function listNotifications() {
  return apiRequest('/api/notifications', 'GET', undefined, 'No se pudieron cargar los avisos.')
}

export function markNotificationRead(id: string) {
  return apiRequest(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    'PATCH',
    {},
    'No se pudo marcar el aviso como leído.',
  )
}
