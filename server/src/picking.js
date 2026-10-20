import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { normalizeName } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyEncargados } from './notifications.js'
import { withHistory } from './orderFlow.js'
import { linkUniquePickingRows } from './invoiceKey.js'
import { rowIsPicked } from './preparation.js'

const ROLES = ['deposito', 'encargado_deposito', 'admin']
const READ_ROLES = ['vendedor', ...ROLES]
const STATUSES = new Set(['pendiente', 'en_preparacion', 'preparado'])
const RAW_MAX_KEYS = 100
const RAW_KEY_MAX = 100
const RAW_STRING_MAX = 1000
const RAW_JSON_MAX = 16 * 1024
export const CANTIDAD_MAX = 100_000
const ORDER_ID_MAX = 64
const BATCH_MAX = 2000
const BATCH_MODES = new Set(['replace', 'merge'])

export const pickingRouter = Router()
pickingRouter.use(requireAuth)

pickingRouter.get('/', requireRole(...READ_ROLES), async (req, res) => {
  await send(res, async () => {
    const list = await locked(readPicking)
    if (req.user.role === 'vendedor') {
      const seller = normalizeName(req.user.sellerName)
      if (!seller) {
        res.json([])
        return
      }
      res.json(
        byNewest(list.filter((row) => normalizeName(row.vendedor) === seller)),
      )
      return
    }
    res.json(byNewest(list))
  })
})

pickingRouter.post('/', requireRole(...ROLES), async (req, res) => {
  await send(res, async () => {
    const result = await createRow(req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(result.row)
  })
})

pickingRouter.post('/batch', requireRole(...ROLES), async (req, res) => {
  await send(res, async () => {
    const result = await batchRows(req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.summary)
  })
})

pickingRouter.patch('/:id', requireRole(...ROLES), async (req, res) => {
  await send(res, async () => {
    const result = await updateRow(req.params.id, req.body, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.row)
  })
})

pickingRouter.delete('/:id', requireRole('encargado_deposito', 'admin'), async (req, res) => {
  await send(res, async () => {
    const result = await deleteRow(req.params.id, req.user)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(204).end()
  })
})

function byNewest(list) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

function readPicking() {
  return readCollection('picking')
}

function writePicking(list) {
  return writeCollection('picking', list)
}

function createRow(body) {
  return locked(async () => {
    const parsed = readCreateBody(body)
    if (parsed.error) return parsed
    const list = await readPicking()
    const now = new Date().toISOString()
    const row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      cliente: parsed.cliente,
      comprobante: parsed.comprobante,
      articulo: parsed.articulo,
      cantidad: parsed.cantidad,
      vendedor: parsed.vendedor,
      raw: parsed.raw,
      status: parsed.status ?? 'pendiente',
    }
    if (parsed.pickedQty !== undefined) row.pickedQty = parsed.pickedQty
    if (parsed.orderId !== undefined) row.orderId = parsed.orderId
    list.push(row)
    await writePicking(list)
    return { row }
  })
}

function updateRow(id, body, user) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('No existe esa fila de picking.', 404)
    if (!isRecord(body)) return fail('La fila de picking no es válida.')
    const list = await readPicking()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa fila de picking.', 404)
    const patch = readPatchBody(body, list[index])
    if (patch.error) return patch
    if (patch.fields.length === 0 && patch.clear.length === 0) {
      return fail('No hay cambios para guardar.')
    }
    const row = {
      ...list[index],
      updatedAt: new Date().toISOString(),
    }
    for (const [key, value] of patch.fields) {
      row[key] = value
    }
    for (const key of patch.clear) {
      delete row[key]
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'cantidad') &&
      typeof row.pickedQty === 'number' &&
      typeof row.cantidad === 'number' &&
      row.pickedQty > row.cantidad
    ) {
      row.pickedQty = Math.floor(row.cantidad)
    }
    if (!(typeof row.orderId === 'string' && row.orderId)) {
      const orders = await readCollection('orders')
      const orderList = Array.isArray(orders) ? orders : []
      const candidate = { ...list[index] }
      if (linkUniquePickingRows([candidate], orderList)) {
        list[index] = { ...list[index], orderId: candidate.orderId }
        row.orderId = candidate.orderId
        await writePicking(list)
      }
    }
    const linked = await guardLinkedOrder(row.orderId, user)
    if (linked.error) return linked
    list[index] = row
    await writePicking(list)
    if (linked.order) await syncChecklist(linked.orders, linked.index, user)
    return { row }
  })
}

