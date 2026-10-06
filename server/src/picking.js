import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'

const ROLES = ['deposito', 'encargado_deposito', 'admin']
const STATUSES = new Set(['pendiente', 'en_preparacion', 'preparado'])
const RAW_MAX_KEYS = 100
const RAW_KEY_MAX = 100
const RAW_STRING_MAX = 1000
const RAW_JSON_MAX = 16 * 1024
const CANTIDAD_MAX = 100_000
const ORDER_ID_MAX = 64

export const pickingRouter = Router()
pickingRouter.use(requireAuth)
pickingRouter.use(requireRole(...ROLES))

pickingRouter.get('/', async (_req, res) => {
  await send(res, async () => {
    const list = await locked(readPicking)
    res.json(byNewest(list))
  })
})

pickingRouter.post('/', async (req, res) => {
  await send(res, async () => {
    const result = await createRow(req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(result.row)
  })
})

pickingRouter.patch('/:id', async (req, res) => {
  await send(res, async () => {
    const result = await updateRow(req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.row)
  })
})

pickingRouter.delete('/:id', requireRole('encargado_deposito', 'admin'), async (req, res) => {
  await send(res, async () => {
    const result = await deleteRow(req.params.id)
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

function updateRow(id, body) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('No existe esa fila de picking.', 404)
    if (!isRecord(body)) return fail('La fila de picking no es válida.')
    const list = await readPicking()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa fila de picking.', 404)
    const patch = readPatchBody(body)
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
    list[index] = row
    await writePicking(list)
    return { row }
  })
}

function deleteRow(id) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('No existe esa fila de picking.', 404)
    const list = await readPicking()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return fail('No existe esa fila de picking.', 404)
    list.splice(index, 1)
    await writePicking(list)
    return { ok: true }
  })
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
  if (Object.prototype.hasOwnProperty.call(body, 'pickedQty')) {
    const pickedQty = readPickedQty(body.pickedQty)
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

function readPatchBody(body) {
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
      const pickedQty = readPickedQty(body.pickedQty)
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

function readPickedQty(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail('La cantidad pickeada no es válida.')
  }
  if (value > CANTIDAD_MAX) return fail(`La cantidad pickeada no puede ser mayor a ${CANTIDAD_MAX}.`)
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

function fail(error, status = 400) {
  return { error, status }
}

function sendError(res, result) {
  res.status(result.status).json({ message: result.error })
}

async function send(res, task) {
  try {
    await task()
  } catch {
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
