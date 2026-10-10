import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import {
  assertPatch,
  canCreate,
  canSeeOrder,
  commercialKeys,
  diffOrder,
  nearbyDelivery,
  normalizeName,
} from './access.js'
import { saveAuthorizations, stageAuthorization } from './authorizations.js'
import { readCollection, writeCollection } from './db/store.js'
import { geocodeAddress } from './geocode.js'
import { locked } from './lock.js'
import { forgetUsers, putLocation, readLocations } from './locations.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyDelivered, notifyEncargados, notifySeller, notifyUser } from './notifications.js'
import { applyTransition, stampStatus, withHistory } from './orderFlow.js'
import { blockPlannedDeparture, closeFinishedSheets, pullOrderFromSheets, syncSheetOnEdit } from './routeSheets.js'
import { isActive, readUsersList } from './users.js'

const STATUSES = ['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado']
const DISPATCH = ['propia', 'correo', 'retiro']

export function isOwnDelivery(order) {
  return order?.dispatchType !== 'correo' && order?.dispatchType !== 'retiro'
}

export function isPickup(order) {
  return order?.dispatchType === 'retiro'
}

const REQUIRED_TEXT = [
  ['client', 'Ingresá el nombre del cliente.'],
  ['seller', 'Seleccioná un vendedor.'],
  ['phone', 'Ingresá un teléfono.'],
  ['address', 'Ingresá la dirección.'],
  ['propertyType', 'Seleccioná el tipo de propiedad.'],
  ['loadedAt', 'Falta la fecha de carga.'],
]

const OPTIONAL_TEXT = [
  ['zone', 'La zona'],
  ['amount', 'El monto'],
  ['timeWindow', 'La franja'],
  ['transporter', 'El transportista'],
  ['notes', 'Las notas'],
  ['attachmentName', 'El adjunto'],
  ['attachmentDataUrl', 'El adjunto'],
  ['receiverName', 'Quien recibe'],
  ['receiverDni', 'El DNI'],
  ['betweenStreet1', 'La entrecalle'],
  ['betweenStreet2', 'La entrecalle'],
  ['trackingNumber', 'El tracking'],
]

const PLACE_FIELDS = [
  ['floor', 'El piso'],
  ['unit', 'El depto'],
  ['doorbell', 'El timbre'],
]

function placeKind(propertyType) {
  const bare = String(propertyType ?? '')
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (bare === 'departamento' || bare === 'edificio' || bare === 'oficina') return 'building'
  if (bare === 'casa' || bare === 'local') return 'house'
  return 'other'
}

function touchesPlace(body) {
  if (!isRecord(body)) return false
  if (Object.prototype.hasOwnProperty.call(body, 'propertyType')) return true
  return PLACE_FIELDS.some(([key]) => Object.prototype.hasOwnProperty.call(body, key))
}

function clearPlace(order) {
  const kind = placeKind(order.propertyType)
  if (kind !== 'building') {
    delete order.floor
    delete order.unit
  }
  if (kind === 'other') delete order.doorbell
}

