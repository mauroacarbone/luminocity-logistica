import { normalizeName } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { linkUniquePickingRows } from './invoiceKey.js'
import {
  TAKE_STALE_MS,
  activeHolder,
  actorOf,
  closeOpenSessions,
  formatPrepMs,
  isTakeStale,
  rowIsPicked,
  sessionsOf,
  sumPrepMs,
  takenAtOf,
  takenByOf,
} from './preparation.js'
import {
  checkDriver,
  checkSlot,
  driverDisplayName,
  isOwnDelivery,
  isPickup,
  normalizeTimeWindow,
  rememberOverride,
  stampOwnDriver,
} from './orders.js'
import {
  blockPlannedDeparture,
  requireFreshSheet,
  syncSheetFreshness,
  syncSheetOnEdit,
} from './routeSheets.js'

const STATUSES = new Set(['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado'])
export const STATUS_RANK = { pendiente: 0, preparado: 1, asignado: 2, 'en-viaje': 3, entregado: 4 }

const TRANSITIONS = {
  'pendiente|preparado': {
    direction: 'forward',
    roles: new Set(['deposito', 'encargado_deposito', 'admin']),
  },
  'preparado|asignado': {
    direction: 'forward',
    roles: new Set(['encargado_deposito', 'admin']),
    notPickup: true,
  },
  'preparado|entregado': {
    direction: 'forward',
    roles: new Set(['encargado_deposito', 'deposito', 'admin']),
    pickupOnly: true,
  },
  'asignado|en-viaje': {
    direction: 'forward',
    roles: new Set(['chofer']),
    mustBeDriver: true,
    ownDelivery: true,
    allowTrialDriver: true,
  },
  'en-viaje|entregado': {
    direction: 'forward',
    roles: new Set(['chofer', 'encargado_deposito', 'admin']),
    mustBeDriverOrAdmin: true,
    ownDelivery: true,
  },
  'asignado|entregado': {
    direction: 'forward',
    roles: new Set(['encargado_deposito', 'admin']),
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
    notPickup: true,
  },
  'entregado|preparado': {
    direction: 'back',
    roles: new Set(['admin']),
    pickupOnly: true,
  },
}

