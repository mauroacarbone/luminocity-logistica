import {
  checkDriver,
  checkSlot,
  normalizeTimeWindow,
  rememberOverride,
} from './orders.js'
import { blockPlannedDeparture, syncSheetOnEdit } from './routeSheets.js'

const STATUSES = new Set(['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado'])
const STATUS_RANK = { pendiente: 0, preparado: 1, asignado: 2, 'en-viaje': 3, entregado: 4 }

const TRANSITIONS = {
  'pendiente|preparado': {
    direction: 'forward',
    roles: new Set(['deposito', 'encargado_deposito', 'admin']),
  },
  'preparado|asignado': {
    direction: 'forward',
    roles: new Set(['encargado_deposito', 'admin']),
  },
  'asignado|en-viaje': {
    direction: 'forward',
    roles: new Set(['chofer']),
    mustBeDriver: true,
  },
  'en-viaje|entregado': {
    direction: 'forward',
    roles: new Set(['chofer', 'admin']),
    mustBeDriverOrAdmin: true,
  },
  'preparado|pendiente': {
    direction: 'back',
    roles: new Set(['encargado_deposito', 'admin']),
  },
  'asignado|preparado': {
    direction: 'back',
    roles: new Set(['encargado_deposito', 'admin']),
    clearDriver: true,
  },
  'en-viaje|asignado': {
    direction: 'back',
    roles: new Set(['admin']),
  },
  'entregado|en-viaje': {
    direction: 'back',
    roles: new Set(['admin']),
  },
}

export function stampStatus(order, current) {
  if (current) {
    for (const key of ['assignedAt', 'departedAt', 'deliveredAt', 'routeId']) {
      if (typeof current[key] === 'string' && current[key]) order[key] = current[key]
    }
    if (Number.isInteger(current.routeSeq) && current.routeSeq > 0) order.routeSeq = current.routeSeq
  }
  if (current && current.status === order.status) return
  const now = new Date().toISOString()
  const prev = current ? (STATUS_RANK[current.status] ?? 0) : -1
  const next = STATUS_RANK[order.status] ?? 0
  if (next <= prev) return
  if (order.status === 'asignado') {
    order.assignedAt =
      current?.status === 'en-viaje' && typeof current.assignedAt === 'string' && current.assignedAt
        ? current.assignedAt
        : now
    return
  }
  if (order.status === 'en-viaje') {
    order.departedAt = now
    return
  }
  if (order.status === 'entregado') order.deliveredAt = now
}

export function withHistory(order) {
  if (!order || typeof order !== 'object') return order
  if (Array.isArray(order.history) && order.history.length > 0) return order
  const at =
    typeof order.createdAt === 'string' && order.createdAt
      ? order.createdAt
      : typeof order.loadedAt === 'string'
        ? order.loadedAt
        : new Date().toISOString()
  return {
    ...order,
    history: [
      {
        at,
        by: {
          id: typeof order.createdBy === 'string' ? order.createdBy : '',
          name: '',
        },
        from: null,
        to: 'pendiente',
        reason: 'Creado',
        via: 'pedidos',
      },
    ],
  }
}

function historyOf(order) {
  if (Array.isArray(order.history) && order.history.length > 0) {
    return order.history.map((entry) => ({ ...entry, by: { ...entry.by } }))
  }
  return withHistory(order).history.map((entry) => ({ ...entry, by: { ...entry.by } }))
}

function pushHistory(order, { at, by, from, to, reason, via }) {
  const entry = {
    at,
    by: { id: by.id, name: by.name },
    from,
    to,
    via,
  }
  if (reason) entry.reason = reason
  order.history = [...historyOf(order), entry]
}

/**
 * Aplica una transición de estado sobre el array de pedidos (ya dentro de locked).
 * @param {object[]} orders
 * @param {object} current
 * @param {object} input
 * @param {object} user
 * @param {string} via
 */