export const ordersRouter = Router()
ordersRouter.use(requireAuth)
ordersRouter.get('/', async (req, res) => {
  await send(res, async () => {
    const orders = await locked(readOrders)
    const visible = orders.filter((order) => canSeeOrder(req.user, order))
    if (req.user.role === 'chofer') {
      queueGeoIds(visible.filter((order) => needsGeo(order)).map((order) => order.id))
    }
    const planned = await plannedSheetIds()
    const users = await readUsersList()
    const driverNames = new Map()
    for (const user of users) {
      if (!user || typeof user.id !== 'string') continue
      const name = typeof user.name === 'string' ? user.name.trim() : ''
      if (name) driverNames.set(user.id, name)
    }
    res.json(
      byNewest(visible).map((order) => {
        const flagged = withSheetPlannedFlag(withHistory(order), planned)
        const driverId = typeof flagged.driverId === 'string' ? flagged.driverId : ''
        if (!driverId) return flagged
        const driverName = driverNames.get(driverId)
        if (!driverName) return flagged
        return { ...flagged, driverName }
      }),
    )
  })
})
ordersRouter.get('/:id', async (req, res) => {
  await send(res, async () => {
    const order = await getOrder(req.params.id)
    if (!order) {
      notFound(res)
      return
    }
    if (!canSeeOrder(req.user, order)) {
      res.status(403).json({ message: 'No tenés permiso para ver este pedido.' })
      return
    }
    if (req.user.role === 'chofer' && needsGeo(order)) queueGeoIds([order.id])
    res.json(await withClientFlags(withHistory(order)))
  })
})
ordersRouter.post('/', async (req, res) => {
  await send(res, async () => {
    const result = await createOrder(req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(withHistory(result.order))
    queueGeo(result.order)
  })
})
ordersRouter.patch('/:id/edits/:editId', async (req, res) => {
  await send(res, async () => {
    const result = await reviewEdit(req.params.id, req.params.editId, req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(withHistory(result.order))
    queueGeo(result.order)
  })
})
ordersRouter.post('/:id/transition', async (req, res) => {
  await send(res, async () => {
    const result = await transitionOrder(req.params.id, req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(withHistory(result.order))
    queueGeo(result.order)
  })
})
ordersRouter.patch('/:id', async (req, res) => {
  await send(res, async () => {
    const result = await patchOrder(req.params.id, req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(withHistory(result.order))
    queueGeo(result.order)
  })
})
ordersRouter.delete('/:id', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  await send(res, async () => {
    const result = await deleteOrder(req.params.id, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(204).end()
  })
})

function notFound(res) {
  res.status(404).json({ message: 'No existe ese pedido.' })
}

function sendError(res, result) {
  const body = { message: result.error }
  if (result.code) {
    body.code = result.code
    body.driver = result.driver
    body.driverId = result.driverId
    body.deliveryDate = result.deliveryDate
    body.timeWindow = result.timeWindow
    body.count = result.count
  }
  res.status(result.status).json(body)
}

async function send(res, task) {
  try {
    await task()
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) {
      res.status(500).json({ message: 'No se pudo completar la operación.' })
    }
  }
}

function byNewest(orders) {
  return [...orders].sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

async function readOrders() {
  return readCollection('orders')
}

async function writeOrders(orders) {
  await writeCollection('orders', orders)
}

function getOrder(id) {
  return locked(async () => {
    const orders = await readOrders()
    return orders.find((item) => item.id === id) ?? null
  })
}

function createOrder(body, user) {
  return locked(async () => {
    if (!canCreate(user)) return fail('No podés cargar pedidos.', 403)
    if (user.role === 'vendedor' && !normalizeName(user.sellerName)) {
      return fail(
        'Tu usuario todavía no está vinculado a un vendedor. Pedíselo al administrador.',
        403,
      )
    }
    if (!isRecord(body)) return fail('El pedido no es válido.')
    const orders = await readOrders()
    const parsed = readOrderFields(body, null)
    if (parsed.error) return parsed
    if (user.role === 'vendedor' && parsed.order.status !== 'pendiente') {
      return fail('El pedido se carga en pendiente.', 403)
    }
    if (user.role === 'vendedor' && (parsed.order.packages != null || parsed.order.driverId)) {
      return fail('No podés asignar bultos ni chofer al cargar el pedido.', 403)
    }
    const otherSeller =
      user.role === 'vendedor' &&
      normalizeName(parsed.order.seller) !== normalizeName(user.sellerName)
    delete parsed.order.driverId
    const createdAt = new Date().toISOString()
    const order = {
      ...parsed.order,
      id: nextId(orders),
      createdBy: user.id,
      createdAt,
      history: [
        {
          at: createdAt,
          by: { id: user.id, name: typeof user.name === 'string' ? user.name : '' },
          from: null,
          to: 'pendiente',
          reason: 'Creado',
          via: 'pedidos',
        },
      ],
    }
    if (!isPickup(order)) {
      const windowRule = requireDriverWindow(null, order)
      if (windowRule.error) return windowRule
      const slot = await checkSlot(orders, null, order, user, body.override === true)
      if (slot.error) return slot
      if (slot.authorized) rememberOverride(order, user)
    }
    let staged = null
    if (otherSeller) {
      staged = await stageAuthorization(user.id, parsed.order.seller, order.id)
      if (!staged) {
        return fail('Necesitás una autorización aprobada para cargar a nombre de ese vendedor.', 403)
      }
    }
    orders.push(order)
    await writeOrders(orders)
    if (staged) {
      try {
        await saveAuthorizations(staged)
      } catch (error) {
        await writeOrders(orders.filter((item) => item.id !== order.id))
        throw error
      }
    }
    return { order }
  })
}

function patchOrder(id, body, user) {
  return locked(async () => {
    if (!isRecord(body)) return fail('El pedido no es válido.')
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      return fail('Usá /transition para cambiar el estado', 400)
    }
    const orders = await readOrders()
    const index = orders.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe ese pedido.', 404)
    const current = orders[index]
    if (!canSeeOrder(user, current)) return fail('No tenés permiso para modificar este pedido.', 403)
    if (current.status === 'entregado' && !deliveredTrackingOnly(body, user)) {
      return fail('No se puede editar un pedido entregado.', 409)
    }
    if (!hasChange(body)) return fail('No hay cambios para guardar.')
    const parsed = readOrderFields(body, current)
    if (parsed.error) return parsed
    const reason = readReason(body)
    if (reason.error) return reason
    const baseline = withDefaultDispatch(current)
    const compared = withDefaultDispatch(parsed.order)
    const tracked = diffOrder(baseline, compared)
    const changes = { ...tracked, ...placeChanges(current, parsed.order) }
    if (Object.keys(changes).length === 0) return fail('No hay cambios para guardar.')

    if (Object.prototype.hasOwnProperty.call(changes, 'dispatchType')) {
      if (current.status !== 'pendiente' && current.status !== 'preparado') {
        return fail('Para cambiar el despacho, volvé a preparado', 409)
      }
    }

    const driverChanged = Object.prototype.hasOwnProperty.call(changes, 'driverId')
    if (driverChanged) {
      if (!isOwnDelivery(baseline)) {
        return fail(
          isPickup(baseline) ? 'Los retiros por el local no llevan chofer' : 'Los envíos por correo no llevan chofer',
          409,
        )
      }
      if (current.status !== 'asignado') {
        return fail('Para cambiar el chofer usá Asignar o Volver a preparado', 409)
      }
      const nextDriver = typeof parsed.order.driverId === 'string' ? parsed.order.driverId : ''
      const prevDriver = typeof current.driverId === 'string' ? current.driverId : ''
      if (!nextDriver || nextDriver === prevDriver) {
        return fail('Para cambiar el chofer usá Asignar o Volver a preparado', 409)
      }
    }
    const historyVia = patchVia(body)

    const allowed = assertPatch(user, current, tracked)
    if (allowed.error) return allowed
    if (hasPlaceChange(changes) && user.role !== 'vendedor' && user.role !== 'encargado_deposito' && user.role !== 'admin') {
      return fail('No podés cambiar esos datos del pedido.', 403)
    }
    const driver = await checkDriver(parsed.order.driverId, current.driverId)
    if (driver.error) return driver
    const proposing = user.role === 'vendedor' && current.status === 'preparado'
    let slot = { ok: true }
    if (!isPickup(parsed.order)) {
      const windowRule = requireDriverWindow(current, parsed.order)
      if (windowRule.error) return windowRule
      if (!proposing) {
        slot = await checkSlot(orders, current, parsed.order, user, body.override === true)
        if (slot.error) return slot
      }
    }
    if (needsReason(user, changes) && !reason.value && !driverChanged) {
      return fail('Ingresá el motivo de la edición.')
    }

    if (user.role === 'vendedor' && current.status === 'preparado') {
      if (hasPending(current)) {
        return fail('Este pedido ya tiene una edición esperando confirmación.')
      }
      const order = {
        ...current,
        edits: [...editsOf(current), makeEdit(user, reason.value, changes, 'pendiente')],
      }
      orders[index] = order
      await writeOrders(orders)
      await notifyEncargados({
        text: `${user.name} pidió editar el pedido ${order.id} y quedó esperando confirmación: ${reason.value}`,
        orderId: order.id,
        whatsapp: true,
        phone: user.phone,
      })
      return { order }
    }

    const order = {
      ...parsed.order,
      edits: editsOf(current),
      history: Array.isArray(current.history)
        ? current.history.map((entry) => ({ ...entry, by: { ...entry.by } }))
        : undefined,
      updatedAt: new Date().toISOString(),
    }
    if (slot.authorized) rememberOverride(order, user)
    if (
      reason.value &&
      (user.role === 'vendedor' || commercialKeys(changes).length > 0 || hasPlaceChange(changes))
    ) {
      order.edits = [...order.edits, makeEdit(user, reason.value, changes, 'aplicada')]
    }
    if (driverChanged) {
      const users = await readUsersList()
      const prevName = driverLabel(users, current.driverId)
      const nextName = driverLabel(users, order.driverId)
      const history = Array.isArray(order.history)
        ? order.history.map((entry) => ({ ...entry, by: { ...entry.by } }))
        : withHistory(current).history.map((entry) => ({ ...entry, by: { ...entry.by } }))
      history.push({
        at: order.updatedAt,
        by: { id: user.id, name: typeof user.name === 'string' ? user.name : '' },
        from: 'asignado',
        to: 'asignado',
        reason: `Cambio de chofer: ${prevName} → ${nextName}`,
        via: historyVia,
      })
      order.history = history
    }
    const blocked = await blockPlannedDeparture(user, current, order)
    if (blocked) return blocked
    const synced = await syncSheetOnEdit(orders, current, order)
    if (synced.error) return synced
    orders[index] = order
    await writeOrders(orders)
    await closeFinishedSheets(orders)
    if (user.role === 'vendedor') {
      await notifyEncargados({
        text: `${user.name} editó el pedido ${order.id}: ${reason.value}`,
        orderId: order.id,
        whatsapp: false,
      })
    } else if (
      user.role === 'encargado_deposito' &&
      (commercialKeys(changes).length > 0 || hasPlaceChange(changes))
    ) {
      await notifySeller(
        current,
        user,
        `${user.name} editó el pedido ${current.id}: ${reason.value}`,
      )
    }
    if (changes.status === 'entregado' && current.status !== 'entregado') {
      await notifyDelivered(order)
    }
    await releaseIfIdle(orders, current, order)
    return { order }
  })
}

function driverLabel(users, driverId) {
  if (typeof driverId !== 'string' || !driverId) return 'Sin chofer'
  const driver = users.find((item) => item.id === driverId)
  const name = driver && typeof driver.name === 'string' ? driver.name.trim() : ''
  return name || driverId
}

async function withDriverName(order) {
  if (!order || typeof order !== 'object') return order
  const driverId = typeof order.driverId === 'string' ? order.driverId : ''
  if (!driverId) return order
  const users = await readUsersList()
  const driver = users.find((item) => item.id === driverId)
  const name = driver && typeof driver.name === 'string' ? driver.name.trim() : ''
  if (!name) return order
  return { ...order, driverName: name }
}

function withSheetPlannedFlag(order, plannedIds) {
  if (!order || typeof order !== 'object') return order
  const routeId = typeof order.routeId === 'string' ? order.routeId : ''
  return { ...order, sheetPlanned: Boolean(routeId && plannedIds.has(routeId)) }
}

async function plannedSheetIds() {
  const sheets = await readCollection('routeSheets')
  return new Set(
    sheets.filter((item) => item && item.status === 'planificada' && typeof item.id === 'string').map((item) => item.id),
  )
}

async function withClientFlags(order) {
  const withName = await withDriverName(order)
  return withSheetPlannedFlag(withName, await plannedSheetIds())
}

const TRANSITION_VIAS = new Set(['pedidos', 'despacho', 'mis-entregas', 'qr', 'picking', 'panel'])
const PATCH_VIAS = new Set(['despacho', 'pedidos'])

function patchVia(body) {
  const via = typeof body?.via === 'string' ? body.via.trim() : ''
  if (PATCH_VIAS.has(via)) return via
  return 'pedidos'
}

function withDefaultDispatch(order) {
  if (!order || typeof order !== 'object') return order
  if (order.dispatchType === 'propia' || order.dispatchType === 'correo' || order.dispatchType === 'retiro') {
    return order
  }
  return { ...order, dispatchType: 'propia' }
}

function transitionOrder(id, body, user) {
  return locked(async () => {
    if (!isRecord(body)) return fail('La transición no es válida.')
    const via = typeof body.via === 'string' ? body.via.trim() : ''
    if (!TRANSITION_VIAS.has(via)) return fail('via no válido')
    const orders = await readOrders()
    const index = orders.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe ese pedido.', 404)
    const current = orders[index]
    if (!canSeeOrder(user, current)) return fail('No tenés permiso para modificar este pedido.', 403)
    const result = await applyTransition(orders, current, body, user, via)
    if (result.error) return result
    await writeOrders(orders)
    await closeFinishedSheets(orders)
    if (result.order.status === 'entregado' && current.status !== 'entregado') {
      await notifyDelivered(result.order)
    }
    await releaseIfIdle(orders, current, result.order)
    return { order: result.order }
  })
}

function reviewEdit(orderId, editId, body, user) {
  return locked(async () => {
    if (user.role !== 'encargado_deposito' && user.role !== 'admin') {
      return fail('No tenés permiso para confirmar ediciones.', 403)
    }
    const decision = body?.status
    if (decision !== 'aplicada' && decision !== 'rechazada') {
      return fail('Indicá si aprobás o rechazás la edición.')
    }
    const orders = await readOrders()
    const index = orders.findIndex((item) => item.id === orderId)
    if (index < 0) return fail('No existe ese pedido.', 404)
    const current = orders[index]
    const edits = editsOf(current)
    const editIndex = edits.findIndex((item) => item.id === editId)
    if (editIndex < 0) return fail('No existe esa edición.', 404)
    const pending = edits[editIndex]
    if (pending.status !== 'pendiente') {
      return fail('Esa edición ya no está esperando confirmación.')
    }
    if (decision === 'aplicada' && current.status === 'entregado') {
      return fail('No se puede editar un pedido entregado.', 409)
    }
    if (decision === 'aplicada' && current.status !== 'preparado') {
      return fail('El pedido ya avanzó, no se puede aplicar el cambio.', 409)
    }
    if (decision === 'rechazada') {
      edits[editIndex] = { ...pending, status: 'rechazada' }
      const order = { ...current, edits }
      orders[index] = order
      await writeOrders(orders)
      await notifyEditReview(pending, user, current.id, decision)
      return { order }
    }
    const parsed = readOrderFields(pending.changes, current)
    if (parsed.error) return parsed
    let slot = { ok: true }
    if (!isPickup(parsed.order)) {
      const windowRule = requireDriverWindow(current, parsed.order)
      if (windowRule.error) return windowRule
      slot = await checkSlot(orders, current, parsed.order, user, body?.override === true)
      if (slot.error) return slot
    }
    edits[editIndex] = { ...pending, status: 'aplicada' }
    const order = {
      ...parsed.order,
      edits,
      history: Array.isArray(current.history)
        ? current.history.map((entry) => ({ ...entry, by: { ...entry.by } }))
        : undefined,
      updatedAt: new Date().toISOString(),
    }
    if (slot.authorized) rememberOverride(order, user)
    const synced = await syncSheetOnEdit(orders, current, order)
    if (synced.error) return synced
    orders[index] = order
    await writeOrders(orders)
    await closeFinishedSheets(orders)
    await notifyEditReview(pending, user, current.id, decision)
    return { order }
  })
}

function deleteOrder(id, user) {
  return locked(async () => {
    const orders = await readOrders()
    const current = orders.find((item) => item.id === id)
    if (!current) return fail('No existe ese pedido.', 404)
    if (!canSeeOrder(user, current)) return fail('No tenés permiso para cancelar este pedido.', 403)
    if (user.role === 'encargado_deposito' && (current.status === 'en-viaje' || current.status === 'entregado')) {
      return fail('No podés cancelar un pedido que ya salió.', 403)
    }
    const remaining = orders.filter((item) => item.id !== id)
    await pullOrderFromSheets(remaining, id)
    await writeOrders(remaining)
    await closeFinishedSheets(remaining)
    if (current.status === 'en-viaje') await releaseIdleDrivers(remaining, driverIdOf(current))
    return { ok: true }
  })
}

async function notifyEditReview(edit, reviewer, orderId, decision) {
  if (!edit.by || edit.by === reviewer.id) return
  const text =
    decision === 'aplicada'
      ? `Se aprobó tu edición del pedido ${orderId}.`
      : `Se rechazó tu edición del pedido ${orderId}.`
  await notifyUser(edit.by, { text, orderId })
}

function editsOf(order) {
  return Array.isArray(order.edits) ? order.edits.map((edit) => ({ ...edit, changes: { ...edit.changes } })) : []
}

function hasPending(order) {
  return Array.isArray(order.edits) && order.edits.some((edit) => edit.status === 'pendiente')
}

function needsReason(user, changes) {
  if (user.role === 'vendedor') return true
  if (user.role === 'encargado_deposito') {
    return commercialKeys(changes).length > 0 || hasPlaceChange(changes)
  }
  return false
}

function placeChanges(current, next) {
  const changes = {}
  for (const [key] of PLACE_FIELDS) {
    if (current?.[key] === next?.[key]) continue
    changes[key] = next?.[key] === undefined ? null : next[key]
  }
  return changes
}

function hasPlaceChange(changes) {
  return PLACE_FIELDS.some(([key]) => Object.prototype.hasOwnProperty.call(changes, key))
}

function readReason(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'reason')) return { value: '' }
  if (typeof body.reason !== 'string') return fail('El motivo no es válido.')
  const value = body.reason.trim()
  if (!value) return { value: '' }
  if (value.length > 300) return fail('El motivo es demasiado largo.')
  return { value }
}

function makeEdit(user, reason, changes, status) {
  return {
    id: randomUUID(),
    by: user.id,
    at: new Date().toISOString(),
    reason,
    changes,
    status,
  }
}

export async function checkDriver(driverId, previous) {
  if (!driverId || driverId === previous) return { ok: true }
  const users = await readUsersList()
  const driver = users.find((item) => item.id === driverId)
  if (!driver || driver.role !== 'chofer') return fail('Elegí un chofer.')
  if (!isActive(driver)) return fail('Ese chofer está desactivado')
  return { ok: true }
}

const SLOT_LIMIT = 3

/** "09:00 - 13:00", "9:00–13:00" y "9:00-13:00" quedan como 09:00-13:00. */
export function normalizeTimeWindow(value) {
  if (typeof value !== 'string') return ''
  const compact = value.trim().replace(/[–—]/g, '-').replace(/\s+/g, '')
  if (!compact) return ''
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(compact)
  if (!match) return compact
  const hour = (part) => part.padStart(2, '0')
  return `${hour(match[1])}:${match[2]}-${hour(match[3])}:${match[4]}`
}

function driverKey(order) {
  return typeof order?.driverId === 'string' ? order.driverId : ''
}

function requireDriverWindow(current, next) {
  const nextDriver = driverKey(next)
  if (!nextDriver) return { ok: true }
  const nextWindow = normalizeTimeWindow(next?.timeWindow)
  if (current) {
    const sameDriver = driverKey(current) === nextDriver
    const sameWindow = normalizeTimeWindow(current.timeWindow) === nextWindow
    if (sameDriver && sameWindow) return { ok: true }
  }
  if (nextWindow) return { ok: true }
  const clearing = Boolean(current && normalizeTimeWindow(current.timeWindow) && driverKey(current) === nextDriver)
  return {
    error: clearing
      ? 'Para sacar la franja, primero pasalo a Sin chofer.'
      : 'Asigná una franja antes de elegir chofer.',
    status: 400,
    code: 'FRANJA_REQUERIDA',
  }
}

function occupiesSlot(order) {
  return Boolean(
    order &&
      isOwnDelivery(order) &&
      order.driverId &&
      order.deliveryDate &&
      normalizeTimeWindow(order.timeWindow),
  )
}

function sameSlot(left, right) {
  return (
    left.driverId === right.driverId &&
    left.deliveryDate === right.deliveryDate &&
    normalizeTimeWindow(left.timeWindow) === normalizeTimeWindow(right.timeWindow)
  )
}

/** Pedidos del chofer en esa fecha y esa franja. No cuenta el pedido editado. */
export function countDriverSlot(orders, driverId, deliveryDate, timeWindow, exceptId) {
  const window = normalizeTimeWindow(timeWindow)
  if (!driverId || !deliveryDate || !window) return 0
  return orders.filter((order) => {
    if (order.id === exceptId) return false
    if (!isOwnDelivery(order)) return false
    if (order.driverId !== driverId) return false
    if (order.deliveryDate !== deliveryDate) return false
    return normalizeTimeWindow(order.timeWindow) === window
  }).length
}

export async function checkSlot(orders, current, next, user, override) {
  if (!occupiesSlot(next)) return { ok: true }
  if (current && occupiesSlot(current) && sameSlot(current, next)) return { ok: true }
  const count = countDriverSlot(orders, next.driverId, next.deliveryDate, next.timeWindow, next.id)
  if (count < SLOT_LIMIT) return { ok: true }
  const canOverride = user.role === 'encargado_deposito' || user.role === 'admin'
  if (override === true && canOverride) return { ok: true, authorized: true }
  const users = await readUsersList()
  const driver = users.find((item) => item.id === next.driverId)
  const name = driver && driver.name && driver.name.trim() ? driver.name.trim() : 'el chofer'
  return {
    error: `El chofer ya tiene ${count} ${count === 1 ? 'pedido' : 'pedidos'} en esta franja.`,
    status: 409,
    code: 'FRANJA_LLENA',
    driver: name,
    driverId: next.driverId,
    deliveryDate: next.deliveryDate,
    timeWindow: normalizeTimeWindow(next.timeWindow),
    count,
  }
}

export function rememberOverride(order, user) {
  const previous = Array.isArray(order.slotOverrides) ? order.slotOverrides : []
  order.slotOverrides = [
    ...previous,
    {
      by: user.id,
      at: new Date().toISOString(),
      driverId: order.driverId,
      deliveryDate: order.deliveryDate,
      timeWindow: order.timeWindow,
    },
  ]
}

function fail(error, status = 400) {
  return { error, status }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasChange(body) {
  const keys = [
    ...REQUIRED_TEXT.map(([key]) => key),
    'deliveryDate',
    'status',
    ...OPTIONAL_TEXT.map(([key]) => key),
    'invoices',
    'collectOnDelivery',
    'requiresPickup',
    'dispatchType',
    'packages',
    'driverId',
    ...PLACE_FIELDS.map(([key]) => key),
  ]
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key))
}

