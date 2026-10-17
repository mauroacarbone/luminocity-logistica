import { Router } from 'express'
import { businessToday, normalizeName } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { notifyClaimOwner, notifyClaimSeller, notifyEncargados, notifyRole, notifyUser } from './notifications.js'

const STATUS_LABEL = {
  nuevo: 'Nuevo',
  recepcion: 'Recepción de producto',
  'pendiente-retiro': 'Pendiente de retiro cliente',
  'enviado-proveedor': 'Enviado al proveedor para verificación',
  reparacion: 'Reparación',
  entregado: 'Entregado al cliente',
  cancelado: 'Cancelado',
}

const ROLES = ['vendedor', 'deposito', 'tecnico', 'encargado_deposito', 'admin']
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
    await sweepExpiredQuotes()
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
    await sweepExpiredQuotes()
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

claimsRouter.post('/:id/repair', async (req, res) => {
  await send(res, async () => {
    const result = await openRepair(req.user, req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.status(201).json(result.claim)
  })
})

claimsRouter.post('/:id/repair/take', async (req, res) => {
  await send(res, async () => {
    const result = await takeRepair(req.user, req.params.id)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

claimsRouter.patch('/:id/repair', async (req, res) => {
  await send(res, async () => {
    const result = await updateRepair(req.user, req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

claimsRouter.post('/:id/repair/step', async (req, res) => {
  await send(res, async () => {
    const result = await stepRepair(req.user, req.params.id, req.body)
    if (result.error) {
      sendError(res, result)
      return
    }
    res.json(result.claim)
  })
})

claimsRouter.post('/:id/repair/contact', async (req, res) => {
  await send(res, async () => {
    const result = await contactRepair(req.user, req.params.id, req.body)
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
  if (
    user.role === 'admin' ||
    user.role === 'encargado_deposito' ||
    user.role === 'tecnico' ||
    user.role === 'deposito'
  ) {
    return true
  }
  if (user.role !== 'vendedor') return false
  if (claim.createdBy === user.id) return true
  const sellerName = normalizeName(user.sellerName)
  if (!sellerName) return false
  return normalizeName(claim.seller) === sellerName
}

function repairOnly(user) {
  return user?.role === 'deposito' || user?.role === 'tecnico'
}

function denyRepairWriter(user) {
  if (repairOnly(user)) return fail('Solo podés cargar la reparación.', 403)
  return null
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
    if (user.role === 'tecnico') return fail('Solo podés cargar la reparación.', 403)
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
    let notice = null
    if (isRecord(body.intake)) {
      const opened = applyIntake(claim, user, body.intake, now)
      if (opened.error) return opened
      notice = opened.notify
    }
    list.push(claim)
    await writeClaims(list)
    if (notice) await notifyRole('tecnico', notice)
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
    const blocked = denyRepairWriter(user)
    if (blocked) return blocked
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
    const blocked = denyRepairWriter(user)
    if (blocked) return blocked
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

const COVERAGE = new Set(['garantia', 'cobro'])
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const moneyFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

function canOpenRepair(user) {
  return user?.role === 'deposito' || user?.role === 'encargado_deposito' || user?.role === 'admin'
}

function canEditRepair(user, repair) {
  if (user?.role === 'encargado_deposito' || user?.role === 'admin') return true
  return user?.role === 'tecnico' && repair?.technician?.id === user.id
}

function readDay(value, label, { required = true, notFuture = false, notPast = false } = {}) {
  const day = typeof value === 'string' ? value.trim() : ''
  if (!day) {
    if (!required) return { value: '' }
    return fail(`Cargá ${label}.`)
  }
  if (!DAY_RE.test(day)) return fail(`La ${label} no es válida.`)
  const today = businessToday()
  if (notFuture && day > today) return fail(`La ${label} no puede ser futura.`)
  if (notPast && day < today) return fail(`La ${label} tiene que ser hoy o después.`)
  return { value: day }
}

function readAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fail('El importe tiene que ser mayor a 0.')
  }
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 0.001) return fail('El importe puede tener hasta 2 decimales.')
  return { value: cents / 100 }
}

function formatDay(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}`
}

function repairNotice(claim) {
  const product = claim.repair?.product || 'un producto'
  return {
    text: `Ingresó una reparación: ${product} de ${claim.client} (reclamo ${claim.id})`,
    claimId: claim.id,
  }
}

function applyIntake(claim, user, body, now) {
  if (!canOpenRepair(user)) return fail('Solo podés cargar la reparación.', 403)
  if (claim.repair) return fail('Este reclamo ya tiene una reparación.', 409)
  const invoice = typeof body.invoice === 'string' ? body.invoice.trim() : ''
  if (!invoice || invoice.length > TEXT_MAX) return fail('Cargá la factura.')
  const client = typeof body.client === 'string' ? body.client.trim() : claim.client
  if (!client || client.length > TEXT_MAX) return fail('Cargá el cliente.')
  const fallback = claim.products?.[0]?.name ?? ''
  const product = typeof body.product === 'string' && body.product.trim() ? body.product.trim() : fallback
  if (!product || product.length > TEXT_MAX) return fail('Cargá el producto.')
  const coverage = body.coverage
  if (!COVERAGE.has(coverage)) return fail('Elegí si es garantía o cobro.')
  const intake = readDay(body.intakeAt || businessToday(), 'fecha de ingreso', { notFuture: true })
  if (intake.error) return intake
  if (!claim.invoices.includes(invoice)) claim.invoices = [invoice, ...claim.invoices]
  claim.client = client
  claim.status = 'recepcion'
  claim.repair = {
    intakeAt: intake.value,
    product,
    coverage,
    diagnosis: '',
    quote: {},
    step: 'por-levantar',
    contacts: [],
    receivedBy: { id: user.id, name: user.name },
  }
  claim.events.push({
    at: now,
    status: 'recepcion',
    note: `Producto recibido por ${user.name}`,
    by: actorOf(user),
  })
  return { notify: repairNotice(claim) }
}

function openRepair(user, id, body) {
  return locked(async () => {
    const found = await findClaim(user, id)
    if (found.error) return found
    const now = new Date().toISOString()
    const opened = applyIntake(found.claim, user, isRecord(body) ? body : {}, now)
    if (opened.error) return opened
    await writeClaims(found.list)
    await notifyRole('tecnico', opened.notify)
    return { claim: found.claim }
  })
}

function takeRepair(user, id) {
  return locked(async () => {
    if (user.role !== 'tecnico' && user.role !== 'admin') {
      return fail('Solo podés cargar la reparación.', 403)
    }
    const found = await findClaim(user, id)
    if (found.error) return found
    const repair = found.claim.repair
    if (!repair) return fail('Este reclamo no tiene una reparación.', 409)
    const current = repair.technician
    if (current && current.id !== user.id && user.role !== 'admin') {
      return fail(`Lo tiene ${current.name}`, 409)
    }
    repair.technician = { id: user.id, name: user.name }
    repair.step = 'diagnostico'
    found.claim.status = 'reparacion'
    found.claim.events.push({
      at: new Date().toISOString(),
      status: 'reparacion',
      note: `Levantado por ${user.name}`,
      by: actorOf(user),
    })
    await writeClaims(found.list)
    return { claim: found.claim }
  })
}

function updateRepair(user, id, body) {
  return locked(async () => {
    const found = await findClaim(user, id)
    if (found.error) return found
    const repair = found.claim.repair
    if (!repair) return fail('Este reclamo no tiene una reparación.', 409)
    if (!canEditRepair(user, repair)) return fail('Solo podés cargar la reparación.', 403)
    if (!isRecord(body)) return fail('Revisá los datos de la reparación.')
    if (body.phoneKind === 'movil' || body.phoneKind === 'fijo') found.claim.phoneKind = body.phoneKind
    const notes = []
    if (body.product !== undefined) {
      const product = typeof body.product === 'string' ? body.product.trim() : ''
      if (!product || product.length > TEXT_MAX) return fail('Cargá el producto.')
      repair.product = product
    }
    if (body.coverage !== undefined) {
      if (!COVERAGE.has(body.coverage)) return fail('Elegí si es garantía o cobro.')
      repair.coverage = body.coverage
    }
    if (body.diagnosis !== undefined) {
      const diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : ''
      if (diagnosis.length > NOTE_MAX) return fail(`El diagnóstico puede tener hasta ${NOTE_MAX} caracteres.`)
      repair.diagnosis = diagnosis
      if (diagnosis) notes.push('Diagnóstico cargado')
    }
    const quote = { ...(repair.quote ?? {}) }
    let quoteChanged = false
    if (body.amount !== undefined) {
      const amount = readAmount(body.amount)
      if (amount.error) return amount
      quote.amount = amount.value
      quoteChanged = true
    }
    if (body.etaDate !== undefined) {
      const eta = readDay(body.etaDate, 'fecha aproximada', { notPast: true })
      if (eta.error) return eta
      quote.etaDate = eta.value
      quoteChanged = true
    }
    if (quoteChanged) {
      repair.quote = quote
      const amount = typeof quote.amount === 'number' ? `$ ${moneyFormat.format(quote.amount)}` : ''
      const eta = quote.etaDate ? `, entrega aprox. ${formatDay(quote.etaDate)}` : ''
      notes.push(`Presupuesto ${amount}${eta}`.trim())
    }
    const at = new Date().toISOString()
    for (const note of notes) {
      found.claim.events.push({
        at,
        status: found.claim.status,
        note,
        by: actorOf(user),
      })
    }
    await writeClaims(found.list)
    return { claim: found.claim }
  })
}

const GARANTIA_FLOW = ['por-levantar', 'diagnostico', 'en-reparacion', 'listo', 'entregado']
const COBRO_FLOW = [
  'por-levantar',
  'diagnostico',
  'presupuesto-enviado',
  'aceptado',
  'en-reparacion',
  'listo',
  'entregado',
]
const STEP_LABEL = {
  'por-levantar': 'Por levantar',
  diagnostico: 'Diagnóstico',
  'presupuesto-enviado': 'Presupuesto enviado',
  'presupuesto-vencido': 'Presupuesto vencido',
  aceptado: 'Presupuesto aceptado',
  rechazado: 'Presupuesto rechazado',
  'en-reparacion': 'En reparación',
  listo: 'Lista para retirar',
  entregado: 'Entregado',
}

function flowOf(coverage) {
  return coverage === 'garantia' ? GARANTIA_FLOW : COBRO_FLOW
}

function stepRank(coverage, step) {
  if (step === 'presupuesto-vencido') return flowOf(coverage).indexOf('presupuesto-enviado')
  if (step === 'rechazado') return flowOf(coverage).indexOf('aceptado')
  return flowOf(coverage).indexOf(step)
}

function forwardTargets(repair) {
  const step = repair.step
  if (repair.coverage === 'garantia') {
    if (step === 'por-levantar') return ['diagnostico']
    if (step === 'diagnostico') return ['en-reparacion']
    if (step === 'en-reparacion') return ['listo']
    if (step === 'listo') return ['entregado']
    return []
  }
  if (step === 'por-levantar') return ['diagnostico']
  if (step === 'diagnostico') return ['presupuesto-enviado']
  if (step === 'presupuesto-enviado' || step === 'presupuesto-vencido') return ['aceptado', 'rechazado']
  if (step === 'aceptado') return ['en-reparacion']
  if (step === 'en-reparacion') return ['listo']
  if (step === 'listo') return ['entregado']
  return []
}

function isClaimSeller(user, claim) {
  if (user?.role !== 'vendedor') return false
  if (claim.createdBy === user.id) return true
  const seller = normalizeName(user.sellerName)
  return seller.length > 0 && seller === normalizeName(claim.seller)
}

function canRepairStep(user, claim, to, goingBack) {
  if (goingBack) return user.role === 'encargado_deposito' || user.role === 'admin'
  if (to === 'entregado') {
    return ['tecnico', 'deposito', 'vendedor', 'encargado_deposito', 'admin'].includes(user.role)
  }
  if (to === 'aceptado' || to === 'rechazado') {
    if (user.role === 'encargado_deposito' || user.role === 'admin') return true
    if (claim.repair?.technician?.id === user.id) return true
    return isClaimSeller(user, claim)
  }
  if (user.role === 'admin') return true
  return user.role === 'tecnico' && claim.repair?.technician?.id === user.id
}

function statusForRepairStep(step) {
  if (step === 'por-levantar') return 'recepcion'
  if (step === 'entregado') return 'entregado'
  return 'reparacion'
}

const QUOTE_TTL_MS = 48 * 60 * 60 * 1000
const CONTACT_CHANNELS = new Set(['whatsapp', 'llamada'])
const CONTACT_KINDS = new Set(['presupuesto', 'reenvio', 'listo', 'rechazo'])
const CALL_RESULTS = new Set(['atendió', 'no atendió', 'dejó mensaje'])

function canContactRepair(user, claim, kind) {
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role === 'tecnico' && claim.repair?.technician?.id === user.id) return true
  if ((kind === 'rechazo' || kind === 'listo') && (isClaimSeller(user, claim) || user.role === 'deposito')) {
    return true
  }
  return false
}

function contactRepair(user, id, body) {
  return locked(async () => {
    const found = await findClaim(user, id)
    if (found.error) return found
    const repair = found.claim.repair
    if (!repair) return fail('Este reclamo no tiene una reparación.', 409)
    if (!isRecord(body) || !CONTACT_CHANNELS.has(body.channel) || !CONTACT_KINDS.has(body.kind)) {
      return fail('Revisá el aviso al cliente.')
    }
    if (!canContactRepair(user, found.claim, body.kind)) return fail('Solo podés cargar la reparación.', 403)
    if (body.phoneKind === 'movil' || body.phoneKind === 'fijo') found.claim.phoneKind = body.phoneKind
    const result = typeof body.result === 'string' ? body.result.trim() : ''
    if (body.channel === 'llamada' && !CALL_RESULTS.has(result)) return fail('Anotá el resultado de la llamada.')
    if ((body.kind === 'presupuesto' || body.kind === 'reenvio') && repair.coverage !== 'cobro') {
      return fail('La garantía no lleva presupuesto.')
    }
    if (body.kind === 'presupuesto' || body.kind === 'reenvio') {
      if (!repair.diagnosis?.trim() || typeof repair.quote?.amount !== 'number' || !repair.quote?.etaDate) {
        return fail('Cargá el diagnóstico y el presupuesto antes de avisar.')
      }
    }
    const now = new Date().toISOString()
    const quote = { ...(repair.quote ?? {}) }
    let note = ''
    if (body.channel === 'llamada') note = `Llamado: ${result}`
    else if (body.kind === 'presupuesto') note = 'Presupuesto enviado por WhatsApp'
    else if (body.kind === 'reenvio') note = 'Presupuesto reenviado por WhatsApp'
    else if (body.kind === 'listo') note = 'Aviso de listo por WhatsApp'
    else note = 'Aviso de rechazo por WhatsApp'
    if (body.kind === 'presupuesto' && !quote.sentAt) {
      quote.sentAt = now
      quote.expiresAt = new Date(Date.parse(now) + QUOTE_TTL_MS).toISOString()
      repair.quote = quote
      repair.step = 'presupuesto-enviado'
      found.claim.status = 'reparacion'
    }
    if (body.kind === 'reenvio') {
      quote.sentAt = now
      quote.expiresAt = new Date(Date.parse(now) + QUOTE_TTL_MS).toISOString()
      delete quote.expiredNotifiedAt
      repair.quote = quote
      repair.step = 'presupuesto-enviado'
      found.claim.status = 'reparacion'
      const when = baStamp(quote.expiresAt)
      note =
        body.channel === 'llamada'
          ? `Llamado: ${result}. Presupuesto reenviado; vence el ${when}`
          : `Presupuesto reenviado; vence el ${when}`
    }
    repair.contacts = [
      ...(repair.contacts ?? []),
      {
        at: now,
        channel: body.channel,
        kind: body.kind,
        ...(result ? { result } : {}),
        by: { id: user.id, name: user.name },
      },
    ]
    found.claim.events.push({
      at: now,
      status: found.claim.status,
      note,
      by: actorOf(user),
    })
    await writeClaims(found.list)
    return { claim: found.claim }
  })
}

function stepRepair(user, id, body) {
  return locked(async () => {
    const found = await findClaim(user, id)
    if (found.error) return found
    const repair = found.claim.repair
    if (!repair) return fail('Este reclamo no tiene una reparación.', 409)
    if (!isRecord(body) || typeof body.to !== 'string') return fail('Elegí el paso de la reparación.')
    const to = body.to
    if (to === 'presupuesto-vencido') return fail('Ese paso lo marca el vencimiento.', 409)
    if (!STEP_LABEL[to]) return fail('Ese paso no existe.', 400)
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (note.length > NOTE_MAX) return fail(`El motivo puede tener hasta ${NOTE_MAX} caracteres.`)
    const fromRank = stepRank(repair.coverage, repair.step)
    const toRank = stepRank(repair.coverage, to)
    const forward = forwardTargets(repair).includes(to)
    const goingBack = !forward && fromRank >= 0 && toRank >= 0 && toRank < fromRank && flowOf(repair.coverage).includes(to)
    if (!forward && !goingBack) return fail('No se puede pasar a ese paso.', 409)
    if (goingBack && note.length < 5) return fail('El motivo tiene que tener al menos 5 caracteres.')
    if (!canRepairStep(user, found.claim, to, goingBack)) return fail('Solo podés cargar la reparación.', 403)
    if (to === 'presupuesto-enviado' && repair.coverage === 'cobro') {
      if (!repair.diagnosis?.trim()) return fail('Cargá el diagnóstico antes de avisar.')
      if (typeof repair.quote?.amount !== 'number' || !repair.quote.etaDate) {
        return fail('Cargá el presupuesto antes de avisar.')
      }
    }
    const now = new Date().toISOString()
    repair.step = to
    if (to === 'aceptado' || to === 'rechazado') {
      repair.answer = {
        value: to === 'aceptado' ? 'acepta' : 'rechaza',
        at: now,
        by: { id: user.id, name: user.name },
      }
    } else if (goingBack) {
      delete repair.answer
    }
    found.claim.status = statusForRepairStep(to)
    if (to === 'entregado') found.claim.resolvedAt = now
    else if (found.claim.resolvedAt && to !== 'entregado') delete found.claim.resolvedAt
    const label = STEP_LABEL[to]
    found.claim.events.push({
      at: now,
      status: found.claim.status,
      note: note ? `${label}. ${note}` : label,
      by: actorOf(user),
    })
    await writeClaims(found.list)
    const text =
      to === 'rechazado'
        ? `${found.claim.client} rechazó el presupuesto del reclamo ${found.claim.id}`
        : `La reparación del reclamo ${found.claim.id} pasó a ${label}.`
    await notifyClaimOwner(found.claim, user, text)
    await notifyClaimSeller(found.claim, text, user)
    return { claim: found.claim }
  })
}

function baStamp(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}

export async function sweepExpiredQuotes() {
  return locked(async () => {
    const list = await readClaims()
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const due = []
    for (const claim of list) {
      const repair = claim?.repair
      const quote = repair?.quote
      if (!repair || repair.step !== 'presupuesto-enviado' || !quote || quote.expiredNotifiedAt) continue
      const expires = Date.parse(quote.expiresAt ?? '')
      if (!Number.isFinite(expires) || expires > nowMs) continue
      repair.step = 'presupuesto-vencido'
      quote.expiredNotifiedAt = now
      claim.events.push({
        at: now,
        status: claim.status,
        note: 'Presupuesto vencido',
        by: { userId: 'sistema', userName: 'Sistema' },
      })
      due.push({ id: claim.id, client: claim.client, technicianId: repair.technician?.id })
    }
    if (due.length === 0) return 0
    await writeClaims(list)
    for (const claim of due) {
      const text = `Venció el presupuesto del reclamo ${claim.id} (${claim.client}). Reenviar al cliente.`
      if (claim.technicianId) await notifyUser(claim.technicianId, { text, claimId: claim.id })
      await notifyEncargados({ text, claimId: claim.id, whatsapp: false })
    }
    return due.length
  })
}

async function findClaim(user, id) {
  if (typeof id !== 'string' || !id.trim()) return fail('Reclamo no encontrado', 404)
  const list = await readClaims()
  const claim = list.find((item) => item.id === id)
  if (!claim || !canAccessClaim(user, claim)) return fail('Reclamo no encontrado', 404)
  return { list, claim }
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
