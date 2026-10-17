export const TAKE_STALE_MS = 4 * 60 * 60 * 1000

const TAKE_ROLES = new Set(['deposito', 'encargado_deposito', 'admin'])

export function canTake(user) {
  return TAKE_ROLES.has(user?.role)
}

export function actorOf(user) {
  return { id: user.id, name: typeof user.name === 'string' ? user.name.trim() : '' }
}

export function takenByOf(order) {
  const by = order?.preparation?.takenBy
  if (!by || typeof by.id !== 'string' || !by.id) return undefined
  return { id: by.id, name: typeof by.name === 'string' ? by.name : '' }
}

export function takenAtOf(order) {
  const at = order?.preparation?.takenAt
  return typeof at === 'string' && at ? at : ''
}

export function isTakeStale(takenAt, nowMs) {
  const start = Date.parse(takenAt)
  if (!Number.isFinite(start)) return true
  return nowMs - start > TAKE_STALE_MS
}

export function sessionsOf(order) {
  const sessions = order?.preparation?.sessions
  if (!Array.isArray(sessions)) return []
  return sessions.map((session) => {
    const next = {
      by: {
        id: typeof session?.by?.id === 'string' ? session.by.id : '',
        name: typeof session?.by?.name === 'string' ? session.by.name : '',
      },
      start: typeof session?.start === 'string' ? session.start : '',
    }
    if (typeof session?.end === 'string' && session.end) next.end = session.end
    return next
  })
}

export function hasOpenSession(order) {
  return sessionsOf(order).some((session) => !session.end)
}

export function activeHolder(order, nowMs = Date.now()) {
  const holder = takenByOf(order)
  if (!holder) return undefined
  const takenAt = takenAtOf(order)
  if (!takenAt || isTakeStale(takenAt, nowMs)) return undefined
  return holder
}