/** Encargado/admin pueden PATCH solo trackingNumber de un pedido entregado. */
function deliveredTrackingOnly(body, user) {
  if (user.role !== 'encargado_deposito' && user.role !== 'admin') return false
  if (!isRecord(body)) return false
  const meta = new Set(['via', 'reason', 'override'])
  const fieldKeys = Object.keys(body).filter((key) => !meta.has(key))
  return fieldKeys.length === 1 && fieldKeys[0] === 'trackingNumber'
}

function nextId(orders) {
  const used = new Set(orders.map((item) => item.id))
  let id = ''
  do {
    id = `P-${Math.floor(1000000 + Math.random() * 9000000)}`
  } while (used.has(id))
  return id
}

function effectiveDispatch(body, current) {
  if (Object.prototype.hasOwnProperty.call(body, 'dispatchType')) {
    const value = body.dispatchType
    if (typeof value === 'string' && DISPATCH.includes(value)) return value
    return null
  }
  if (current?.dispatchType === 'propia' || current?.dispatchType === 'correo' || current?.dispatchType === 'retiro') {
    return current.dispatchType
  }
  return 'propia'
}

function readOrderFields(body, current) {
  const order = current
    ? {
        id: current.id,
        createdBy: current.createdBy,
        createdAt: current.createdAt,
      }
    : {}

  const dispatchType = effectiveDispatch(body, current)
  if (dispatchType === null) return fail('El tipo de despacho no es válido.')
  const storePickup = dispatchType === 'retiro'

  for (const [key, message] of REQUIRED_TEXT) {
    if ((key === 'address' || key === 'propertyType') && storePickup) {
      const label = key === 'address' ? 'La dirección' : 'El tipo de propiedad'
      const read = readOptionalText(body, current, key, label)
      if (read.error) return read
      if (read.value !== undefined) order[key] = read.value
      continue
    }
    if (current && !Object.prototype.hasOwnProperty.call(body, key)) {
      order[key] = current[key]
      continue
    }
    const text = readRequiredText(body[key])
    if (!text) return fail(message)
    order[key] = text
  }

  if (!storePickup && !readRequiredText(order.address)) {
    return fail('Ingresá la dirección.')
  }
  if (!storePickup && !readRequiredText(order.propertyType)) {
    return fail('Seleccioná el tipo de propiedad.')
  }

  if (current && !Object.prototype.hasOwnProperty.call(body, 'deliveryDate')) {
    order.deliveryDate = current.deliveryDate
  } else {
    const date = readRequiredText(body.deliveryDate)
    if (!date) return fail(storePickup ? 'Elegí la fecha de retiro.' : 'Elegí la fecha de entrega.')
    if (!isIsoDate(date)) {
      return fail(storePickup ? 'La fecha de retiro no es válida.' : 'La fecha de entrega no es válida.')
    }
    order.deliveryDate = date
  }

  const status = readStatus(body, current)
  if (status.error) return status
  order.status = status.value

  for (const [key, label] of OPTIONAL_TEXT) {
    const read = readOptionalText(body, current, key, label)
    if (read.error) return read
    if (read.value !== undefined) {
      if (key === 'trackingNumber' && read.value.length > 80) {
        return fail('El tracking puede tener hasta 80 caracteres.')
      }
      order[key] =
        key === 'timeWindow' && Object.prototype.hasOwnProperty.call(body, key)
          ? normalizeTimeWindow(read.value)
          : read.value
    }
  }

  for (const [key, label] of PLACE_FIELDS) {
    const read = readPlaceField(body, current, key, label)
    if (read.error) return read
    if (read.value !== undefined) order[key] = read.value
  }
  if (!current || touchesPlace(body)) clearPlace(order)

  const invoices = readInvoices(body, current)
  if (invoices.error) return invoices
  if (invoices.value !== undefined) order.invoices = invoices.value

  const collect = readBool(body, current, 'collectOnDelivery', 'El cobro contra entrega')
  if (collect.error) return collect
  if (collect.value !== undefined) order.collectOnDelivery = collect.value

  const pickup = readBool(body, current, 'requiresPickup', 'El retiro')
  if (pickup.error) return pickup
  if (pickup.value !== undefined) order.requiresPickup = pickup.value

  const dispatch = readDispatch(body, current)
  if (dispatch.error) return dispatch
  if (dispatch.value !== undefined) order.dispatchType = dispatch.value
  else order.dispatchType = dispatchType

  const packages = readPackages(body, current)
  if (packages.error) return packages
  if (packages.value !== undefined) order.packages = packages.value

  const driver = readDriver(body, current)
  if (driver.error) return driver
  if (driver.value !== undefined) order.driverId = driver.value

  if (storePickup) {
    delete order.driverId
    delete order.transporter
    delete order.timeWindow
  }

  if (order.status === 'preparado' && order.packages == null) {
    return fail('Indicá la cantidad de bultos.')
  }
  if (!storePickup && !order.betweenStreet1 && !order.betweenStreet2) {
    return fail('Completá al menos una entre calle.')
  }
  if (order.collectOnDelivery && !order.amount) {
    return fail('Ingresá el monto a cobrar.')
  }
  if (current && order.address === current.address) {
    if (typeof current.lat === 'number' && Number.isFinite(current.lat)) order.lat = current.lat
    if (typeof current.lng === 'number' && Number.isFinite(current.lng)) order.lng = current.lng
    if (current.geoMiss === true) order.geoMiss = true
    if (typeof current.geoRetryAt === 'string') order.geoRetryAt = current.geoRetryAt
  }
  if (Array.isArray(current?.slotOverrides)) {
    order.slotOverrides = current.slotOverrides.map((item) => ({ ...item }))
  }
  stampStatus(order, current)
  return { order }
}

