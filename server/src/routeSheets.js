import { Router } from 'express'
import { businessToday } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { checkDriver, checkSlot, normalizeTimeWindow, rememberOverride } from './orders.js'

const OPEN_ORDER = new Set(['preparado', 'asignado'])

export const routeSheetsRouter = Router()
routeSheetsRouter.use(requireAuth)

routeSheetsRouter.get('/', async (req, res) => {
  await send(res, async () => {
    if (!canRead(req.user)) {
      res.status(403).json({ message: 'No tenés permiso para ver las hojas de ruta.' })
      return
    }
    const date = readDate(req.query?.date)
    if (date.error) {
      res.status(400).json({ message: date.error })
      return
    }
    const sheets = await locked(() => readCollection('routeSheets'))
    const visible = sheets.filter((sheet) => {
      if (sheet.date !== date.value) return false
      if (req.user.role === 'chofer') return sheet.driverId === req.user.id
      return true
    })
    res.json(visible)
  })
})

routeSheetsRouter.post('/', requireRole('encargado_deposito', 'admin'), async (req, res) => {
  await send(res, async () => {
    const result = await saveSheet(req.body ?? {}, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(result.created ? 201 : 200).json(result.sheet)
  })
})

routeSheetsRouter.delete('/:id', requireRole('encargado_deposito', 'admin'), async (req, res) => {
  await send(res, async () => {
    const result = await deleteSheet(req.params.id)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(204).end()
  })
})

routeSheetsRouter.post('/:id/start', requireRole('chofer'), async (req, res) => {
  await send(res, async () => {
    const result = await startSheet(req.params.id, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.sheet)
  })
})

function canRead(user) {
  return user.role === 'admin' || user.role === 'encargado_deposito' || user.role === 'chofer'
}

function saveSheet(body, user) {
  return locked(async () => {
    const parsed = readSheetBody(body)
    if (parsed.error) return parsed
    const driverCheck = await checkDriver(parsed.driverId)
    if (driverCheck.error) return driverCheck
    const orders = await readCollection('orders')
    const sheets = await readCollection('routeSheets')
    const byId = new Map(orders.map((order) => [order.id, order]))
    for (const id of parsed.orderIds) {
      const order = byId.get(id)
      if (!order) return fail(`No existe el pedido ${id}.`, 404)
      if (order.deliveryDate !== parsed.date || normalizeTimeWindow(order.timeWindow) !== parsed.slot) {
        return fail(`El pedido ${id} no es de esa fecha y franja.`)
      }
      if (!OPEN_ORDER.has(order.status)) {
        return fail(`El pedido ${id} no está preparado ni asignado.`)
      }
      if (order.driverId && order.driverId !== parsed.driverId) {
        return fail(`El pedido ${id} ya está asignado a otro chofer`, 409)
      }
    }
    const existing = sheets.find(
      (sheet) =>
        sheet.driverId === parsed.driverId && sheet.date === parsed.date && sheet.slot === parsed.slot,
    )
    if (existing && existing.status !== 'planificada') {
      return fail('Esa hoja ya está en curso', 409)
    }
    for (const id of parsed.orderIds) {
      const order = byId.get(id)
      const next = {
        ...order,
        driverId: parsed.driverId,
        deliveryDate: parsed.date,
        timeWindow: parsed.slot,
      }
      const slot = await checkSlot(orders, order, next, user, body.override === true)
      if (slot.error) return slot
      if (slot.authorized) rememberOverride(next, user)
      if (order.status === 'preparado') {
        order.status = 'asignado'
        order.assignedAt = new Date().toISOString()
        delete order.departedAt
        delete order.deliveredAt
      }
      order.driverId = parsed.driverId
      if (next.slotOverrides) order.slotOverrides = next.slotOverrides
    }
    const now = new Date().toISOString()
    const sheet = existing
      ? {
          ...existing,
          origin: parsed.origin,
          orderIds: parsed.orderIds,
          km: parsed.km,
          minutes: parsed.minutes,
          updatedBy: user.id,
          updatedAt: now,
        }
      : {
          id: nextSheetId(sheets),
          driverId: parsed.driverId,
          date: parsed.date,
          slot: parsed.slot,
          origin: parsed.origin,
          orderIds: parsed.orderIds,
          km: parsed.km,
          minutes: parsed.minutes,
          status: 'planificada',
          createdBy: user.id,
          createdAt: now,
        }
    const keep = new Set(parsed.orderIds)
    for (const order of orders) {
      if (order.routeId !== sheet.id) continue
      if (keep.has(order.id)) continue
      delete order.routeId
      delete order.routeSeq
    }
    parsed.orderIds.forEach((id, index) => {
      const order = byId.get(id)
      order.routeId = sheet.id
      order.routeSeq = index + 1
    })
    const nextSheets = existing
      ? sheets.map((item) => (item.id === sheet.id ? sheet : item))
      : [...sheets, sheet]
    await writeCollection('orders', orders)
    await writeCollection('routeSheets', nextSheets)
    return { sheet, created: !existing }
  })
}

function deleteSheet(id) {
  return locked(async () => {
    const sheets = await readCollection('routeSheets')
    const sheet = sheets.find((item) => item.id === id)
    if (!sheet) return fail('No existe esa hoja de ruta.', 404)
    if (sheet.status !== 'planificada') return fail('Solo se puede borrar una hoja planificada', 409)
    const orders = await readCollection('orders')
    for (const order of orders) {
      if (order.routeId !== sheet.id) continue
      delete order.routeId
      delete order.routeSeq
    }
    await writeCollection('orders', orders)
    await writeCollection(
      'routeSheets',
      sheets.filter((item) => item.id !== id),
    )
    return { ok: true }
  })
}

function startSheet(id, user) {
  return locked(async () => {
    const sheets = await readCollection('routeSheets')
    const index = sheets.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa hoja de ruta.', 404)
    const sheet = sheets[index]
    if (sheet.driverId !== user.id) return fail('No tenés permiso para iniciar esta hoja.', 403)
    if (sheet.status === 'en_curso') return fail('Esa hoja ya está en curso', 409)
    if (sheet.status !== 'planificada') return fail('Esa hoja ya está cerrada', 409)
    if (sheet.date !== businessToday()) return fail('Solo podés iniciar la hoja del día', 409)
    const orders = await readCollection('orders')
    const now = new Date().toISOString()
    let started = 0
    for (const order of orders) {
      if (order.routeId !== sheet.id) continue
      if (order.driverId !== sheet.driverId) continue
      if (order.deliveryDate !== sheet.date) continue
      if (normalizeTimeWindow(order.timeWindow) !== sheet.slot) continue
      if (order.status !== 'asignado') continue
      order.status = 'en-viaje'
      order.departedAt = now
      delete order.deliveredAt
      started += 1
    }
    if (started === 0) return fail('No hay pedidos para salir.')
    const next = { ...sheet, status: 'en_curso', startedAt: now }
    sheets[index] = next
    await writeCollection('orders', orders)
    await writeCollection('routeSheets', sheets)
    return { sheet: next }
  })
}

export async function closeFinishedSheets(orders) {
  const sheets = await readCollection('routeSheets')
  const byId = new Map(orders.map((order) => [order.id, order]))
  const now = new Date().toISOString()
  let changed = false
  for (const sheet of sheets) {
    if (sheet.status === 'cerrada' || !Array.isArray(sheet.orderIds) || sheet.orderIds.length === 0) continue
    const done = sheet.orderIds.every((id) => {
      const order = byId.get(id)
      return !order || order.status === 'entregado'
    })
    if (!done) continue
    sheet.status = 'cerrada'
    sheet.closedAt = now
    changed = true
  }
  if (changed) await writeCollection('routeSheets', sheets)
}

const BELOW_ASSIGNED = new Set(['pendiente', 'preparado'])

function driverKey(order) {
  return typeof order?.driverId === 'string' ? order.driverId : ''
}

function leavesSheet(current, next) {
  if (!current || typeof current.routeId !== 'string' || !current.routeId) return false
  if (driverKey(current) !== driverKey(next)) return true
  if ((current.deliveryDate ?? '') !== (next.deliveryDate ?? '')) return true
  if (normalizeTimeWindow(current.timeWindow) !== normalizeTimeWindow(next.timeWindow)) return true
  return current.status === 'asignado' && BELOW_ASSIGNED.has(next.status)
}

function renumberSheet(orders, sheet) {
  sheet.orderIds.forEach((id, index) => {
    const order = orders.find((item) => item.id === id)
    if (order && order.routeId === sheet.id) order.routeSeq = index + 1
  })
}

export async function syncSheetOnEdit(orders, current, next) {
  if (!leavesSheet(current, next)) return { ok: true }
  const sheets = await readCollection('routeSheets')
  const sheet = sheets.find((item) => item.id === current.routeId)
  if (!sheet || sheet.status === 'cerrada') {
    delete next.routeId
    delete next.routeSeq
    return { ok: true }
  }
  if (sheet.status === 'en_curso') {
    if (next.status === 'entregado') return { ok: true }
    return fail('Ese pedido está en una hoja de ruta en curso', 409)
  }
  delete next.routeId
  delete next.routeSeq
  const orderIds = (Array.isArray(sheet.orderIds) ? sheet.orderIds : []).filter((id) => id !== current.id)
  if (orderIds.length === 0) {
    await writeCollection(
      'routeSheets',
      sheets.filter((item) => item.id !== sheet.id),
    )
    return { ok: true }
  }
  const updated = { ...sheet, orderIds }
  renumberSheet(orders, updated)
  await writeCollection(
    'routeSheets',
    sheets.map((item) => (item.id === sheet.id ? updated : item)),
  )
  return { ok: true }
}

export async function pullOrderFromSheets(orders, orderId) {
  const sheets = await readCollection('routeSheets')
  let changed = false
  const nextSheets = []
  for (const sheet of sheets) {
    const ids = Array.isArray(sheet.orderIds) ? sheet.orderIds : []
    if (!ids.includes(orderId)) {
      nextSheets.push(sheet)
      continue
    }
    changed = true
    const orderIds = ids.filter((id) => id !== orderId)
    if (sheet.status === 'planificada' && orderIds.length === 0) continue
    const updated = { ...sheet, orderIds }
    renumberSheet(orders, updated)
    nextSheets.push(updated)
  }
  if (changed) await writeCollection('routeSheets', nextSheets)
}

export async function blockPlannedDeparture(user, current, next) {
  if (user.role !== 'chofer') return null
  if (current.status !== 'asignado' || next.status !== 'en-viaje') return null
  if (typeof current.routeId !== 'string' || !current.routeId) return null
  const sheets = await readCollection('routeSheets')
  const sheet = sheets.find((item) => item.id === current.routeId)
  if (!sheet || sheet.status !== 'planificada') return null
  return fail('Ese pedido está en una hoja planificada. Usá Iniciar recorrido.', 409)
}

function readSheetBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('La hoja no es válida.')
  const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : ''
  if (!driverId) return fail('Elegí un chofer.')
  const date = readDate(body.date)
  if (date.error) return date
  const slot = normalizeTimeWindow(typeof body.slot === 'string' ? body.slot : '')
  if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(slot)) return fail('Elegí una franja.')
  const origin = typeof body.origin === 'string' ? body.origin.trim() : ''
  if (!origin) return fail('Completá el origen de la ruta.')
  if (origin.length > 200) return fail('El origen es demasiado largo.')
  if (!Array.isArray(body.orderIds) || body.orderIds.length === 0) {
    return fail('Elegí al menos un pedido.')
  }
  if (body.orderIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return fail('Los pedidos de la hoja no son válidos.')
  }
  const orderIds = body.orderIds.map((id) => id.trim())
  if (new Set(orderIds).size !== orderIds.length) return fail('Hay un pedido repetido en la hoja.')
  const km = readNumber(body.km, 'Los kilómetros')
  if (km.error) return km
  const minutes = readNumber(body.minutes, 'Los minutos')
  if (minutes.error) return minutes
  return {
    driverId,
    date: date.value,
    slot,
    origin,
    orderIds,
    km: km.value,
    minutes: Math.round(minutes.value),
  }
}

function readDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail('La fecha no es válida.')
  }
  return { value }
}

function readNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail(`${label} no son válidos.`)
  }
  return { value }
}

function nextSheetId(sheets) {
  const used = new Set(sheets.map((sheet) => sheet.id))
  let id = ''
  do {
    id = `H-${Math.floor(1000000 + Math.random() * 9000000)}`
  } while (used.has(id))
  return id
}

function fail(error, status = 400, code) {
  return code ? { error, status, code } : { error, status }
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
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
