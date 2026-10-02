import { apiRequest } from './api'
import type { Role } from './authStore'

export function listUsers() {
  return apiRequest('/api/users', 'GET', undefined, 'No se pudieron cargar los usuarios.')
}

export function updateUserRole(id: string, role: Role) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}/role`,
    'PATCH',
    { role },
    'No se pudo cambiar el rol.',
  )
}

export function updateUserPhone(id: string, phone: string) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}`,
    'PATCH',
    { phone },
    'No se pudo guardar el celular.',
  )
}

export function updateUserCarrier(id: string, carrierName: string) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}`,
    'PATCH',
    { carrierName },
    'No se pudo vincular el transportista.',
  )
}

export function updateUserSeller(id: string, sellerName: string) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}`,
    'PATCH',
    { sellerName },
    'No se pudo vincular el vendedor.',
  )
}