function readRequiredText(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function readStatus(body, current) {
  if (!current) return { value: 'pendiente' }
  if (!Object.prototype.hasOwnProperty.call(body, 'status')) {
    return { value: current.status }
  }
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
    return fail('El estado no es válido.')
  }
  return { value: body.status }
}

function readPlaceField(body, current, key, label) {
  const read = readOptionalText(body, current, key, label)
  if (read.error) return read
  if (read.value && read.value.length > 20) return fail(`${label} puede tener hasta 20 caracteres.`)
  return read
}

function readOptionalText(body, current, key, label) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { value: current ? current[key] : undefined }
  }
  const value = body[key]
  if (value === null) return { value: undefined }
  if (typeof value !== 'string') return fail(`${label} no es válido.`)
  const trimmed = value.trim()
  return { value: trimmed || undefined }
}

function readInvoices(body, current) {
  if (!Object.prototype.hasOwnProperty.call(body, 'invoices')) {
    return { value: current ? current.invoices : undefined }
  }
  const value = body.invoices
  if (value === null) return { value: undefined }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return fail('Las facturas no son válidas.')
  }
  const invoices = value.map((item) => item.trim()).filter(Boolean)
  return { value: invoices.length > 0 ? invoices : undefined }
}

function readBool(body, current, key, label) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { value: current ? current[key] : undefined }
  }
  const value = body[key]
  if (value === null) return { value: undefined }
  if (typeof value !== 'boolean') return fail(`${label} no es válido.`)
  return { value }
}

