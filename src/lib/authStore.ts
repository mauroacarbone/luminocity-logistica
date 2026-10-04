export const ROLES = ['vendedor', 'deposito', 'encargado_deposito', 'chofer', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  vendedor: 'Vendedor',
  deposito: 'Depósito',
  encargado_deposito: 'Encargado de depósito',
  chofer: 'Chofer',
  admin: 'Admin',
}

export type Session = {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  sellerName?: string
  carrierName?: string
}

const TOKEN_KEY = 'luminocity.token.v1'

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return (
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.name === 'string' &&
    user.name.trim().length > 0 &&
    typeof user.email === 'string' &&
    user.email.includes('@') &&
    isRole(user.role) &&
    typeof user.active === 'boolean' &&
    (user.sellerName === undefined || typeof user.sellerName === 'string') &&
    (user.carrierName === undefined || typeof user.carrierName === 'string')
  )
}

export function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    return true
  } catch {
    return false
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Si no se puede borrar, la próxima lectura de /me igual cierra la sesión.
  }
}

/** Lee `exp` del JWT para cerrar la sesión cuando vence, sin validar la firma. */
export function tokenExpiresAt(token: string) {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json: unknown = JSON.parse(atob(padded))
    if (!json || typeof json !== 'object' || !('exp' in json)) return null
    const exp = json.exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}
