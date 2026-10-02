import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { normalizeName } from './access.js'
import { locked } from './lock.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const usersFile = path.join(dataDir, 'users.json')

export const ROLES = ['vendedor', 'deposito', 'encargado_deposito', 'chofer', 'admin']

const DEMO = {
  name: 'Mauro Carbone',
  email: 'mauro@luminocity.local',
  password: 'demo1234',
  role: 'admin',
}

export function toPublicUser(user) {
  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: typeof user.phone === 'string' ? user.phone : '',
  }
  if (typeof user.sellerName === 'string' && user.sellerName.trim()) {
    publicUser.sellerName = user.sellerName.trim()
  }
  return publicUser
}

async function readUsers() {
  try {
    const raw = await readFile(usersFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeUsers(users) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(usersFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8')
}

export function ensureDemoUser() {
  return locked(async () => {
    await mkdir(dataDir, { recursive: true })
    try {
      await readFile(usersFile, 'utf8')
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
      const passwordHash = await bcrypt.hash(DEMO.password, 10)
      await writeUsers([
        {
          id: randomUUID(),
          name: DEMO.name,
          email: DEMO.email,
          passwordHash,
          role: DEMO.role,
        },
      ])
    }
  })
}

export function authenticate(email, password) {
  return locked(async () => {
    const normalized = String(email ?? '').trim().toLowerCase()
    const user = (await readUsers()).find((item) => item.email === normalized)
    if (!user) return null
    const matches = await bcrypt.compare(String(password ?? ''), user.passwordHash)
    return matches ? user : null
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

export function setUserRole(id, role) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    if (users[index].role === 'admin' && role !== 'admin') {
      const admins = users.filter((item) => item.role === 'admin').length
      if (admins <= 1) return { error: 'last-admin' }
    }
    users[index] = { ...users[index], role }
    await writeUsers(users)
    return { user: users[index] }
  })
}

export function setUserPhone(id, phone) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const next = { ...users[index] }
    if (phone) next.phone = phone
    else delete next.phone
    users[index] = next
    await writeUsers(users)
    return { user: next }
  })
}

export function setUserSellerName(id, sellerName) {
  return locked(async () => {
    const users = await readUsers()
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'missing' }
    const next = { ...users[index] }
    if (sellerName) next.sellerName = sellerName
    else delete next.sellerName
    users[index] = next
    await writeUsers(users)
    return { user: next }
  })
}

export function createUser({ name, email, password, role }) {
  return locked(async () => {
    const users = await readUsers()
    const normalized = email.trim().toLowerCase()
    if (users.some((item) => item.email === normalized)) return { error: 'email' }
    const nameKey = normalizeName(name)
    if (nameKey && users.some((item) => normalizeName(item.name) === nameKey)) return { error: 'name' }
    const user = {
      id: randomUUID(),
      name: name.trim(),
      email: normalized,
      passwordHash: await bcrypt.hash(password, 10),
      role,
    }
    users.push(user)
    await writeUsers(users)
    return { user }
  })
}
