import { Router } from 'express'
import { normalizeName } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyClaimOwner } from './notifications.js'

const STATUS_LABEL = {
  nuevo: 'Nuevo',
  recepcion: 'Recepción de producto',
  'pendiente-retiro': 'Pendiente de retiro cliente',
  'enviado-proveedor': 'Enviado al proveedor para verificación',
  reparacion: 'Reparación',
  entregado: 'Entregado al cliente',
  cancelado: 'Cancelado',
}

const ROLES = ['vendedor', 'encargado_deposito', 'admin']
const STATUSES = new Set([
  'nuevo',
  'recepcion',
  'pendiente-retiro',
  'enviado-proveedor',
  'reparacion',
  'entregado',
  'cancelado',
])
const MOTIVES = new Set([
  'Falla técnica / Garantía',
  'Error de despacho (Producto equivocado)',
  'Faltante de accesorios',
  'Arrepentimiento (producto apto para volver a la venta)',
  'Faltante de mercadería',
])
const CLAIM_ID_RE = /^R-\d{7}$/
const TEXT_MAX = 200
const DESCRIPTION_MAX = 2000
const NOTE_MAX = 500
const FILE_MAX_BYTES = 2 * 1024 * 1024
const FILES_TOTAL_MAX_BYTES = 8 * 1024 * 1024
const PHOTOS_MAX = 5
const IMPORT_MAX = 200
const WORD_DOC = 'application/msword'
const WORD_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXCEL_XLS = 'application/vnd.ms-excel'
const EXCEL_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const claimsRouter = Router()
claimsRouter.use(requireAuth)
claimsRouter.use(requireRole(...ROLES))

claimsRouter.get('/', async (req, res) => {
  await send(res, async () => {
    const list = await locked(async () => {
      const all = await readClaims()
      return all.filter((claim) => canAccessClaim(req.user, claim)).map(toListItem)
    })
    res.json(byNewest(list))
  })
})

