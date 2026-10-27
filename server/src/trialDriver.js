import { normalizeName } from './access.js'

const DEFAULT_NAME = 'Francis'

/** TRIAL_DRIVER_ID gana. Si no hay id, TRIAL_DRIVER_NAME (por defecto Francis). Vacío desactiva el nombre. */
export function trialDriverConfig() {
  const id = String(process.env.TRIAL_DRIVER_ID ?? '').trim()
  const rawName = process.env.TRIAL_DRIVER_NAME
  const name = rawName === undefined ? DEFAULT_NAME : rawName.trim()
  return { id, name }
}

function fold(value) {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function nameMatches(userName, target) {
  const full = fold(userName)
  const wanted = fold(target)
  if (!full || !wanted) return false
  if (full === wanted) return true
  return full.split(' ')[0] === wanted
}

/** Admin identificado por id o por nombre, activo o no. */
export function matchesTrialDriver(user) {
  if (!user || user.role !== 'admin' || typeof user.id !== 'string' || !user.id) return false
  const { id, name } = trialDriverConfig()
  if (id) return user.id === id
  if (!name) return false
  return nameMatches(user.name, name)
}

export function isTrialDriver(user) {
  return matchesTrialDriver(user) && user.active !== false
}

/** Chofer real, o el admin de prueba aunque esté inactivo (para mostrarlo en un pedido ya asignado). */
export function isAssignableDriver(user) {
  if (!user || typeof user.id !== 'string' || !user.id) return false
  return user.role === 'chofer' || matchesTrialDriver(user)
}

function driverCard(user) {
  const name = typeof user.name === 'string' ? user.name.trim() : ''
  return {
    id: user.id,
    name: name || user.id,
    email: typeof user.email === 'string' ? user.email : '',
    phone: typeof user.phone === 'string' ? user.phone : '',
    active: user.active !== false,
    ...(matchesTrialDriver(user) ? { trialDriver: true } : {}),
  }
}

export async function listAssignableDrivers() {
  const { readCollection } = await import('./db/store.js')
  const users = await readCollection('users')
  const list = (Array.isArray(users) ? users : []).flatMap((user) => {
    if (!isAssignableDriver(user)) return []
    return [driverCard(user)]
  })
  list.sort((left, right) => {
    if (left.trialDriver && !right.trialDriver) return -1
    if (!left.trialDriver && right.trialDriver) return 1
    return left.name.localeCompare(right.name, 'es')
  })
  return list
}

export async function trialDriverNames() {
  const { readCollection } = await import('./db/store.js')
  const users = await readCollection('users')
  const map = new Map()
  for (const user of Array.isArray(users) ? users : []) {
    if (!matchesTrialDriver(user)) continue
    const name = typeof user.name === 'string' ? user.name.trim() : ''
    map.set(user.id, name || user.id)
  }
  return map
}