async function guardLinkedOrder(orderId, user) {
  if (typeof orderId !== 'string' || !orderId) return { order: null }
  const orders = await readCollection('orders')
  const index = orders.findIndex((item) => item && item.id === orderId)
  if (index < 0) return { order: null }
  const order = orders[index]
  if (order.status !== 'pendiente' && order.status !== 'preparado') {
    return fail('El pedido ya salió de preparación.', 409)
  }
  if (user?.role === 'deposito') {
    const own = order.status === 'preparado' && order.preparedBy && order.preparedBy.id === user.id
    if (order.status !== 'pendiente' && !own) {
      return fail('No podés completar el checklist de este pedido.', 403)
    }
  }
  return { order, orders, index }
}

export async function syncChecklist(orders, index, user) {
  const order = orders[index]
  if (!order) return
  const picking = await readCollection('picking')
  const rows = Array.isArray(picking) ? picking.filter((item) => item && item.orderId === order.id) : []
  if (rows.length === 0) {
    if (!order.prepChecklist && order.prepIncomplete !== true) return
    orders[index] = {
      ...order,
      prepChecklist: { done: 0, total: 0 },
      prepIncomplete: false,
      updatedAt: new Date().toISOString(),
    }
    await writeCollection('orders', orders)
    return
  }
  const total = rows.length
  const done = rows.filter((item) => rowIsPicked(item)).length
  const wasIncomplete = order.prepIncomplete === true
  const next = {
    ...order,
    prepChecklist: { done, total },
    prepIncomplete: done < total,
    updatedAt: new Date().toISOString(),
  }
  if (order.status === 'preparado' && wasIncomplete && done === total) {
    const history = withHistory(next).history.map((entry) => ({
      ...entry,
      by: entry.by ? { ...entry.by } : entry.by,
    }))
    const name = typeof user?.name === 'string' ? user.name.trim() : ''
    history.push({
      at: next.updatedAt,
      by: { id: user?.id ?? '', name },
      from: 'preparado',
      to: 'preparado',
      reason: `Armado completado (${total} artículos)`,
      via: 'preparacion',
    })
    next.history = history
    orders[index] = next
    await writeCollection('orders', orders)
    try {
      await notifyEncargados({
        text: `${name} completó el pedido ${order.id} (${total} artículos)`,
        orderId: order.id,
        whatsapp: false,
      })
    } catch (error) {
      console.error('No se pudo avisar el armado completado', error)
    }
    return
  }
  orders[index] = next
  await writeCollection('orders', orders)
}

function deleteRow(id, user) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('No existe esa fila de picking.', 404)
    const list = await readPicking()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa fila de picking.', 404)
    const orderId = typeof list[index]?.orderId === 'string' ? list[index].orderId : ''
    list.splice(index, 1)
    await writePicking(list)
    if (orderId) {
      const orders = await readCollection('orders')
      if (Array.isArray(orders)) {
        const orderIndex = orders.findIndex((item) => item && item.id === orderId)
        if (orderIndex >= 0) await syncChecklist(orders, orderIndex, user)
      }
    }
    return { ok: true }
  })
}