claimsRouter.post('/', async (req, res) => {
  await send(res, async () => {
    const result = await createClaim(req.user, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(result.claim)
  })
})

claimsRouter.post('/import', async (req, res) => {
  await send(res, async () => {
    const result = await importClaims(req.user, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.summary)
  })
})

claimsRouter.get('/:id', async (req, res) => {
  await send(res, async () => {
    const result = await getClaim(req.user, req.params.id)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

claimsRouter.patch('/:id/status', async (req, res) => {
  await send(res, async () => {
    const result = await patchStatus(req.user, req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

claimsRouter.post('/:id/notes', async (req, res) => {
  await send(res, async () => {
    const result = await addNote(req.user, req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

function byNewest(list) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

function readClaims() {
  return readCollection('claims')
}

function writeClaims(list) {
  return writeCollection('claims', list)
}

function canAccessClaim(user, claim) {
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role !== 'vendedor') return false
  if (claim.createdBy === user.id) return true
  const sellerName = normalizeName(user.sellerName)
  if (!sellerName) return false
  return normalizeName(claim.seller) === sellerName
}

function actorOf(user) {
  return { userId: user.id, userName: user.name }
}

function nextId(claims) {
  const used = new Set(claims.map((item) => item.id))
  let id = ''
  do {
    id = `R-${Math.floor(1000000 + Math.random() * 9000000)}`
  } while (used.has(id))
  return id
}

function toListItem(claim) {
  const hasPhotos = Array.isArray(claim.photos) && claim.photos.some((photo) => photo?.dataUrl)
  const hasAttachment = Boolean(claim.attachment?.dataUrl)
  const item = { ...claim, hasPhotos, hasAttachment }
  delete item.photos
  delete item.attachment
  return item
}

function createClaim(user, body) {
  return locked(async () => {
    const parsed = readCreateBody(body, user)
    if (parsed.error) return parsed
    const list = await readClaims()
    const now = new Date().toISOString()
    const claim = {
      id: nextId(list),
      createdBy: user.id,
      createdAt: now,
      client: parsed.client,
      invoices: parsed.invoices,
      phone: parsed.phone,
      email: parsed.email,
      seller: parsed.seller,
      motive: parsed.motive,
      description: parsed.description,
      products: parsed.products,
      photoNames: parsed.photos.map((photo) => photo.name),
      photos: parsed.photos,
      attachmentName: parsed.attachment?.name ?? '',
      status: 'nuevo',
      events: [{ at: now, status: 'nuevo', by: actorOf(user) }],
    }
    if (parsed.attachment) claim.attachment = parsed.attachment
    list.push(claim)
    await writeClaims(list)
    return { claim }
  })
}

function getClaim(user, id) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('Reclamo no encontrado', 404)
    const list = await readClaims()
    const claim = list.find((item) => item.id === id)
    if (!claim || !canAccessClaim(user, claim)) return fail('Reclamo no encontrado', 404)
    return { claim }
  })
}

function importClaims(user, body) {
  return locked(async () => {
    if (!isRecord(body)) return fail('La importación no es válida.')
    if (!Array.isArray(body.claims)) return fail('Mandá la lista de reclamos en claims.')
    if (body.claims.length > IMPORT_MAX) {
      return fail(`Podés importar hasta ${IMPORT_MAX} reclamos por pedido.`)
    }
    const list = await readClaims()
    const used = new Set(list.map((item) => item.id))
    const incoming = []
    const skipped = []
    for (const item of body.claims) {
      if (!isRecord(item)) return fail('Hay un reclamo que no es válido.')
      const idRaw = typeof item.id === 'string' ? item.id.trim() : ''
      if (CLAIM_ID_RE.test(idRaw) && used.has(idRaw)) {
        skipped.push(idRaw)
        continue
      }
      const parsed = readCreateBody(item, user)
      if (parsed.error) return parsed
      const status = readStatus(item.status)
      if (status.error) return status
      if (typeof item.createdAt !== 'string' || !item.createdAt.trim()) {
        return fail('Cada reclamo importado necesita createdAt.')
      }
      const events = readImportEvents(item.events)
      if (events.error) return events
      let resolvedAt
      if (Object.prototype.hasOwnProperty.call(item, 'resolvedAt') && item.resolvedAt != null) {
        if (typeof item.resolvedAt !== 'string' || !item.resolvedAt.trim()) {
          return fail('El resolvedAt del reclamo no es válido.')
        }
        resolvedAt = item.resolvedAt
      }
      const id = CLAIM_ID_RE.test(idRaw) ? idRaw : nextId([...list, ...incoming])
      used.add(id)
      const claim = {
        id,
        importedBy: user.id,
        createdAt: item.createdAt,
        client: parsed.client,
        invoices: parsed.invoices,
        phone: parsed.phone,
        email: parsed.email,
        seller: parsed.seller,
        motive: parsed.motive,
        description: parsed.description,
        products: parsed.products,
        photoNames: parsed.photos.map((photo) => photo.name),
        photos: parsed.photos,
        attachmentName: parsed.attachment?.name ?? '',
        status: status.value,
        events: events.value,
      }
      if (parsed.attachment) claim.attachment = parsed.attachment
      if (resolvedAt !== undefined) claim.resolvedAt = resolvedAt
      incoming.push(claim)
    }
    if (incoming.length > 0) {
      list.push(...incoming)
      await writeClaims(list)
    }
    return { summary: { imported: incoming.length, skipped } }
  })
}

function readImportEvents(value) {
  if (!Array.isArray(value)) return fail('Los eventos del reclamo no son válidos.')
  const events = []
  for (const item of value) {
    if (!isRecord(item)) return fail('Hay un evento que no es válido.')
    if (typeof item.at !== 'string' || !item.at.trim()) {
      return fail('Hay un evento sin fecha.')
    }
    const status = readStatus(item.status)
    if (status.error) return status
    const event = { at: item.at, status: status.value }
    if (typeof item.note === 'string' && item.note.trim()) {
      const note = item.note.trim()
      if (note.length > NOTE_MAX) return fail(`La nota puede tener hasta ${NOTE_MAX} caracteres.`)
      event.note = note
    }
    events.push(event)
  }
  return { value: events }
}

function patchStatus(user, id, body) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('Reclamo no encontrado', 404)
    if (!isRecord(body)) return fail('El estado no es válido.')
    const status = readStatus(body.status)
    if (status.error) return status
    const list = await readClaims()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0 || !canAccessClaim(user, list[index])) return fail('Reclamo no encontrado', 404)
    const current = list[index]
    if (current.status === status.value) return { claim: current }
    const now = new Date().toISOString()
    const claim = {
      ...current,
      status: status.value,
      events: [...(Array.isArray(current.events) ? current.events : []), { at: now, status: status.value, by: actorOf(user) }],
    }
    if (status.value === 'entregado') claim.resolvedAt = now
    else delete claim.resolvedAt
    list[index] = claim
    await writeClaims(list)
    const label = STATUS_LABEL[status.value] ?? status.value
    await notifyClaimOwner(claim, user, `Reclamo ${claim.id}: pasó a ${label}`)
    return { claim }
  })
}

function addNote(user, id, body) {
  return locked(async () => {
    if (typeof id !== 'string' || !id.trim()) return fail('Reclamo no encontrado', 404)
    if (!isRecord(body)) return fail('La nota no es válida.')
    const note = readNote(body.note)
    if (note.error) return note
    const list = await readClaims()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0 || !canAccessClaim(user, list[index])) return fail('Reclamo no encontrado', 404)
    const current = list[index]
    const now = new Date().toISOString()
    const claim = {
      ...current,
      events: [
        ...(Array.isArray(current.events) ? current.events : []),
        { at: now, status: current.status, note: note.value, by: actorOf(user) },
      ],
    }
    list[index] = claim
    await writeClaims(list)
    await notifyClaimOwner(claim, user, `Reclamo ${claim.id}: nueva nota de ${user.name}`)
    return { claim }
  })
}

function readCreateBody(body, user) {
  if (!isRecord(body)) return fail('El reclamo no es válido.')
  const client = readRequiredText(body.client, 'Ingresá el nombre del cliente.', TEXT_MAX)
  if (client.error) return client
  const motive = readMotive(body.motive)
  if (motive.error) return motive
  const description = readRequiredText(body.description, 'Contá qué pasó.', DESCRIPTION_MAX)
  if (description.error) return description
  const products = readProducts(body.products)
  if (products.error) return products
  const invoices = readStringList(body.invoices, 'factura')
  if (invoices.error) return invoices
  const phone = readOptionalText(body.phone, 'El teléfono')
  if (phone.error) return phone
  const email = readOptionalText(body.email, 'El email')
  if (email.error) return email
  let seller = ''
  if (user.role === 'vendedor') {
    seller = typeof user.sellerName === 'string' ? user.sellerName.trim() : ''
  } else {
    const sellerField = readOptionalText(body.seller, 'El vendedor')
    if (sellerField.error) return sellerField
    seller = sellerField.value
  }
  const files = readFiles(body)
  if (files.error) return files
  return {
    client: client.value,
    motive: motive.value,
    description: description.value,
    products: products.value,
    invoices: invoices.value,
    phone: phone.value,
    email: email.value,
    seller,
    photos: files.photos,
    attachment: files.attachment,
  }
}

function readMotive(value) {
  if (typeof value !== 'string' || !MOTIVES.has(value.trim())) {
    return fail('Elegí un motivo válido.')
  }
  return { value: value.trim() }
}

function readStatus(value) {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    return fail('El estado del reclamo no es válido.')
  }
  return { value }
}

function readNote(value) {
  if (typeof value !== 'string' || !value.trim()) return fail('Escribí una nota.')
  const trimmed = value.trim()
  if (trimmed.length > NOTE_MAX) return fail(`La nota puede tener hasta ${NOTE_MAX} caracteres.`)
  return { value: trimmed }
}

function readProducts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return fail('Agregá al menos un producto.')
  }
  const products = []
  for (const item of value) {
    if (!isRecord(item)) return fail('Hay un producto que no es válido.')
    const name = readRequiredText(item.name, 'Ingresá el nombre del producto.', TEXT_MAX)
    if (name.error) return name
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return fail('La cantidad del producto tiene que ser un entero mayor a cero.')
    }
    products.push({ name: name.value, quantity: item.quantity })
  }
  return { value: products }
}

function readStringList(value, label) {
  if (value === undefined || value === null) return { value: [] }
  if (!Array.isArray(value)) return fail(`La lista de ${label}s no es válida.`)
  const list = []
  for (const item of value) {
    if (typeof item !== 'string') return fail(`Hay una ${label} que no es válida.`)
    const trimmed = item.trim()
    if (!trimmed) continue
    if (trimmed.length > TEXT_MAX) return fail(`Cada ${label} puede tener hasta ${TEXT_MAX} caracteres.`)
    list.push(trimmed)
  }
  return { value: list }
}

function readRequiredText(value, message, max) {
  if (typeof value !== 'string' || !value.trim()) return fail(message)
  const trimmed = value.trim()
  if (trimmed.length > max) return fail(`El texto puede tener hasta ${max} caracteres.`)
  return { value: trimmed }
}

function readOptionalText(value, label) {
  if (value === undefined || value === null) return { value: '' }
  if (typeof value !== 'string') return fail(`${label} no es válido.`)
  const trimmed = value.trim()
  if (trimmed.length > TEXT_MAX) return fail(`${label} puede tener hasta ${TEXT_MAX} caracteres.`)
  return { value: trimmed }
}

function readFiles(body) {
  let photos = []
  if (Object.prototype.hasOwnProperty.call(body, 'photos')) {
    if (!Array.isArray(body.photos)) return fail('Las fotos no son válidas.')
    if (body.photos.length > PHOTOS_MAX) return fail(`Podés adjuntar hasta ${PHOTOS_MAX} fotos.`)
    photos = []
    for (const item of body.photos) {
      const file = readFile(item, 'foto')
      if (file.error) return file
      photos.push(file.value)
    }
  }
  let attachment
  if (Object.prototype.hasOwnProperty.call(body, 'attachment') && body.attachment != null) {
    const file = readFile(body.attachment, 'archivo')
    if (file.error) return file
    attachment = file.value
  }
  const total = [...photos, ...(attachment ? [attachment] : [])].reduce(
    (sum, file) => sum + fileBytes(file.dataUrl),
    0,
  )
  if (total > FILES_TOTAL_MAX_BYTES) {
    return fail('Los archivos del reclamo no pueden superar los 8 MB en total.')
  }
  return { photos, attachment }
}

function readFile(value, label) {
  if (!isRecord(value)) return fail(`El ${label} no es válido.`)
  const name = readRequiredText(value.name, `El ${label} necesita un nombre.`, TEXT_MAX)
  if (name.error) return name
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:')) {
    return fail(`El ${label} tiene que ser un data URL.`)
  }
  const mime = mimeOfDataUrl(value.dataUrl)
  if (!mime || !isAllowedMime(mime)) {
    return fail(`El ${label} tiene que ser una imagen, un PDF, Word o Excel.`)
  }
  const bytes = fileBytes(value.dataUrl)
  if (bytes < 0) return fail(`El ${label} no se pudo leer.`)
  if (bytes > FILE_MAX_BYTES) return fail(`El ${label} no puede superar los 2 MB.`)
  return { value: { name: name.value, dataUrl: value.dataUrl } }
}

function mimeOfDataUrl(dataUrl) {
  const match = /^data:([^;,]+)/i.exec(dataUrl)
  return match ? match[1].trim().toLowerCase() : ''
}

function isAllowedMime(mime) {
  if (mime.startsWith('image/')) return true
  return (
    mime === 'application/pdf' ||
    mime === WORD_DOC ||
    mime === WORD_DOCX ||
    mime === EXCEL_XLS ||
    mime === EXCEL_XLSX
  )
}

function fileBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return -1
  const meta = dataUrl.slice(0, comma)
  const data = dataUrl.slice(comma + 1)
  try {
    if (/;base64/i.test(meta)) {
      return Buffer.from(data, 'base64').byteLength
    }
    return Buffer.byteLength(decodeURIComponent(data), 'utf8')
  } catch {
    return -1
  }
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
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
