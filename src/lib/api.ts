import { loadToken, rememberSessionNotice } from './authStore'

export type ApiSuccess = { ok: true; data: unknown }
export type ApiFailure = { ok: false; status: number; message: string }
export type ApiResult = ApiSuccess | ApiFailure

function codeFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('code' in data)) return undefined
  const code = data.code
  return typeof code === 'string' ? code : undefined
}

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function fallbackFor(status: number, fallback: string) {
  if (status === 401) return 'Tenés que iniciar sesión.'
  if (status === 403) return 'No tenés permiso para esto.'
  if (status === 404) return 'No se encontró.'
  return fallback
}

export async function apiRequest(
  path: string,
  method: string,
  body?: unknown,
  fallback = 'No se pudo completar la operación.',
): Promise<ApiResult> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401, message: 'Tenés que iniciar sesión.' }

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' }
  }

  if (response.status === 204) return { ok: true, data: null }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = messageFrom(data, fallbackFor(response.status, fallback))
    if (response.status === 401 && (codeFrom(data) === 'USER_INACTIVE' || codeFrom(data) === 'SESSION_REVOKED')) {
      rememberSessionNotice(message)
    }
    return {
      ok: false,
      status: response.status,
      message,
    }
  }
  return { ok: true, data }
}