function batchRows(body) {
  return locked(async () => {
    if (!isRecord(body)) return fail('El lote de picking no es válido.')
    const mode = typeof body.mode === 'string' ? body.mode.trim() : ''
    if (!BATCH_MODES.has(mode)) return fail('Indicá mode replace o merge.')
    if (!Array.isArray(body.rows)) return fail('Mandá la lista de filas en rows.')
    if (body.rows.length > BATCH_MAX) {
      return fail(`El lote puede tener como máximo ${BATCH_MAX} filas.`)
    }
    if (mode === 'replace' && body.rows.length === 0) {
      return fail('No hay filas para importar.')
    }
    const errors = []
    const parsed = []
    const seenKeys = new Map()
    body.rows.forEach((row, index) => {
      const result = readCreateBody(row)
      if (result.error) {
        errors.push({ index, message: result.error })
        return
      }
      const key = mergeKey(result.comprobante, result.articulo)
      const previous = seenKeys.get(key)
      if (previous !== undefined) {
        errors.push({ index, message: `Fila repetida con la fila ${previous + 1}` })
        return
      }
      seenKeys.set(key, index)
      parsed.push(result)
    })
    if (errors.length > 0) {
      return {
        error: 'Hay filas inválidas en el lote.',
        status: 400,
        errors,
      }
    }
    const current = await readPicking()
    const now = new Date().toISOString()
    const orders = await readCollection('orders')
    const orderList = Array.isArray(orders) ? orders : []
    if (mode === 'replace') {
      const kept = current.filter((row) => {
        const source = rowSource(row)
        return source === 'manual' || source === 'crm'
      })
      const createdRows = parsed.map((item) => buildNewRow(item, now))
      const next = [...createdRows, ...kept]
      linkUniquePickingRows(next, orderList)
      await writePicking(next)
      return {
        summary: {
          created: createdRows.length,
          updated: 0,
          removed: current.filter((row) => rowSource(row) === 'excel').length,
        },
      }
    }
    const next = current.map((row) => ({ ...row, raw: { ...row.raw } }))
    const oldestByKey = new Map()
    for (let index = 0; index < next.length; index += 1) {
      const row = next[index]
      if (rowSource(row) !== 'excel') continue
      const key = mergeKey(row.comprobante, row.articulo)
      const previous = oldestByKey.get(key)
      if (previous === undefined) {
        oldestByKey.set(key, index)
        continue
      }
      const previousAt = typeof next[previous].createdAt === 'string' ? next[previous].createdAt : ''
      const createdAt = typeof row.createdAt === 'string' ? row.createdAt : ''
      if (createdAt < previousAt) oldestByKey.set(key, index)
    }
    let created = 0
    let updated = 0
    for (const item of parsed) {
      const key = mergeKey(item.comprobante, item.articulo)
      const index = oldestByKey.get(key)
      if (index !== undefined) {
        const existing = next[index]
        const patched = {
          ...existing,
          cliente: item.cliente,
          comprobante: item.comprobante,
          articulo: item.articulo,
          cantidad: item.cantidad,
          vendedor: item.vendedor,
          raw: item.raw,
          ...(item.codigo ? { codigo: item.codigo } : existing.codigo ? { codigo: existing.codigo } : {}),
        }
        if (typeof existing.pickedQty === 'number' && existing.pickedQty > item.cantidad) {
          patched.pickedQty = Math.floor(item.cantidad)
        }
        if (!sameMergeFields(existing, patched) || patched.pickedQty !== existing.pickedQty) {
          patched.updatedAt = now
          next[index] = patched
          updated += 1
        }
      } else {
        next.push(buildNewRow(item, now))
        created += 1
      }
    }
    linkUniquePickingRows(next, orderList)
    await writePicking(next)
    return { summary: { created, updated, removed: 0 } }
  })
}

function sameRaw(left, right) {
  if (!isRecord(left) || !isRecord(right)) return left === right
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    if (left[key] !== right[key]) return false
  }
  return true
}

function sameMergeFields(left, right) {
  return (
    left.cliente === right.cliente &&
    left.comprobante === right.comprobante &&
    left.articulo === right.articulo &&
    left.cantidad === right.cantidad &&
    left.vendedor === right.vendedor &&
    (left.codigo || '') === (right.codigo || '') &&
    sameRaw(left.raw, right.raw)
  )
}

