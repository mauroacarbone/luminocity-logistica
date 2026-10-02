import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { assertPatch, canCreate, canSeeOrder, commercialKeys, diffOrder, normalizeName } from './access.js'
import { takeAuthorization } from './authorizations.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyEncargados, notifySeller } from './notifications.js'
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
    const orders = await readOrders()
    res.json(byNewest(orders.filter((order) => canSeeOrder(req.user, order))))
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
    res.json(order)
  })
})
ordersRouter.post('/', async (req, res) => {
  await send(res, async () => {
    const result = await createOrder(req.body, req.user)
    if (result.error) {
      res.status(result.status).json({ message: result.error })
      return
    }
    res.status(201).json(result.order)
  })
})
ordersRouter.patch('/:id/edits/:editId', async (req, res) => {
  await send(res, async () => {
    const result = await reviewEdit(req.params.id, req.params.editId, req.body, req.user)
    if (result.error) {
      res.status(result.status).json({ message: result.error })
      return
    }
    res.json(result.order)
  })
})
ordersRouter.patch('/:id', async (req, res) => {
  await send(res, async () => {
    const result = await patchOrder(req.params.id, req.body, req.user)
    if (result.error) {
      res.status(result.status).json({ message: result.error })
      return
    }
    res.json(result.order)
  })
})
ordersRouter.delete('/:id', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  await send(res, async () => {
    const result = await deleteOrder(req.params.id, req.user)
    if (result.error) {
      res.status(result.status).json({ message: result.error })
      return
    }
    res.status(204).end()
  })
})

function notFound(res) {
  res.status(404).json({ message: 'No existe ese pedido.' })
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
    if (otherSeller) {
      const used = await takeAuthorization(user.id, parsed.order.seller, order.id)
      if (!used) {
        return fail('Necesitás una autorización aprobada para cargar a nombre de ese vendedor.', 403)
      }
    }
    orders.push(order)
    await writeOrders(orders)
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
      })
      return { order }
    }

    const order = {
      ...parsed.order,
      edits: editsOf(current),
      updatedAt: new Date().toISOString(),
    }
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
    if (edits[editIndex].status !== 'pendiente') {
      return fail('Esa edición ya no está esperando confirmación.')
    }
    if (decision === 'rechazada') {
      edits[editIndex] = { ...edits[editIndex], status: 'rechazada' }
      const order = { ...current, edits }
      orders[index] = order
      await writeOrders(orders)
      return { order }
    }
    const parsed = readOrderFields(bodyFrom(current, edits[editIndex].changes), current)
    if (parsed.error) return parsed
    edits[editIndex] = { ...edits[editIndex], status: 'aplicada' }
    const order = {
      ...parsed.order,
      edits,
      updatedAt: new Date().toISOString(),
    }
    orders[index] = order
    await writeOrders(orders)
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
    await writeOrders(orders.filter((item) => item.id !== id))
    return { ok: true }
  })
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
