import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { normalizeName } from './access.js'
import { collectionFileExists, readCollection, usingDatabase, writeCollection } from './db/store.js'
import { forgetUsers } from './locations.js'
import { locked } from './lock.js'

export const ROLES = ['vendedor', 'deposito', 'encargado_deposito', 'chofer', 'gerencia', 'tecnico', 'admin']
export const DEMO_EMAIL = 'mauro@luminocity.local'
export const PASSWORD_MIN = 10
export const PASSWORD_MAX_BYTES = 72

/** El admin administra a todos. El encargado, a cualquiera que no sea admin, y no puede dar ese rol. */
export function canManageUser(actor, target, changes = {}) {
  if (!actor || (actor.role !== 'admin' && actor.role !== 'encargado_deposito')) {
    return { ok: false, status: 403, message: 'No tenés permiso para esto.' }
  }
  if (actor.role === 'admin') return { ok: true }
  if (target && target.role === 'admin') {
    return { ok: false, status: 403, message: 'No podés modificar al administrador.' }
  }
  if (changes.role === 'admin') {
    return { ok: false, status: 403, message: 'No podés modificar al administrador.' }
  }
  if (target && target.role === 'gerencia') {
    return { ok: false, status: 403, message: 'No podés modificar a gerencia' }
  }
  if (changes.role === 'gerencia') {
    return { ok: false, status: 403, message: 'No podés asignar el rol gerencia' }
  }
  return { ok: true }
}

const DEMO = {
  name: 'Mauro Carbone',
  email: DEMO_EMAIL,
  password: 'demo1234',
  role: 'admin',
}

export function isActive(user) {
  return user.active !== false
}

function driverNameKey(name) {
  return normalizeName(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function activeDriverNameTaken(users, name, exceptId) {
  const key = driverNameKey(name)
  if (!key) return false
  return users.some(
    (user) =>
      user.id !== exceptId &&
      user.role === 'chofer' &&
      isActive(user) &&
      driverNameKey(user.name) === key,
  )
}

function nextTokenVersion(user) {
  const current = user?.tokenVersion
  if (typeof current === 'number' && Number.isInteger(current) && current >= 0) return current + 1
  return 1
}

export function toPublicUser(user) {
  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: typeof user.phone === 'string' ? user.phone : '',
    active: isActive(user),
  }
  if (typeof user.sellerName === 'string' && user.sellerName.trim()) {
    publicUser.sellerName = user.sellerName.trim()
  }
  if (typeof user.carrierName === 'string' && user.carrierName.trim()) {
    publicUser.carrierName = user.carrierName.trim()
  }
  if (typeof user.createdAt === 'string' && user.createdAt.trim()) {
    publicUser.createdAt = user.createdAt
  }
  return publicUser
}

async function readUsers() {
  return readCollection('users')
}

async function writeUsers(users) {
  await writeCollection('users', users)
}

export function ensureDemoUser() {
  if (usingDatabase() || process.env.NODE_ENV === 'production') return Promise.resolve()
  return locked(async () => {
    if (await collectionFileExists('users')) return
    const passwordHash = await bcrypt.hash(DEMO.password, 10)
    await writeUsers([
      {
        id: randomUUID(),
        name: DEMO.name,
        email: DEMO.email,
        passwordHash,
        role: DEMO.role,
        createdAt: new Date().toISOString(),
      },
    ])
  })
}

export async function warnActiveDemoUser() {
  if (process.env.NODE_ENV !== 'production') return
  const users = await readCollection('users')
  const demo = (Array.isArray(users) ? users : []).find((user) => user?.email === DEMO_EMAIL)
  if (!demo || !isActive(demo)) return
  console.warn(
    'Atención: el usuario demo mauro@luminocity.local está activo en producción. Desactivalo desde Usuarios.',
  )
}

export function authenticate(email, password) {
  return locked(async () => {
    const normalized = String(email ?? '').trim().toLowerCase()
    const user = (await readUsers()).find((item) => item.email === normalized)
    if (!user) return { error: 'invalid' }
    const matches = await bcrypt.compare(String(password ?? ''), user.passwordHash)
    if (!matches) return { error: 'invalid' }
    if (!isActive(user)) return { error: 'inactive' }
    return { user }
  })
}

export function findUserById(id) {
  return locked(async () => {
    const users = await readUsers()
    return users.find((item) => item.id === id) ?? null
  })
}

export function listUsers() {
  return locked(async () => (await readUsers()).map(toPublicUser))
}

export function readUsersList() {
  return readUsers()
}

function denied(actor, target, changes) {
  const permission = canManageUser(actor, target, changes)
  if (permission.ok) return null
  return { error: 'forbidden', status: permission.status, message: permission.message }
}

export function setUserRole(id, role, actor) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const block = denied(actor, users[index], { role })
    if (block) return block
    if (isActive(users[index]) && users[index].role === 'admin' && role !== 'admin') {
      const admins = users.filter((item) => item.role === 'admin' && isActive(item)).length
      if (admins <= 1) return { error: 'last-admin' }
    }
    if (role === 'chofer' && isActive(users[index]) && activeDriverNameTaken(users, users[index].name, users[index].id)) {
      return { error: 'driver-name' }
    }
    users[index] = { ...users[index], role }
    await writeUsers(users)
    return { user: users[index] }
  })
}