function buildNewRow(parsed, now) {
  const row = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    cliente: parsed.cliente,
    comprobante: parsed.comprobante,
    articulo: parsed.articulo,
    cantidad: parsed.cantidad,
    vendedor: parsed.vendedor,
    raw: parsed.raw,
    status: parsed.status ?? 'pendiente',
    source: 'excel',
  }
  if (parsed.codigo) row.codigo = parsed.codigo
  if (parsed.pickedQty !== undefined) row.pickedQty = parsed.pickedQty
  if (parsed.orderId !== undefined) row.orderId = parsed.orderId
  return row
}

function rowSource(row) {
  if (row?.source === 'manual' || row?.source === 'crm' || row?.source === 'excel') return row.source
  return 'excel'
}

function mergeKey(comprobante, articulo) {
  return `${normalizeKeyPart(comprobante)}\0${normalizeKeyPart(articulo)}`
}

function normalizeKeyPart(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es')
}

function readCreateBody(body) {
  if (!isRecord(body)) return fail('La fila de picking no es válida.')
  const cliente = readRequiredText(body.cliente, 'Ingresá el cliente.')
  if (cliente.error) return cliente
  const comprobante = readRequiredText(body.comprobante, 'Ingresá el comprobante.')
  if (comprobante.error) return comprobante
  const articulo = readRequiredText(body.articulo ?? body['artículo'], 'Ingresá el artículo.')
  if (articulo.error) return articulo
  const cantidad = readCantidad(body.cantidad)
  if (cantidad.error) return cantidad
  const vendedor = readOptionalText(body.vendedor, 'El vendedor')
  if (vendedor.error) return vendedor
  const codigo = readOptionalText(body.codigo, 'El código')
  if (codigo.error) return codigo
  const raw = readRaw(body.raw)
  if (raw.error) return raw
  const result = {
    cliente: cliente.value,
    comprobante: comprobante.value,
    articulo: articulo.value,
    cantidad: cantidad.value,
    vendedor: vendedor.value,
    raw: raw.value,
  }
  if (codigo.value) result.codigo = codigo.value
  if (Object.prototype.hasOwnProperty.call(body, 'pickedQty')) {
    const pickedQty = readPickedQty(body.pickedQty, cantidad.value)
    if (pickedQty.error) return pickedQty
    result.pickedQty = pickedQty.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'orderId')) {
    const orderId = readOrderId(body.orderId)
    if (orderId.error) return orderId
    if (orderId.value !== undefined) result.orderId = orderId.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = readStatus(body.status)
    if (status.error) return status
    result.status = status.value
  }
  return result
}

function readPatchBody(body, current) {
  const fields = []
  const clear = []
  if (Object.prototype.hasOwnProperty.call(body, 'cliente')) {
    const cliente = readRequiredText(body.cliente, 'Ingresá el cliente.')
    if (cliente.error) return cliente
    fields.push(['cliente', cliente.value])
  }
  if (Object.prototype.hasOwnProperty.call(body, 'comprobante')) {
    const comprobante = readRequiredText(body.comprobante, 'Ingresá el comprobante.')
    if (comprobante.error) return comprobante
    fields.push(['comprobante', comprobante.value])
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'articulo') ||
    Object.prototype.hasOwnProperty.call(body, 'artículo')
  ) {
    const articulo = readRequiredText(body.articulo ?? body['artículo'], 'Ingresá el artículo.')
    if (articulo.error) return articulo
    fields.push(['articulo', articulo.value])
  }
  if (Object.prototype.hasOwnProperty.call(body, 'cantidad')) {
    const cantidad = readCantidad(body.cantidad)
    if (cantidad.error) return cantidad
    fields.push(['cantidad', cantidad.value])
  }
  if (Object.prototype.hasOwnProperty.call(body, 'vendedor')) {
    const vendedor = readOptionalText(body.vendedor, 'El vendedor')
    if (vendedor.error) return vendedor
    fields.push(['vendedor', vendedor.value])
  }
  if (Object.prototype.hasOwnProperty.call(body, 'raw')) {
    const raw = readRaw(body.raw)
    if (raw.error) return raw
    fields.push(['raw', raw.value])
  }
  if (Object.prototype.hasOwnProperty.call(body, 'pickedQty')) {
    if (body.pickedQty === null) clear.push('pickedQty')
    else {
      const cantidadField = fields.find(([key]) => key === 'cantidad')
      const cantidad = cantidadField ? cantidadField[1] : current.cantidad
      const pickedQty = readPickedQty(body.pickedQty, cantidad)
      if (pickedQty.error) return pickedQty
      fields.push(['pickedQty', pickedQty.value])
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'orderId')) {
    if (body.orderId === null || body.orderId === '') clear.push('orderId')
    else {
      const orderId = readOrderId(body.orderId)
      if (orderId.error) return orderId
      if (orderId.value !== undefined) fields.push(['orderId', orderId.value])
      else clear.push('orderId')
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = readStatus(body.status)
    if (status.error) return status
    fields.push(['status', status.value])
  }
  return { fields, clear }
}

