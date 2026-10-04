import { isSession, rememberSessionNotice, type Session } from './authStore'

export type AuthFailure = {
  ok: false
  message: string
  field?: 'email' | 'name'
}

export type AuthSuccess = {
  ok: true
  token: string
  user: Session
}

function fieldFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('field' in data)) return undefined
  const field = data.field
  return field === 'email' || field === 'name' ? field : undefined
}

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

async function postAuth(path: string, body: unknown, fallback: string): Promise<AuthSuccess | AuthFailure> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: 'No se pudo conectar con el servidor.' }
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = messageFrom(data, fallback)
    const field = fieldFrom(data)
    if (response.status === 409 && field) return { ok: false, message, field }
    return { ok: false, message }
  }
  if (!data || typeof data !== 'object' || !('token' in data) || !('user' in data)) {
    return { ok: false, message: 'El servidor no devolvió una sesión válida.' }
  }
  const token = data.token
  if (typeof token !== 'string' || !token || !isSession(data.user)) {
    return { ok: false, message: 'El servidor no devolvió una sesión válida.' }
  }
  return { ok: true, token, user: data.user }
}

export function loginRequest(email: string, password: string) {
  return postAuth(
    '/api/auth/login',
    { email, password },
    'Email o contraseña incorrectos.',
  )
}

export function registerRequest(input: { name: string; email: string; password: string }) {
  return postAuth('/api/auth/register', input, 'No se pudo crear la cuenta.')
}

export async function meRequest(token: string): Promise<Session | 'unauthorized' | 'error'> {
  let response: Response
  try {
    response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return 'error'
  }
  if (response.status === 401) {
    const data: unknown = await response.json().catch(() => null)
    if (
      data &&
      typeof data === 'object' &&
      'code' in data &&
      (data.code === 'USER_INACTIVE' || data.code === 'SESSION_REVOKED')
    ) {
      const message = 'message' in data && typeof data.message === 'string' ? data.message : ''
      if (message) rememberSessionNotice(message)
    }
    return 'unauthorized'
  }
  if (!response.ok) return 'error'
  const data: unknown = await response.json().catch(() => null)
  return isSession(data) ? data : 'unauthorized'
}