function readDispatch(body, current) {
  if (!Object.prototype.hasOwnProperty.call(body, 'dispatchType')) {
    return { value: current ? current.dispatchType : undefined }
  }
  const value = body.dispatchType
  if (value === null) return { value: undefined }
  if (typeof value !== 'string' || !DISPATCH.includes(value)) {
    return fail('El tipo de despacho no es válido.')
  }
  return { value }
}

function readDriver(body, current) {
  if (!Object.prototype.hasOwnProperty.call(body, 'driverId')) {
    return { value: current ? current.driverId : undefined }
  }
  const value = body.driverId
  if (value === null || value === '') return { value: undefined }
  if (typeof value !== 'string' || !value.trim()) return fail('Elegí un chofer.')
  return { value: value.trim() }
}

export function updateDriverLocation(user, point) {
  return locked(async () => {
    const orders = await readOrders()
    if (!stillTraveling(orders, user)) {
      await forgetUsers([user.id])
      return { error: 'No hay pedidos en viaje.', status: 409 }
    }
    await putLocation(user.id, point)
    return { ok: true }
  })
}

export function listLiveDrivers() {
  return locked(async () => {
    const locations = await readLocations()
    const users = await readUsersList()
    const orders = await readOrders()
    const byId = new Map(users.map((user) => [user.id, user]))
    const drop = []
    const rows = []
    for (const [userId, point] of Object.entries(locations)) {
      const user = byId.get(userId)
      const carrier = typeof user?.carrierName === 'string' ? user.carrierName.trim() : ''
      const live =
        user?.role === 'chofer' && isActive(user) && stillTraveling(orders, user) && isStoredPoint(point)
      if (!live) {
        drop.push(userId)
        continue
      }
      rows.push({
        id: user.id,
        name: user.name,
        carrierName: carrier,
        lat: point.lat,
        lng: point.lng,
        accuracy: typeof point.accuracy === 'number' ? point.accuracy : null,
        timestamp: point.timestamp,
        updatedAt: point.updatedAt,
        traveling: travelingCount(orders, user),
      })
    }
    if (drop.length > 0) await forgetUsers(drop)
    rows.sort((left, right) => left.name.localeCompare(right.name, 'es'))
    return rows
  })
}

