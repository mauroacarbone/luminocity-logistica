import { Router } from 'express'
import { businessToday } from './access.js'
import { quoteTrip, quoteTripDetail } from './tripRates.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { applyTransition, STATUS_RANK } from './orderFlow.js'
import {
  checkDriver,
  checkSlot,
  isOwnDelivery,
  isPickup,
  normalizeTimeWindow,
  releaseIdleDrivers,
  rememberOverride,
} from './orders.js'

const OPEN_ORDER = new Set(['preparado', 'asignado'])

export const routeSheetsRouter = Router()
routeSheetsRouter.use(requireAuth)

routeSheetsRouter.get('/trips', async (req, res) => {
  await send(res, async () => {
    const result = await listTrips(req.user, req.query ?? {})
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.trips)
  })
})

routeSheetsRouter.get('/', async (req, res) => {
  await send(res, async () => {
    if (!canRead(req.user)) {
      res.status(403).json({ message: 'No tenés permiso para ver las hojas de ruta.' })
      return
    }
    const rawDate = req.query?.date
    const status = typeof req.query?.status === 'string' ? req.query.status : ''
    const openOnly = status === 'en_curso' && (rawDate === undefined || rawDate === '')
    if (openOnly && req.user.role !== 'admin' && req.user.role !== 'encargado_deposito') {
      res.status(403).json({ message: 'No tenés permiso para ver las hojas de ruta.' })
      return
    }
    const date = openOnly ? null : readDate(rawDate)
    if (date?.error) {
      res.status(400).json({ message: date.error })
      return
    }
    const sheets = await locked(() => readCollection('routeSheets'))
    const visible = sheets.filter((sheet) => {
      if (openOnly) return sheet.status === 'en_curso'
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

routeSheetsRouter.post('/:id/finish', async (req, res) => {
  await send(res, async () => {
    const result = await finishSheet(req.params.id, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.sheet)
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
      if (!isOwnDelivery(order)) {
        return fail(
          isPickup(order) ? 'Un retiro no va en hoja de ruta' : 'Los envíos por correo no van en hoja de ruta',
          409,
        )
      }
      const sameSlot = normalizeTimeWindow(order.timeWindow) === parsed.slot
      const lateToday =
        parsed.date === businessToday() &&
        typeof order.deliveryDate === 'string' &&
        order.deliveryDate < parsed.date &&
        sameSlot &&
        OPEN_ORDER.has(order.status)
      if (!sameSlot || (order.deliveryDate !== parsed.date && !lateToday)) {
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
    const rescheduled = []
    for (const id of parsed.orderIds) {
      const order = byId.get(id)
      const previousDate = typeof order.deliveryDate === 'string' ? order.deliveryDate : ''
      const next = {
        ...order,
        driverId: parsed.driverId,
        deliveryDate: parsed.date,
        timeWindow: parsed.slot,
      }
      const slot = await checkSlot(orders, order, next, user, body.override === true)
      if (slot.error) return slot
      if (order.status === 'preparado') {
        const transition = await applyTransition(
          orders,
          order,
          {
            to: 'asignado',
            driverId: parsed.driverId,
            timeWindow: parsed.slot,
            override: body.override === true,
          },
          user,
          'hoja',
          { fromSheet: true },
        )
        if (transition.error) return transition
        if (previousDate && previousDate !== parsed.date) {
          transition.order.deliveryDate = parsed.date
          rescheduled.push(transition.order)
        }
        byId.set(id, transition.order)
        continue
      }
      if (slot.authorized) rememberOverride(order, user)
      order.driverId = parsed.driverId
      if (previousDate && previousDate !== parsed.date) {
        order.deliveryDate = parsed.date
        rescheduled.push(order)
      }
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
    for (const order of rescheduled) {
      const history = Array.isArray(order.history) ? order.history : []
      history.push({
        at: now,
        by: {
          id: typeof user?.id === 'string' ? user.id : '',
          name: typeof user?.name === 'string' ? user.name : '',
        },
        from: order.status,
        to: order.status,
        reason: `Reprogramado al ${parsed.date} desde la hoja ${sheet.id}`,
        via: 'hoja',
      })
      order.history = history
    }
    const nextSheets = existing
      ? sheets.map((item) => (item.id === sheet.id ? sheet : item))
      : [...sheets, sheet]
    if (assignedMissing(orders, sheet)) sheet.stale = true
    else delete sheet.stale
    await writeCollection('orders', orders)
    await writeCollection('routeSheets', nextSheets)
    await syncSheetFreshness(orders)
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
    if (sheet.date > businessToday()) return fail('Solo podés iniciar la hoja del día', 409)
    const orders = await readCollection('orders')
    if (sheet.stale === true || assignedMissing(orders, sheet)) {
      return fail('Esperando hoja de ruta del encargado', 409)
    }
    const now = new Date().toISOString()
    let started = 0
    for (const order of orders) {
      if (order.routeId !== sheet.id) continue
      if (order.driverId !== sheet.driverId) continue
      if (order.deliveryDate !== sheet.date) continue
      if (normalizeTimeWindow(order.timeWindow) !== sheet.slot) continue
      if (order.status !== 'asignado') continue
      const transition = await applyTransition(orders, order, { to: 'en-viaje' }, user, 'hoja', {
        fromSheet: true,
      })
      if (transition.error) return transition
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

function finishSheet(id, user) {
  return locked(async () => {
    if (user.role !== 'chofer' && user.role !== 'encargado_deposito' && user.role !== 'admin') {
      return fail('No tenés permiso para finalizar el viaje.', 403)
    }
    const sheets = await readCollection('routeSheets')
    const index = sheets.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa hoja de ruta.', 404)
    const sheet = sheets[index]
    if (user.role === 'chofer' && sheet.driverId !== user.id) {
      return fail('No tenés permiso para finalizar esta hoja.', 403)
    }
    if (sheet.status === 'cerrada') return fail('Esa hoja ya está cerrada', 409)
    if (sheet.status !== 'en_curso') return fail('Solo podés finalizar una hoja en curso', 409)
    const orders = await readCollection('orders')
    const byId = new Map(orders.map((order) => [order.id, order]))
    const closedAt = new Date().toISOString()
    const next = {
      ...sheet,
      status: 'cerrada',
      closedAt,
      trip: await sealTrip(sheet, byId),
    }
    const ids = Array.isArray(sheet.orderIds) ? sheet.orderIds : []
    let returned = false
    for (const id of ids) {
      const order = byId.get(id)
      if (!order) continue
      if (!assignBack(order, user, 'Viaje finalizado sin entregar', closedAt)) continue
      returned = true
      delete order.routeId
      delete order.routeSeq
      const history = Array.isArray(order.history) ? order.history : []
      history.push({
        at: closedAt,
        by: {
          id: typeof user?.id === 'string' ? user.id : '',
          name: typeof user?.name === 'string' ? user.name : '',
        },
        from: 'asignado',
        to: 'asignado',
        reason: `Volvió de la hoja ${sheet.id} sin entregar`,
        via: 'hoja',
      })
      order.history = history
    }
    sheets[index] = next
    await writeCollection('routeSheets', sheets)
    if (returned) await writeCollection('orders', orders)
    await releaseIdleDrivers(orders, sheet.driverId)
    return { sheet: next }
  })
}

/** Pedidos asignados que siguen apuntando a una hoja cerrada o que ya no existe. */
export async function releaseClosedSheetOrders() {
  return locked(async () => {
    const orders = await readCollection('orders')
    const sheets = await readCollection('routeSheets')
    const bySheet = new Map(sheets.map((sheet) => [sheet.id, sheet]))
    let changed = false
    for (const order of orders) {
      if (!order || order.status !== 'asignado') continue
      if (typeof order.routeId !== 'string' || !order.routeId) continue
      const sheet = bySheet.get(order.routeId)
      if (sheet && sheet.status !== 'cerrada') continue
      delete order.routeId
      delete order.routeSeq
      changed = true
    }
    if (changed) await writeCollection('orders', orders)
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
    sheet.trip = await sealTrip(sheet, byId)
    sheet.status = 'cerrada'
    sheet.closedAt = now
    changed = true
  }
  if (changed) await writeCollection('routeSheets', sheets)
}

function driverKey(order) {
  return typeof order?.driverId === 'string' ? order.driverId : ''
}

function leavesSheet(current, next) {
  if (!current || typeof current.routeId !== 'string' || !current.routeId) return false
  if (driverKey(current) !== driverKey(next)) return true
  if ((current.deliveryDate ?? '') !== (next.deliveryDate ?? '')) return true
  if (normalizeTimeWindow(current.timeWindow) !== normalizeTimeWindow(next.timeWindow)) return true
  return (STATUS_RANK[next.status] ?? 0) < STATUS_RANK.asignado
}

function renumberSheet(orders, sheet) {
  sheet.orderIds.forEach((id, index) => {
    const order = orders.find((item) => item.id === id)
    if (order && order.routeId === sheet.id) order.routeSeq = index + 1
  })
}

function assignBack(order, user, reason, at) {
  if (order.status !== 'en-viaje') return false
  const when = at || (typeof order.updatedAt === 'string' ? order.updatedAt : new Date().toISOString())
  order.status = 'asignado'
  order.updatedAt = when
  const history = Array.isArray(order.history)
    ? order.history.map((entry) => ({ ...entry, by: entry.by ? { ...entry.by } : entry.by }))
    : []
  history.push({
    at: when,
    by: {
      id: typeof user?.id === 'string' ? user.id : '',
      name: typeof user?.name === 'string' ? user.name : '',
    },
    from: 'en-viaje',
    to: 'asignado',
    reason,
    via: 'hoja',
  })
  order.history = history
  return true
}

function reprogramFromSheet(next, user, sheetId) {
  return assignBack(next, user, `Reprogramado desde la hoja ${sheetId}`)
}

export async function syncSheetOnEdit(orders, current, next, user) {
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
    delete next.routeId
    delete next.routeSeq
    const orderIds = (Array.isArray(sheet.orderIds) ? sheet.orderIds : []).filter((id) => id !== current.id)
    const updated = { ...sheet, orderIds, dropped: rememberDropped(sheet.dropped, current.id, current) }
    if (orderIds.length === 0) {
      updated.status = 'cerrada'
      updated.closedAt = new Date().toISOString()
      updated.trip = await sealTrip(updated, new Map(orders.map((item) => [item.id, item])))
    } else {
      renumberSheet(orders, updated)
    }
    await writeCollection(
      'routeSheets',
      sheets.map((item) => (item.id === sheet.id ? updated : item)),
    )
    if (reprogramFromSheet(next, user, sheet.id)) {
      const view = orders.map((item) => (item.id === next.id ? next : item))
      const driverId = typeof current.driverId === 'string' ? current.driverId : ''
      await releaseIdleDrivers(view, driverId)
    }
    return { ok: true }
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

export async function pullOrderFromSheets(orders, removed) {
  const orderId = typeof removed === 'string' ? removed : removed?.id
  const order = typeof removed === 'string' ? null : removed
  if (!orderId) return
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
    if (sheet.status === 'en_curso') updated.dropped = rememberDropped(sheet.dropped, orderId, order)
    if (sheet.status === 'en_curso' && orderIds.length === 0) {
      updated.status = 'cerrada'
      updated.closedAt = new Date().toISOString()
      if (!updated.trip) {
        updated.trip = await sealTrip(updated, new Map(orders.map((item) => [item.id, item])))
      }
    } else {
      renumberSheet(orders, updated)
    }
    nextSheets.push(updated)
  }
  if (changed) await writeCollection('routeSheets', nextSheets)
}

function assignedMissing(orders, sheet) {
  const ids = new Set(Array.isArray(sheet.orderIds) ? sheet.orderIds : [])
  const slot = normalizeTimeWindow(sheet.slot)
  return orders.some((order) => {
    if (!order || order.status !== 'asignado') return false
    if (order.driverId !== sheet.driverId) return false
    if (order.deliveryDate !== sheet.date) return false
    if (normalizeTimeWindow(order.timeWindow) !== slot) return false
    if (!isOwnDelivery(order)) return false
    return !ids.has(order.id)
  })
}

/** Marca desactualizada una hoja planificada a la que le falta un pedido asignado. */
export async function syncSheetFreshness(orders) {
  const sheets = await readCollection('routeSheets')
  let changed = false
  for (const sheet of sheets) {
    if (!sheet || sheet.status !== 'planificada') continue
    const stale = assignedMissing(orders, sheet)
    if (stale && sheet.stale !== true) {
      sheet.stale = true
      changed = true
    } else if (!stale && sheet.stale === true) {
      delete sheet.stale
      changed = true
    }
  }
  if (changed) await writeCollection('routeSheets', sheets)
}

/** El chofer solo sale si la hoja de esa fecha y franja incluye todos sus asignados. */
export async function requireFreshSheet(orders, order) {
  const driverId = typeof order?.driverId === 'string' ? order.driverId : ''
  const date = typeof order?.deliveryDate === 'string' ? order.deliveryDate : ''
  const slot = normalizeTimeWindow(order?.timeWindow)
  const sheets = await readCollection('routeSheets')
  const sheet = sheets.find(
    (item) =>
      item &&
      item.driverId === driverId &&
      item.date === date &&
      normalizeTimeWindow(item.slot) === slot &&
      item.status !== 'cerrada',
  )
  const ids = sheet && Array.isArray(sheet.orderIds) ? sheet.orderIds : []
  if (!sheet || sheet.stale === true || !ids.includes(order.id) || assignedMissing(orders, sheet)) {
    return fail('Esperando hoja de ruta del encargado', 409)
  }
  return null
}

export async function blockPlannedDeparture(user, current, next) {
  if (user.role !== 'chofer') return null
  if (current.status !== 'asignado' || next.status !== 'en-viaje') return null
  if (typeof current.routeId !== 'string' || !current.routeId) return null
  const sheets = await readCollection('routeSheets')
  const sheet = sheets.find((item) => item.id === current.routeId)
  if (!sheet || sheet.status !== 'planificada') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sheet.date ?? ''))
  const when = match ? `${match[3]}/${match[2]}` : String(sheet.date ?? '')
  return fail(
    `Ese pedido está en una hoja planificada para el ${when}. Usá Iniciar recorrido ese día.`,
    409,
  )
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
  const km = readMeasure(body.km, 'Los kilómetros', (value) => Math.round(value * 10) / 10)
  if (km.error) return km
  const minutes = readMeasure(body.minutes, 'Los minutos', (value) => Math.round(value))
  if (minutes.error) return minutes
  return {
    driverId,
    date: date.value,
    slot,
    origin,
    orderIds,
    km: km.value,
    minutes: minutes.value,
  }
}

function readDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail('La fecha no es válida.')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail('La fecha no es válida.')
  }
  return { value }
}

function readMeasure(value, label, round) {
  if (value === undefined || value === null) return { value: 0 }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail(`${label} no son válidos.`)
  }
  return { value: round(value) }
}

function nextSheetId(sheets) {
  const used = new Set(sheets.map((sheet) => sheet.id))
  let id = ''
  do {
    id = `H-${Math.floor(1000000 + Math.random() * 9000000)}`
  } while (used.has(id))
  return id
}

const STREET_FACTOR = 1.3
const DEPOT = { lat: -34.5986, lng: -58.4493 }

function listTrips(user, query) {
  return locked(async () => {
    if (user.role !== 'chofer' && user.role !== 'encargado_deposito' && user.role !== 'admin') {
      return fail('No tenés permiso para ver los viajes.', 403)
    }
    const from = readDate(query.from)
    if (from.error) return from
    const to = readDate(query.to)
    if (to.error) return to
    if (from.value > to.value) return fail('La fecha desde no puede ser posterior a la fecha hasta.')
    let driverId = typeof query.driverId === 'string' ? query.driverId.trim() : ''
    if (user.role === 'chofer') {
      if (driverId && driverId !== user.id) return fail('Solo podés ver tus viajes.', 403)
      driverId = user.id
    } else if (!driverId) {
      return fail('Elegí un chofer.')
    }
    const users = await readCollection('users')
    const driver = users.find((item) => item && item.id === driverId && item.role === 'chofer')
    if (!driver) return fail('No existe ese chofer.', 404)
    const sheets = await readCollection('routeSheets')
    const orders = await readCollection('orders')
    const rates = await readCollection('tripRates')
    const byId = new Map(orders.map((order) => [order.id, order]))
    const name = typeof driver.name === 'string' && driver.name.trim() ? driver.name.trim() : driverId
    const trips = sheets
      .filter(
        (sheet) =>
          sheet &&
          sheet.driverId === driverId &&
          typeof sheet.date === 'string' &&
          sheet.date >= from.value &&
          sheet.date <= to.value &&
          (sheet.status === 'planificada' || sheet.status === 'en_curso' || sheet.status === 'cerrada'),
      )
      .map((sheet) => toTrip(sheet, byId, name, rates))
      .sort((left, right) => {
        if (left.date !== right.date) return right.date.localeCompare(left.date)
        if (left.slot !== right.slot) return right.slot.localeCompare(left.slot)
        return left.id.localeCompare(right.id, 'es')
      })
    return { trips }
  })
}

function storedAmount(sheet) {
  if (sheet.status !== 'cerrada' || !sheet.trip || typeof sheet.trip !== 'object') return undefined
  if (!Object.prototype.hasOwnProperty.call(sheet.trip, 'amount')) return undefined
  const amount = sheet.trip.amount
  if (amount == null) return null
  if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) return Math.round(amount * 100) / 100
  return undefined
}

async function sealTrip(sheet, byId) {
  const trip = buildTrip(sheet, byId)
  if (trip.delivered < 1) return { ...trip, amount: null, rateId: null }
  const rates = await readCollection('tripRates')
  const quote = quoteTripDetail(rates, { zones: trip.zones, date: sheet.date, km: trip.km })
  return { ...trip, amount: quote.amount, rateId: quote.rateId }
}

function toTrip(sheet, byId, driverName, rates) {
  const trip = readStoredTrip(sheet) ?? buildTrip(sheet, byId)
  const frozen = storedAmount(sheet)
  return {
    id: sheet.id,
    driverId: sheet.driverId,
    driverName,
    date: sheet.date,
    slot: sheet.slot,
    status: sheet.status,
    startedAt: typeof sheet.startedAt === 'string' ? sheet.startedAt : null,
    closedAt: typeof sheet.closedAt === 'string' ? sheet.closedAt : null,
    delivered: trip.delivered,
    undelivered: trip.undelivered,
    zones: trip.zones,
    km: trip.km,
    kmEstimated: trip.kmEstimated,
    stops: trip.stops,
    amount:
      frozen !== undefined
        ? frozen
        : trip.delivered > 0
          ? quoteTrip(rates, { zones: trip.zones, date: sheet.date, km: trip.km })
          : null,
  }
}

function readStoredTrip(sheet) {
  const trip = sheet.trip
  if (!trip || typeof trip !== 'object' || Array.isArray(trip)) return null
  if (typeof trip.km !== 'number' || !Number.isFinite(trip.km) || trip.km < 0) return null
  if (typeof trip.kmEstimated !== 'boolean') return null
  if (!Array.isArray(trip.stops)) return null
  const stops = []
  for (const stop of trip.stops) {
    if (!stop || typeof stop !== 'object') return null
    if (typeof stop.orderId !== 'string' || !stop.orderId) return null
    if (typeof stop.zone !== 'string' || !stop.zone.trim()) return null
    if (typeof stop.delivered !== 'boolean') return null
    stops.push({ orderId: stop.orderId, zone: stop.zone.trim(), delivered: stop.delivered })
  }
  const zones = []
  for (const stop of stops) {
    if (!zones.includes(stop.zone)) zones.push(stop.zone)
  }
  const delivered = stops.filter((stop) => stop.delivered).length
  return {
    delivered,
    undelivered: stops.length - delivered,
    zones,
    stops,
    km: Math.round(trip.km * 10) / 10,
    kmEstimated: trip.kmEstimated,
  }
}

function rememberDropped(current, orderId, order) {
  const dropped = Array.isArray(current) ? current.filter(isDroppedStop) : []
  if (dropped.some((stop) => stop.orderId === orderId)) return dropped
  return [...dropped, { orderId, zone: zoneOf(order), delivered: false }]
}

function isDroppedStop(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.orderId === 'string' &&
      value.orderId &&
      value.delivered === false,
  )
}

function droppedStops(sheet) {
  if (!Array.isArray(sheet.dropped)) return []
  return sheet.dropped.filter(isDroppedStop).map((stop) => ({
    orderId: stop.orderId,
    zone: zoneOf(stop.zone ? { zone: stop.zone } : null),
    delivered: false,
  }))
}

function buildTrip(sheet, byId) {
  const ids = Array.isArray(sheet.orderIds) ? sheet.orderIds : []
  const dropped = droppedStops(sheet)
  const droppedIds = new Set(dropped.map((stop) => stop.orderId))
  const stops = [
    ...ids
      .filter((orderId) => !droppedIds.has(orderId))
      .map((orderId) => {
        const order = byId.get(orderId)
        return {
          orderId,
          zone: zoneOf(order),
          delivered: Boolean(order && order.status === 'entregado'),
        }
      }),
    ...dropped,
  ]
  const zones = []
  for (const stop of stops) {
    if (!zones.includes(stop.zone)) zones.push(stop.zone)
  }
  const delivered = stops.filter((stop) => stop.delivered).length
  const distance = tripDistance(sheet, byId)
  return {
    delivered,
    undelivered: stops.length - delivered,
    zones,
    stops,
    km: distance.km,
    kmEstimated: distance.estimated,
  }
}

function zoneOf(order) {
  if (!order || typeof order.zone !== 'string') return 'Sin zona'
  const zone = order.zone.trim()
  return zone || 'Sin zona'
}

function tripDistance(sheet, byId) {
  if (typeof sheet.km === 'number' && Number.isFinite(sheet.km) && sheet.km > 0) {
    return { km: Math.round(sheet.km * 10) / 10, estimated: false }
  }
  const points = []
  const depot = depotPoint(sheet.origin)
  if (depot) points.push(depot)
  const ids = Array.isArray(sheet.orderIds) ? sheet.orderIds : []
  for (const id of ids) {
    const point = orderPoint(byId.get(id))
    if (point) points.push(point)
  }
  if (points.length < 2) return { km: 0, estimated: true }
  let km = 0
  for (let index = 1; index < points.length; index += 1) {
    km += haversineKm(points[index - 1], points[index])
  }
  return { km: Math.round(km * STREET_FACTOR * 10) / 10, estimated: true }
}

function depotPoint(origin) {
  const text = typeof origin === 'string' ? origin.trim() : ''
  const coords = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(text)
  if (coords) {
    const lat = Number(coords[1])
    const lng = Number(coords[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return DEPOT
}

function orderPoint(order) {
  if (!order) return null
  const lat = Number(order.lat)
  const lng = Number(order.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function haversineKm(from, to) {
  const earth = 6371
  const rad = (degrees) => (degrees * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const lat1 = rad(from.lat)
  const lat2 = rad(to.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)))
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
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
