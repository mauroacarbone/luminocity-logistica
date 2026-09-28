import { loadList, saveList } from './localStore'
import { hashPassword } from './password'

export const USERS_KEY = 'luminocity.users.v1'
export const SESSION_KEY = 'luminocity.session.v1'

export const ROLES = ['vendedor', 'deposito', 'chofer', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  vendedor: 'Vendedor',
  deposito: 'Depósito',
  chofer: 'Chofer',
  admin: 'Admin',
}

export type StoredUser = {
  id: string
  name: string
  email: string
  /** SHA-256 con salt por usuario. El Brief 13 lo reemplaza por bcrypt en el server. */
  passwordHash: string
  role: Role
}

export type Session = {
  userId: string
  email: string
  name: string
  role: Role
}

/** Misma contraseña que figura en el README. Acá solo se persiste el hash. */
const DEMO_EMAIL = 'mauro@luminocity.local'
const DEMO_PASSWORD = 'demo1234'

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

function isUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return (
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.name === 'string' &&
    user.name.trim().length > 0 &&
    typeof user.email === 'string' &&
    user.email.includes('@') &&
    typeof user.passwordHash === 'string' &&
    user.passwordHash.startsWith('sha256$') &&
    !('password' in user) &&
    isRole(user.role)
  )
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  return (
    typeof session.userId === 'string' &&
    session.userId.length > 0 &&
    typeof session.email === 'string' &&
    typeof session.name === 'string' &&
    isRole(session.role)
  )
}

export function loadUsers() {
  return loadList(USERS_KEY, isUser).items
}

export function saveUsers(users: StoredUser[]) {
  return saveList(USERS_KEY, users)
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isSession(parsed)) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
    }
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // El navegador puede bloquear el almacenamiento.
    }
    return null
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
      }),
    )
    return true
  } catch {
    return false
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Si no se puede borrar, la próxima lectura igual valida contra los usuarios.
  }
}

export function sessionFromUser(user: StoredUser): Session {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
}

/** Si la sesión no corresponde a un usuario guardado, no se usa. */
export function matchSession(users: StoredUser[], session: Session | null) {
  if (!session) return null
  const user = users.find((item) => item.id === session.userId && item.email === session.email)
  return user ? sessionFromUser(user) : null
}

export async function createStoredUser(input: {
  name: string
  email: string
  password: string
  role: Role
}): Promise<StoredUser> {
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
  }
}

let seeding: Promise<StoredUser[]> | null = null

export function ensureUsers() {
  const existing = loadUsers()
  if (existing.length > 0) return Promise.resolve(existing)
  if (!seeding) {
    seeding = seedDemo().finally(() => {
      seeding = null
    })
  }
  return seeding
}

async function seedDemo() {
  const again = loadUsers()
  if (again.length > 0) return again
  const demo = await createStoredUser({
    name: 'Mauro Carbone',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    role: 'vendedor',
  })
  if (saveUsers([demo]) !== 'ok') return []
  return [demo]
}