function isStoredPoint(point) {
  return (
    Boolean(point) &&
    typeof point.lat === 'number' &&
    Number.isFinite(point.lat) &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lng) &&
    typeof point.timestamp === 'number' &&
    Number.isFinite(point.timestamp) &&
    typeof point.updatedAt === 'string'
  )
}

function driverTraveling(user, order) {
  if (!isOwnDelivery(order)) return false
  if (order.status !== 'en-viaje' || !nearbyDelivery(order.deliveryDate)) return false
  if (typeof order.driverId === 'string' && order.driverId) return order.driverId === user?.id
  const carrier = normalizeName(user?.carrierName)
  if (!carrier) return false
  return normalizeName(order.transporter) === carrier
}

function travelingCount(orders, user) {
  if (!user?.id) return 0
  return orders.filter((order) => driverTraveling(user, order)).length
}

function stillTraveling(orders, user) {
  return travelingCount(orders, user) > 0
}

function driverIdOf(order) {
  return typeof order?.driverId === 'string' && order.driverId ? order.driverId : ''
}

async function releaseIfIdle(orders, previous, next) {
  if (previous?.status !== 'en-viaje' && next?.status !== 'en-viaje') return
  const ids = new Set()
  const previousId = driverIdOf(previous)
  const nextId = driverIdOf(next)
  if (previousId) ids.add(previousId)
  if (nextId) ids.add(nextId)
  for (const id of ids) await releaseIdleDrivers(orders, id)
}

