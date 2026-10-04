import { apiRequest } from './api'
import type { Role } from './authStore'

export function createUserAccount(input: {
  name: string
  email: string
  password: string
  role: Role
  sellerName?: string
  carrierName?: string
}) {
  return apiRequest('/api/users', 'POST', input, 'No se pudo crear el usuario.')
}

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

export function updateUser(
  id: string,
  patch: {
    name?: string
    email?: string
    phone?: string
    sellerName?: string
    carrierName?: string
  },
) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}`,
    'PATCH',
    patch,
    'No se pudo guardar el usuario.',
  )
}

export function updateUserActive(id: string, active: boolean) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}/active`,
    'PATCH',
    { active },
    'No se pudo cambiar el estado.',
  )
}

export function updateUserPassword(id: string, password: string) {
  return apiRequest(
    `/api/users/${encodeURIComponent(id)}/password`,
    'PATCH',
    { password },
    'No se pudo cambiar la contraseña.',
  )
}