function readRequiredText(value, message) {
  if (typeof value !== 'string' || !value.trim()) return fail(message)
  const trimmed = value.trim()
  if (trimmed.length > 200) return fail('El texto es demasiado largo.')
  return { value: trimmed }
}

function readOptionalText(value, label) {
  if (value === undefined || value === null) return { value: '' }
  if (typeof value !== 'string') return fail(`${label} no es válido.`)
  const trimmed = value.trim()
  if (trimmed.length > 200) return fail(`${label} es demasiado largo.`)
  return { value: trimmed }
}

function readCantidad(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fail('Ingresá una cantidad mayor a cero.')
  }
  if (value > CANTIDAD_MAX) return fail(`La cantidad no puede ser mayor a ${CANTIDAD_MAX}.`)
  return { value }
}

function readPickedQty(value, cantidad) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('La cantidad pickeada no es válida.')
  }
  if (!Number.isInteger(value)) {
    return fail('La cantidad pickeada tiene que ser un número entero.')
  }
  if (value < 0) {
    return fail('La cantidad pickeada no puede ser menor a cero.')
  }
  if (typeof cantidad === 'number' && Number.isFinite(cantidad) && value > cantidad) {
    return fail(`La cantidad pickeada no puede ser mayor a ${cantidad}.`)
  }
  if (value > CANTIDAD_MAX) {
    return fail(`La cantidad pickeada no puede ser mayor a ${CANTIDAD_MAX}.`)
  }
  return { value }
}

function readOrderId(value) {
  if (value === null || value === '') return { value: undefined }
  if (typeof value !== 'string' || !value.trim()) return fail('El pedido vinculado no es válido.')
  const trimmed = value.trim()
  if (trimmed.length > ORDER_ID_MAX) {
    return fail(`El pedido vinculado puede tener hasta ${ORDER_ID_MAX} caracteres.`)
  }
  return { value: trimmed }
}

function readStatus(value) {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    return fail('El estado de picking no es válido.')
  }
  return { value }
}

