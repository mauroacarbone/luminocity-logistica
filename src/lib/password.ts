/**
 * Hash de cliente: SHA-256 con un salt distinto por usuario.
 * El Brief 13 lo reemplaza por bcrypt en el servidor. Esto no es seguridad real:
 * la contraseña no queda en texto plano, pero el hash vive en el navegador.
 */

function randomSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Formato guardado: `sha256$<salt>$<hash>`. El salt viaja junto al hash. */
export async function hashPassword(password: string, salt = randomSalt()) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256$${salt}$${toHex(digest)}`
}

export async function verifyPassword(password: string, stored: string) {
  const [prefix, salt, expected] = stored.split('$')
  if (prefix !== 'sha256' || !salt || !expected) return false
  const next = await hashPassword(password, salt)
  return next === stored
}