async function releaseIdleDrivers(orders, userId) {
  if (!userId) return
  const users = await readUsersList()
  const user = users.find((item) => item.id === userId)
  if (!user || user.role !== 'chofer' || stillTraveling(orders, user)) return
  await forgetUsers([userId])
}

function hasCoords(order) {
  return Number.isFinite(order?.lat) && Number.isFinite(order?.lng)
}

const GEO_RETRY_MS = 60 * 60 * 1000

function needsGeo(order) {
  if (isPickup(order)) return false
  if (!order?.address || hasCoords(order) || order.geoMiss === true) return false
  if (typeof order.geoRetryAt === 'string') {
    const at = Date.parse(order.geoRetryAt)
    if (Number.isFinite(at) && at > Date.now()) return false
  }
  return true
}

function queueGeo(order) {
  if (needsGeo(order)) queueGeoIds([order.id])
}

function queueGeoIds(ids) {
  if (ids.length === 0) return
  void fillCoordinates(ids).catch((error) => {
    console.error('No se pudo geocodificar', error)
  })
}

function isRetryable(error) {
  return (
    Boolean(error?.retry) ||
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error?.name === 'TypeError' ||
    error?.name === 'SyntaxError'
  )
}

async function fillCoordinates(ids) {
  const wanted = new Set(ids)
  const pending = await locked(async () => {
    const orders = await readOrders()
    return orders
      .filter((order) => wanted.has(order.id) && needsGeo(order))
      .map((order) => ({ id: order.id, address: order.address }))
  })
  for (const item of pending) {
    let point
    try {
      point = await geocodeAddress(item.address)
    } catch (error) {
      if (!isRetryable(error)) throw error
      await locked(async () => {
        const orders = await readOrders()
        const order = orders.find((entry) => entry.id === item.id)
        if (!order || order.address !== item.address || !needsGeo(order)) return
        order.geoRetryAt = new Date(Date.now() + GEO_RETRY_MS).toISOString()
        await writeOrders(orders)
      })
      if (error?.status === 429) break
      continue
    }
    await locked(async () => {
      const orders = await readOrders()
      const order = orders.find((entry) => entry.id === item.id)
      if (!order || order.address !== item.address || !needsGeo(order)) return
      if (point) {
        order.lat = point.lat
        order.lng = point.lng
        delete order.geoMiss
        delete order.geoRetryAt
      } else {
        order.geoMiss = true
        delete order.geoRetryAt
      }
      await writeOrders(orders)
    })
  }
}

function readPackages(body, current) {
  if (!Object.prototype.hasOwnProperty.call(body, 'packages')) {
    return { value: current ? current.packages : undefined }
  }
  const value = body.packages
  if (value === null) return { value: undefined }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fail('La cantidad de bultos tiene que ser un entero de 1 o más.')
  }
  return { value }
}