function readRaw(value) {
  if (!isRecord(value)) return fail('Faltan las columnas originales del archivo.')
  const entries = Object.entries(value)
  if (entries.length === 0) return fail('Faltan las columnas originales del archivo.')
  if (entries.length > RAW_MAX_KEYS) {
    return fail(`raw puede tener como máximo ${RAW_MAX_KEYS} columnas.`)
  }
  const raw = {}
  for (const [key, item] of entries) {
    if (typeof key !== 'string') return fail('Las columnas originales del archivo no son válidas.')
    const trimmedKey = key.trim()
    if (!trimmedKey) return fail('Hay una columna de raw sin nombre.')
    if (trimmedKey.length > RAW_KEY_MAX) {
      return fail(`Cada clave de raw puede tener hasta ${RAW_KEY_MAX} caracteres.`)
    }
    if (Object.prototype.hasOwnProperty.call(raw, trimmedKey)) {
      return fail('Hay columnas repetidas en raw después del trim.')
    }
    if (item === null || item === undefined) {
      raw[trimmedKey] = ''
      continue
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      raw[trimmedKey] = item
      continue
    }
    if (typeof item === 'string') {
      if (item.length > RAW_STRING_MAX) {
        return fail(`Cada valor de texto en raw puede tener hasta ${RAW_STRING_MAX} caracteres.`)
      }
      raw[trimmedKey] = item
      continue
    }
    return fail('Las columnas originales del archivo no son válidas.')
  }
  if (Object.keys(raw).length === 0) return fail('Faltan las columnas originales del archivo.')
  let encoded = ''
  try {
    encoded = JSON.stringify(raw)
  } catch {
    return fail('raw no se pudo serializar.')
  }
  if (Buffer.byteLength(encoded, 'utf8') > RAW_JSON_MAX) {
    return fail('raw no puede superar los 16 KB.')
  }
  return { value: raw }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export const ITEM_CODE_MAX = 60
export const ITEM_DESCRIPTION_MAX = 200

export function readManualItem(body, partial = false) {
  if (!isRecord(body)) return fail('El artículo no es válido.')
  const hasCode = Object.prototype.hasOwnProperty.call(body, 'code')
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description')
  const hasQuantity = Object.prototype.hasOwnProperty.call(body, 'quantity')
  const result = {}
  if (hasCode || !partial) {
    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code || code.length > ITEM_CODE_MAX) return fail('Cargá el código del artículo.', 400, 'code')
    result.code = code
  }
  if (hasDescription && body.description != null && body.description !== '') {
    if (typeof body.description !== 'string' || body.description.trim().length > ITEM_DESCRIPTION_MAX) {
      return fail('La descripción puede tener hasta 200 caracteres.', 400, 'description')
    }
    result.description = body.description.trim()
  } else if (hasDescription) {
    result.description = ''
  }
  if (hasQuantity || !partial) {
    const quantity = body.quantity
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > CANTIDAD_MAX) {
      return fail('La cantidad tiene que ser un entero mayor a 0.', 400, 'quantity')
    }
    result.quantity = quantity
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'internalCode') &&
    body.internalCode != null &&
    body.internalCode !== ''
  ) {
    if (typeof body.internalCode !== 'string') return fail('El código interno no es válido.', 400, 'code')
    const internalCode = body.internalCode.trim()
    if (!internalCode || internalCode.length > 20) {
      return fail('El código interno puede tener hasta 20 caracteres.', 400, 'code')
    }
    result.internalCode = internalCode
  }
  return result
}

export function readManualItems(value) {
  if (value === undefined) return { value: [] }
  if (!Array.isArray(value)) return fail('Los artículos no son válidos.')
  if (value.length > 100) return fail('Podés cargar hasta 100 artículos.')
  const items = []
  for (const item of value) {
    const parsed = readManualItem(item)
    if (parsed.error) return parsed
    items.push(parsed)
  }
  return { value: items }
}

export function buildManualRow(order, item, now, raw) {
  const invoices = Array.isArray(order?.invoices)
    ? order.invoices.filter((value) => typeof value === 'string' && value.trim())
    : []
  const description = typeof item.description === 'string' ? item.description.trim() : ''
  const stored = isRecord(raw) ? { ...raw } : {}
  if (item.internalCode && stored.internalCode == null) stored.internalCode = item.internalCode
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    cliente: typeof order?.client === 'string' ? order.client : '',
    comprobante: invoices[0] || order.id,
    articulo: description || item.code,
    cantidad: item.quantity,
    vendedor: typeof order?.seller === 'string' ? order.seller : '',
    codigo: item.code,
    raw: stored,
    status: 'pendiente',
    orderId: order.id,
    source: 'manual',
  }
}

function fail(error, status = 400, field) {
  return field ? { error, status, field } : { error, status }
}

function sendError(res, result) {
  const body = { message: result.error }
  if (Array.isArray(result.errors)) body.errors = result.errors
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