export function updateUserDetails(id, fields, actor) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const block = denied(actor, users[index], {})
    if (block) return block
    const next = { ...users[index] }
    if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
      const nameKey = normalizeName(fields.name)
      const taken = users.some(
        (item, itemIndex) => itemIndex !== index && nameKey && normalizeName(item.name) === nameKey,
      )
      if (taken) return { error: 'name' }
      next.name = String(fields.name).trim()
    }
    if (
      next.role === 'chofer' &&
      isActive(next) &&
      activeDriverNameTaken(users, next.name, next.id)
    ) {
      return { error: 'driver-name' }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'email')) {
      const normalized = String(fields.email).trim().toLowerCase()
      const taken = users.some(
        (item, itemIndex) => itemIndex !== index && String(item.email ?? '').toLowerCase() === normalized,
      )
      if (taken) return { error: 'email' }
      next.email = normalized
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'phone')) {
      if (fields.phone) next.phone = fields.phone
      else delete next.phone
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'sellerName')) {
      if (fields.sellerName) next.sellerName = fields.sellerName
      else delete next.sellerName
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'carrierName')) {
      if (fields.carrierName) next.carrierName = fields.carrierName
      else delete next.carrierName
    }
    users[index] = next
    await writeUsers(users)
    return { user: next }
  })
}

export function setUserPassword(id, password, actor) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const block = denied(actor, users[index], {})
    if (block) return block
    const next = {
      ...users[index],
      passwordHash: await bcrypt.hash(password, 10),
      tokenVersion: nextTokenVersion(users[index]),
    }
    delete next.passwordChangedAt
    users[index] = next
    await writeUsers(users)
    return { user: users[index] }
  })
}

export function setUserActive(id, active, actor) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const block = denied(actor, users[index], { active })
    if (block) return block
    if (active === false && users[index].role === 'admin' && isActive(users[index])) {
      const admins = users.filter((item) => item.role === 'admin' && isActive(item)).length
      if (admins <= 1) return { error: 'last-admin' }
    }
    if (active === false && id === actor?.id) return { error: 'self' }
    if (
      active === true &&
      users[index].role === 'chofer' &&
      activeDriverNameTaken(users, users[index].name, users[index].id)
    ) {
      return { error: 'driver-name' }
    }
    const next = { ...users[index], active: active === true }
    if (active === false) next.tokenVersion = nextTokenVersion(users[index])
    users[index] = next
    await writeUsers(users)
    if (active === false) await forgetUsers([id])
    return { user: users[index] }
  })
}

export function createUser({
  name,
  email,
  password,
  role,
  sellerName,
  carrierName,
}) {
  return locked(async () => {
    const users = await readUsers()
    const normalized = email.trim().toLowerCase()
    if (users.some((item) => String(item.email ?? '').toLowerCase() === normalized)) {
      return { error: 'email' }
    }
    const nameKey = normalizeName(name)
    if (nameKey && users.some((item) => normalizeName(item.name) === nameKey)) {
      return { error: 'name' }
    }
    if (role === 'chofer' && activeDriverNameTaken(users, name)) {
      return { error: 'driver-name' }
    }
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: normalized,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      active: true,
      createdAt: new Date().toISOString(),
    }
    if (role === 'vendedor' && typeof sellerName === 'string' && sellerName.trim()) {
      user.sellerName = sellerName.trim()
    }
    if (role === 'chofer' && typeof carrierName === 'string' && carrierName.trim()) {
      user.carrierName = carrierName.trim()
    }
    users.push(user)
    await writeUsers(users)
    return { user }
  })
}