export async function applyTransition(orders, current, input, user, via) {
  if (!current || typeof current !== 'object') return fail('No existe ese pedido.', 404)
  if (!isRecord(input)) return fail('La transición no es válida.')
  const to = typeof input.to === 'string' ? input.to.trim() : ''
  if (!STATUSES.has(to)) return fail('El estado no es válido.')
  if (current.status === to) return fail('El pedido ya está en ese estado.')

  if (current.status === 'pendiente' && to === 'asignado') {
    return fail('El pedido todavía no está preparado', 409, 'TRANSICION_INVALIDA')
  }

  const key = `${current.status}|${to}`
  const rule = TRANSITIONS[key]
  if (!rule) return invalidTransition(current.status, to)
  if (!rule.roles.has(user.role)) {
    return fail('No tenés permiso para ese cambio de estado.', 403)
  }
  if (rule.mustBeDriver && !isOrderDriver(user, current)) {
    return fail('No tenés permiso para ese cambio de estado.', 403)
  }
  if (rule.mustBeDriverOrAdmin) {
    if (user.role !== 'admin' && !isOrderDriver(user, current)) {
      return fail('No tenés permiso para ese cambio de estado.', 403)
    }
  }

  const reason = readReason(input, rule.direction === 'back')
  if (reason.error) return reason

  const next = {
    ...current,
    edits: Array.isArray(current.edits)
      ? current.edits.map((edit) => ({ ...edit, changes: { ...edit.changes } }))
      : [],
    status: to,
    updatedAt: new Date().toISOString(),
  }

  if (rule.direction === 'forward' && to === 'preparado') {
    const packages = readPackages(input, current)
    if (packages.error) return packages
    next.packages = packages.value
  }

  if (rule.direction === 'forward' && to === 'asignado') {
    const driverId = readDriverId(input, current)
    if (driverId.error) return driverId
    next.driverId = driverId.value
    if (Object.prototype.hasOwnProperty.call(input, 'timeWindow')) {
      const window = normalizeTimeWindow(typeof input.timeWindow === 'string' ? input.timeWindow : '')
      if (!window) return fail('Elegí una franja.', 400, 'FRANJA_REQUERIDA')
      next.timeWindow = window
    }
    if (!normalizeTimeWindow(next.timeWindow)) {
      return fail('Asigná una franja antes de elegir chofer.', 400, 'FRANJA_REQUERIDA')
    }
    const driver = await checkDriver(next.driverId, current.driverId)
    if (driver.error) return driver
    const slot = await checkSlot(orders, current, next, user, input.override === true)
    if (slot.error) return slot
    if (slot.authorized) rememberOverride(next, user)
  }

  if (rule.clearDriver) {
    delete next.driverId
  }

  stampStatus(next, current)

  if (via !== 'hoja') {
    const blocked = await blockPlannedDeparture(user, current, next)
    if (blocked) return blocked
  }
  const synced = await syncSheetOnEdit(orders, current, next)
  if (synced.error) return synced

  pushHistory(next, {
    at: next.updatedAt,
    by: { id: user.id, name: typeof user.name === 'string' ? user.name : '' },
    from: current.status,
    to,
    reason: reason.value,
    via,
  })

  const index = orders.findIndex((item) => item.id === current.id)
  if (index < 0) return fail('No existe ese pedido.', 404)
  orders[index] = next
  return { order: next, from: current.status, reason: reason.value, via }
}

function isOrderDriver(user, order) {
  return typeof order.driverId === 'string' && order.driverId.length > 0 && order.driverId === user.id
}

function readPackages(input, current) {
  if (Object.prototype.hasOwnProperty.call(input, 'packages')) {
    const value = input.packages
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      return fail('La cantidad de bultos tiene que ser un entero de 1 o más.')
    }
    return { value }
  }
  if (typeof current.packages === 'number' && Number.isInteger(current.packages) && current.packages >= 1) {
    return { value: current.packages }
  }
  return fail('Indicá la cantidad de bultos.')
}

function readDriverId(input, current) {
  if (Object.prototype.hasOwnProperty.call(input, 'driverId')) {
    const value = input.driverId
    if (value === null || value === '') return fail('Elegí un chofer.')
    if (typeof value !== 'string' || !value.trim()) return fail('Elegí un chofer.')
    return { value: value.trim() }
  }
  if (typeof current.driverId === 'string' && current.driverId.trim()) {
    return { value: current.driverId.trim() }
  }
  return fail('Elegí un chofer.')
}

function readReason(input, required) {
  if (!Object.prototype.hasOwnProperty.call(input, 'reason')) {
    if (required) return fail('Ingresá el motivo del cambio.')
    return { value: undefined }
  }
  if (typeof input.reason !== 'string') return fail('El motivo no es válido.')
  const value = input.reason.trim()
  if (!value) {
    if (required) return fail('Ingresá el motivo del cambio.')
    return { value: undefined }
  }
  if (required && value.length < 5) {
    return fail('El motivo tiene que tener al menos 5 caracteres.')
  }
  if (value.length > 300) return fail('El motivo es demasiado largo.')
  return { value }
}

function invalidTransition(from, to) {
  return fail(`No se puede pasar de ${from} a ${to}`, 409, 'TRANSICION_INVALIDA')
}

function fail(error, status = 400, code) {
  return code ? { error, status, code } : { error, status }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
