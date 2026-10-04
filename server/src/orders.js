import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { geocodeAddress } from './geocode.js'
import { locked } from './lock.js'
import { forgetUsers, putLocation, readLocations } from './locations.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyDelivered, notifyEncargados, notifySeller, notifyUser } from './notifications.js'
import { readUsersList } from './users.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const ordersFile = path.join(dataDir, 'orders.json')

const STATUSES = ['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado']
const DISPATCH = ['propia', 'correo']

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
]

export const ordersRouter = Router()
ordersRouter.use(requireAuth)
ordersRouter.get('/', async (req, res) => {
  await send(res, async () => {
    const orders = await locked(readOrders)
    const visible = orders.filter((order) => canSeeOrder(req.user, order))
    if (req.user.role === 'chofer') {
      queueGeoIds(visible.filter((order) => needsGeo(order)).map((order) => order.id))
    }
    res.json(byNewest(visible))
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
    res.json(order)
  })
})
ordersRouter.post('/', async (req, res) => {
  await send(res, async () => {
    const result = await createOrder(req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(result.order)
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
    res.json(result.order)
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
    res.json(result.order)
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
  } catch {
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
  try {
    const raw = await readFile(ordersFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeOrders(orders) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(ordersFile, `${JSON.stringify(orders, null, 2)}\n`, 'utf8')
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
    const driver = await checkDriver(parsed.order.driverId)
    if (driver.error) return driver
    const order = {
      ...parsed.order,
      id: nextId(orders),
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    }
    const slot = await checkSlot(orders, null, order, user, body.override === true)
    if (slot.error) return slot
    if (slot.authorized) rememberOverride(order, user)
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
    const orders = await readOrders()
    const index = orders.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe ese pedido.', 404)
    const current = orders[index]
    if (!canSeeOrder(user, current)) return fail('No tenés permiso para modificar este pedido.', 403)
    if (!hasChange(body)) return fail('No hay cambios para guardar.')
    const parsed = readOrderFields(body, current)
    if (parsed.error) return parsed
    const reason = readReason(body)
    if (reason.error) return reason
    const changes = diffOrder(current, parsed.order)
    if (Object.keys(changes).length === 0) return fail('No hay cambios para guardar.')
    const allowed = assertPatch(user, current, changes)
    if (allowed.error) return allowed
    const driver = await checkDriver(parsed.order.driverId, current.driverId)
    if (driver.error) return driver
    const slot = await checkSlot(orders, current, parsed.order, user, body.override === true)
    if (slot.error) return slot
    if (needsReason(user, changes) && !reason.value) return fail('Ingresá el motivo de la edición.')

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
      updatedAt: new Date().toISOString(),
    }
    if (slot.authorized) rememberOverride(order, user)
    if (reason.value && (user.role === 'vendedor' || commercialKeys(changes).length > 0)) {
      order.edits = [...order.edits, makeEdit(user, reason.value, changes, 'aplicada')]
    }
    orders[index] = order
    await writeOrders(orders)
    if (user.role === 'vendedor') {
      await notifyEncargados({
        text: `${user.name} editó el pedido ${order.id}: ${reason.value}`,
        orderId: order.id,
        whatsapp: false,
      })
    } else if (user.role === 'encargado_deposito' && commercialKeys(changes).length > 0) {
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
    const parsed = readOrderFields(bodyFrom(current, pending.changes), current)
    if (parsed.error) return parsed
    const slot = await checkSlot(orders, current, parsed.order, user, body?.override === true)
    if (slot.error) return slot
    edits[editIndex] = { ...pending, status: 'aplicada' }
    const order = {
      ...parsed.order,
      edits,
      updatedAt: new Date().toISOString(),
    }
    if (slot.authorized) rememberOverride(order, user)
    orders[index] = order
    await writeOrders(orders)
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
    await writeOrders(remaining)
    if (current.status === 'en-viaje') await releaseIdleDrivers(remaining, current.transporter)
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
  if (user.role === 'encargado_deposito') return commercialKeys(changes).length > 0
  return false
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

function bodyFrom(order, changes) {
  return { ...order, ...changes }
}

async function checkDriver(driverId, previous) {
  if (!driverId || driverId === previous) return { ok: true }
  const users = await readUsersList()
  const driver = users.find((item) => item.id === driverId)
  if (!driver || driver.role !== 'chofer') return fail('Elegí un chofer.')
  return { ok: true }
}

const SLOT_LIMIT = 3

function occupiesSlot(order) {
  return Boolean(order && order.driverId && order.deliveryDate && order.timeWindow)
}

function sameSlot(left, right) {
  return (
    left.driverId === right.driverId &&
    left.deliveryDate === right.deliveryDate &&
    left.timeWindow === right.timeWindow
  )
}

/** Pedidos del chofer en esa fecha y esa franja. No cuenta cancelados ni el pedido editado. */
export function countDriverSlot(orders, driverId, deliveryDate, timeWindow, exceptId) {
  if (!driverId || !deliveryDate || !timeWindow) return 0
  return orders.filter((order) => {
    if (order.id === exceptId) return false
    if (order.status === 'cancelado') return false
    if (order.driverId !== driverId) return false
    if (order.deliveryDate !== deliveryDate) return false
    return order.timeWindow === timeWindow
  }).length
}

function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}`
}

async function checkSlot(orders, current, next, user, override) {
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
    error: `Hace falta la autorización del encargado. ${name} ya tiene ${count} pedidos en la franja ${next.timeWindow} del ${shortDate(next.deliveryDate)}.`,
    status: 409,
    code: 'FRANJA_LLENA',
    driver: name,
    driverId: next.driverId,
    deliveryDate: next.deliveryDate,
    timeWindow: next.timeWindow,
    count,
  }
}

function rememberOverride(order, user) {
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
  ]
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key))
}

function nextId(orders) {
  const used = new Set(orders.map((item) => item.id))
  let id = ''
  do {
    id = `P-${Math.floor(1000000 + Math.random() * 9000000)}`
  } while (used.has(id))
  return id
}

function readOrderFields(body, current) {
  const order = current
    ? {
        id: current.id,
        createdBy: current.createdBy,
        createdAt: current.createdAt,
      }
    : {}

  for (const [key, message] of REQUIRED_TEXT) {
    if (current && !Object.prototype.hasOwnProperty.call(body, key)) {
      order[key] = current[key]
      continue
    }
    const text = readRequiredText(body[key])
    if (!text) return fail(message)
    order[key] = text
  }

  if (current && !Object.prototype.hasOwnProperty.call(body, 'deliveryDate')) {
    order.deliveryDate = current.deliveryDate
  } else {
    const date = readRequiredText(body.deliveryDate)
    if (!date) return fail('Elegí la fecha de entrega.')
    if (!isIsoDate(date)) return fail('La fecha de entrega no es válida.')
    order.deliveryDate = date
  }

  const status = readStatus(body, current)
  if (status.error) return status
  order.status = status.value

  for (const [key, label] of OPTIONAL_TEXT) {
    const read = readOptionalText(body, current, key, label)
    if (read.error) return read
    if (read.value !== undefined) order[key] = read.value
  }

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

  const packages = readPackages(body, current)
  if (packages.error) return packages
  if (packages.value !== undefined) order.packages = packages.value

  const driver = readDriver(body, current)
  if (driver.error) return driver
  if (driver.value !== undefined) order.driverId = driver.value

  if (order.status === 'preparado' && order.packages == null) {
    return fail('Indicá la cantidad de bultos.')
  }
  if (!order.betweenStreet1 && !order.betweenStreet2) {
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
  if (!Object.prototype.hasOwnProperty.call(body, 'status')) {
    return { value: current ? current.status : 'pendiente' }
  }
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
    return fail('El estado no es válido.')
  }
  return { value: body.status }
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
    if (!stillTraveling(orders, user.carrierName)) {
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
        user?.role === 'chofer' &&
        Boolean(carrier) &&
        stillTraveling(orders, carrier) &&
        isStoredPoint(point)
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
        traveling: travelingCount(orders, carrier),
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

function travelingCount(orders, carrierName) {
  const carrier = normalizeName(carrierName)
  if (!carrier) return 0
  return orders.filter(
    (order) =>
      order.status === 'en-viaje' &&
      normalizeName(order.transporter) === carrier &&
      nearbyDelivery(order.deliveryDate),
  ).length
}

function stillTraveling(orders, carrierName) {
  return travelingCount(orders, carrierName) > 0
}

async function releaseIfIdle(orders, previous, next) {
  const carriers = new Set()
  if (previous.status === 'en-viaje' && previous.transporter) carriers.add(previous.transporter)
  if (next.status === 'en-viaje' && next.transporter) carriers.add(next.transporter)
  for (const carrier of carriers) await releaseIdleDrivers(orders, carrier)
}

async function releaseIdleDrivers(orders, carrierName) {
  if (!carrierName || stillTraveling(orders, carrierName)) return
  const carrier = normalizeName(carrierName)
  const users = await readUsersList()
  const ids = users
    .filter((user) => user.role === 'chofer' && normalizeName(user.carrierName) === carrier)
    .map((user) => user.id)
  await forgetUsers(ids)
}

function hasCoords(order) {
  return Number.isFinite(order?.lat) && Number.isFinite(order?.lng)
}

const GEO_RETRY_MS = 60 * 60 * 1000

function needsGeo(order) {
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