function isCourier(order) {
  return order?.dispatchType === 'correo'
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
 * @param {{ fromSheet?: boolean }} [options]
 */
export async function applyTransition(orders, current, input, user, via, options = {}) {
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
  if (rule.courierOnly && !isCourier(current)) return invalidTransition(current.status, to)
  if (rule.ownDelivery && !isOwnDelivery(current)) return invalidTransition(current.status, to)
  if (rule.pickupOnly && !isPickup(current)) return invalidTransition(current.status, to)
  if (rule.notPickup && isPickup(current)) return invalidTransition(current.status, to)
  if (!rule.roles.has(user.role) && !(rule.allowTrialDriver && user.trialDriver === true)) {
    return fail('No tenés permiso para ese cambio de estado.', 403)
  }
  if (rule.mustBeDriver && !isOrderDriver(user, current)) {
    return fail('No tenés permiso para ese cambio de estado.', 403)
  }
  if (rule.mustBeDriverOrAdmin && user.role === 'chofer' && !isOrderDriver(user, current)) {
    return fail('No tenés permiso para ese cambio de estado.', 403)
  }
  if (key === 'asignado|entregado' && !isCourier(current) && !isOwnDelivery(current)) {
    return invalidTransition(current.status, to)
  }

  const backupDelivery =
    isOwnDelivery(current) &&
    to === 'entregado' &&
    (current.status === 'asignado' ||
      (current.status === 'en-viaje' && user.role === 'encargado_deposito'))

  const reason = readReason(input, rule.direction === 'back' || backupDelivery)
  if (reason.error) return reason

  const next = {
    ...current,
    edits: Array.isArray(current.edits)
      ? current.edits.map((edit) => ({ ...edit, changes: { ...edit.changes } }))
      : [],
    status: to,
    updatedAt: new Date().toISOString(),
  }

  let armedReason
  if (rule.direction === 'forward' && to === 'preparado') {
    if (current.status === 'pendiente' && via !== 'preparacion') {
      return fail('Armá el pedido desde Mi preparación.', 409, 'ARMAR_EN_PREPARACION')
    }
    const packages = readPackages(input, current)
    if (packages.error) return packages
    next.packages = packages.value
    const armed = await finishPreparation(next, current, input, user)
    if (armed.error) return armed
    armedReason = armed.reason
  }

  let historyReason = armedReason ?? reason.value
  if (
    reason.value &&
    isOwnDelivery(current) &&
    to === 'entregado' &&
    (current.status === 'asignado' || current.status === 'en-viaje') &&
    (user.role === 'encargado_deposito' || user.role === 'admin')
  ) {
    const name = typeof user.name === 'string' ? user.name : ''
    historyReason = `Entregado por ${name}: ${reason.value}`
  }
  if (rule.direction === 'forward' && to === 'entregado' && rule.pickupOnly) {
    const receiver = readPickupReceiver(input)
    if (receiver.error) return receiver
    next.receiverName = receiver.name
    if (receiver.dni) next.receiverDni = receiver.dni
    else delete next.receiverDni
    historyReason = `Retirado por ${receiver.name}`
  }

  if (rule.direction === 'forward' && to === 'asignado') {
    if (isCourier(current)) {
      delete next.driverId
      const tracking = readTrackingNumber(input, current)
      if (tracking.error) return tracking
      if (tracking.value !== undefined) {
        if (tracking.value) next.trackingNumber = tracking.value
        else delete next.trackingNumber
      }
    } else {
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
      stampOwnDriver(next, await driverDisplayName(next.driverId))
      const slot = await checkSlot(orders, current, next, user, input.override === true)
      if (slot.error) return slot
      if (slot.authorized) rememberOverride(next, user)
    }
  }

  if (rule.clearDriver) {
    delete next.driverId
    delete next.trackingNumber
    if (isOwnDelivery(current)) {
      delete next.transporter
      delete next.driverName
    }
  }

  if (rule.direction === 'back' && rule.pickupOnly && to === 'preparado') {
    delete next.receiverName
    delete next.receiverDni
  }

  if (current.status === 'preparado' && to === 'pendiente') {
    delete next.preparedBy
    delete next.preparedAt
    delete next.prepMs
    delete next.prepIncomplete
    delete next.prepChecklist
    delete next.preparation
  }

  stampStatus(next, current)

  if (options.fromSheet !== true && current.status === 'asignado' && to === 'en-viaje') {
    const waiting = await requireFreshSheet(orders, current)
    if (waiting) return waiting
  }
  if (options.fromSheet !== true) {
    const blocked = await blockPlannedDeparture(user, current, next)
    if (blocked) return blocked
  }
  const synced = await syncSheetOnEdit(orders, current, next, user)
  if (synced.error) return synced

  pushHistory(next, {
    at: next.updatedAt,
    by: { id: user.id, name: typeof user.name === 'string' ? user.name : '' },
    from: current.status,
    to,
    reason: historyReason,
    via,
  })

  const index = orders.findIndex((item) => item.id === current.id)
  if (index < 0) return fail('No existe ese pedido.', 404)
  orders[index] = next
  if (options.fromSheet !== true) await syncSheetFreshness(orders)
  return { order: next, from: current.status, reason: reason.value, via }
}

function isOrderDriver(user, order) {
  if (typeof order.driverId === 'string' && order.driverId.length > 0) {
    return order.driverId === user.id
  }
  const carrier = normalizeName(user.carrierName)
  if (!carrier) return false
  return normalizeName(order.transporter) === carrier
}

function readTrackingNumber(input, current) {
  if (!Object.prototype.hasOwnProperty.call(input, 'trackingNumber')) {
    return { value: current.trackingNumber }
  }
  const value = input.trackingNumber
  if (value === null || value === '') return { value: '' }
  if (typeof value !== 'string') return fail('El tracking no es válido.')
  const trimmed = value.trim()
  if (trimmed.length > 80) return fail('El tracking es demasiado largo.')
  return { value: trimmed }
}

async function finishPreparation(next, current, input, user) {
  const nowMs = Date.parse(next.updatedAt)
  const holder = activeHolder(current, nowMs)
  if (user.role === 'deposito' && holder && holder.id !== user.id) {
    return fail(`Lo está armando ${holder.name || 'otro operario'}`, 409)
  }
  const sessions = sessionsOf(current)
  const takenAt = takenAtOf(current)
  const stale = Boolean(takenByOf(current)) && (!takenAt || isTakeStale(takenAt, nowMs))
  const end =
    stale && takenAt && Number.isFinite(Date.parse(takenAt))
      ? new Date(Date.parse(takenAt) + TAKE_STALE_MS).toISOString()
      : next.updatedAt
  closeOpenSessions(sessions, end)
  const prepMs = sumPrepMs(sessions)
  next.preparedBy = actorOf(user)
  next.preparedAt = next.updatedAt
  next.prepMs = prepMs
  next.preparation = sessions.length > 0 ? { sessions } : undefined
  if (!next.preparation) delete next.preparation

  const sent = readChecklist(input)
  if (sent.error) return sent

  const orders = await readCollection('orders')
  const orderList = Array.isArray(orders) ? orders : []
  const picking = await readCollection('picking')
  const list = Array.isArray(picking) ? picking : []
  if (linkUniquePickingRows(list, orderList, current.id)) {
    await writeCollection('picking', list)
  }
  const rows = list.filter((row) => row && row.orderId === current.id)
  let incomplete = false
  let checklist
  if (rows.length > 0) {
    const total = rows.length
    const done = rows.filter((row) => rowIsPicked(row)).length
    checklist = { done, total }
    incomplete = done < total
    next.prepChecklist = checklist
    next.prepIncomplete = incomplete
  }

  const packages = next.packages
  let reason = incomplete
    ? `Armado incompleto (${packages} bultos, ${checklist.done} de ${checklist.total} artículos)`
    : `Armado (${packages} bultos)`
  if (prepMs != null) reason += ` · ${formatPrepMs(prepMs)}`
  return { reason }
}

function readChecklist(input) {
  if (!Object.prototype.hasOwnProperty.call(input, 'checklist')) return { value: undefined }
  const value = input.checklist
  if (!isRecord(value)) return fail('El checklist no es válido.')
  const { done, total } = value
  if (!Number.isInteger(done) || done < 0 || !Number.isInteger(total) || total < 1 || done > total) {
    return fail('El checklist no es válido.')
  }
  return { value: { done, total } }
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

function readPickupReceiver(input) {
  const rawName = Object.prototype.hasOwnProperty.call(input, 'receiverName')
    ? input.receiverName
    : undefined
  if (typeof rawName !== 'string' || !rawName.trim()) {
    return fail('Falta quién retira')
  }
  const name = rawName.trim()
  if (name.length > 120) return fail('El nombre de quien retira es demasiado largo.')
  let dni
  if (Object.prototype.hasOwnProperty.call(input, 'receiverDni')) {
    const value = input.receiverDni
    if (value === null || value === '') dni = undefined
    else if (typeof value !== 'string') return fail('El DNI no es válido.')
    else {
      const trimmed = value.trim()
      if (trimmed.length > 20) return fail('El DNI es demasiado largo.')
      dni = trimmed || undefined
    }
  }
  return { name, dni }
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
