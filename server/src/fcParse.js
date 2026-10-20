import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CANTIDAD_MAX, ITEM_CODE_MAX, ITEM_DESCRIPTION_MAX } from './picking.js'
import { PDF_DATA_PREFIX, PDF_MAX_BYTES, pdfByteLength } from './pdfAttachment.js'

const PARSE_TIMEOUT_MS = 10_000
const Y_TOLERANCE = 3
const ITEM_LIMIT = 100
const INVALID_PDF = 'El adjunto tiene que ser un PDF.'
const TOO_BIG = 'El archivo supera los 2 MB.'
const NO_TEXT = 'La FC no tiene texto para leer (parece escaneada). Cargá los artículos a mano.'
const UNRECOGNIZED = 'No reconocimos el formato de la FC. Tiene que ser una factura de Cianbox.'
const TOO_MANY = 'La FC tiene más de 100 artículos.'

const FACTURA_RE = /Factura\s+N[º°o]?\s*(\d{4}-\d{8})/
const HEADER_RE = /IT\s+Cant\.?\s+Detalle/i
const GRAVADO_RE = /^GRAVADO\b/i
const FOOTER_RE =
  /^(ORIGINAL|DUPLICADO|TRIPLICADO)\b|pag\.\s*\d+\s*\/\s*\d+|Emitido con|Powered by|^Observaciones\b|^Transporte\b/i
const ITEM_RE = /^(\d{1,3})\s+(\d+(?:,\d+)?)\s+\[([^\]]+)\]\s*\((\d+)\)\s*-\s*(.+?)\s+-?[\d.]+,\d{2}\s/
const PRICE_RE = /[\d.]*,\d{2}/
const CUIT_RE = /C\.U\.I\.T\./i
const PAYMENT_RE = /forma de pago/i

export async function parseFcPdf(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PDF_DATA_PREFIX)) {
    return { ok: false, reason: INVALID_PDF }
  }
  const bytes = pdfByteLength(dataUrl)
  if (bytes == null) return { ok: false, reason: INVALID_PDF }
  if (bytes > PDF_MAX_BYTES) return { ok: false, reason: TOO_BIG }
  const payload = dataUrl.slice(PDF_DATA_PREFIX.length).replace(/\s/g, '')
  const data = new Uint8Array(Buffer.from(payload, 'base64'))
  return readDocument(data)
}

async function readDocument(data) {
  const task = getDocument({ data, isEvalSupported: false, verbosity: 0 })
  let pdf = null
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), PARSE_TIMEOUT_MS)
  })
  const reading = (async () => {
    pdf = await task.promise
    const pages = []
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      pages.push(linesFromItems(content.items))
    }
    return interpret(pages)
  })()
  reading.catch(() => {})
  try {
    return await Promise.race([reading, timeout])
  } catch (error) {
    if (error?.code === 'timeout') console.error('La lectura de la FC superó los 10 s')
    else if (error?.name !== 'InvalidPDFException' && error?.name !== 'PasswordException') {
      console.error('No se pudo leer la FC', error)
    }
    return { ok: false, reason: INVALID_PDF }
  } finally {
    clearTimeout(timer)
    await task.destroy().catch(() => {})
    if (pdf) await pdf.destroy().catch(() => {})
  }
}

function linesFromItems(items) {
  const pieces = []
  for (const item of items ?? []) {
    if (!item || typeof item.str !== 'string') continue
    const str = item.str.trim()
    if (!str) continue
    const transform = Array.isArray(item.transform) ? item.transform : null
    const x = transform ? Number(transform[4]) : 0
    const y = transform ? Number(transform[5]) : 0
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pieces.push({ str, x, y })
  }
  pieces.sort((a, b) => b.y - a.y || a.x - b.x)
  const groups = []
  for (const piece of pieces) {
    let nearest = null
    let distance = Y_TOLERANCE + 1
    for (const group of groups) {
      const gap = Math.abs(group.y - piece.y)
      if (gap <= Y_TOLERANCE && gap < distance) {
        nearest = group
        distance = gap
      }
    }
    if (nearest) nearest.parts.push(piece)
    else groups.push({ y: piece.y, parts: [piece] })
  }
  return groups
    .map((group) => {
      const parts = [...group.parts].sort((a, b) => a.x - b.x)
      return parts
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .filter(Boolean)
}

function interpret(pages) {
  const lines = pages.flat()
  if (lines.length === 0) return { ok: false, reason: NO_TEXT }
  const factura = readFactura(lines)
  const cliente = readCliente(lines)
  const warnings = []
  const parsed = []
  let sawTable = false
  for (const page of pages) {
    let inTable = false
    let current = null
    const flush = () => {
      if (!current) return
      current.description = current.description.slice(0, ITEM_DESCRIPTION_MAX)
      parsed.push(current)
      current = null
    }
    for (const line of page) {
      if (HEADER_RE.test(line)) {
        flush()
        inTable = true
        sawTable = true
        continue
      }
      if (inTable && (GRAVADO_RE.test(line) || FOOTER_RE.test(line))) {
        flush()
        inTable = false
        continue
      }
      if (!inTable) continue
      const match = `${line} `.match(ITEM_RE)
      if (match) {
        flush()
        current = readMatch(match, warnings)
        continue
      }
      if (PRICE_RE.test(line) || !current || /^\d+$/.test(line)) continue
      current.description = `${current.description} ${line}`.replace(/\s+/g, ' ').trim()
    }
    flush()
  }
  if (!sawTable) return { ok: false, reason: UNRECOGNIZED }
  const items = mergeItems(parsed, warnings)
  if (items.length === 0 && warnings.length === 0) return { ok: false, reason: UNRECOGNIZED }
  if (items.length > ITEM_LIMIT) return { ok: false, reason: TOO_MANY }
  return { ok: true, factura, cliente, items, warnings }
}

function readFactura(lines) {
  for (const line of lines) {
    const match = line.match(FACTURA_RE)
    if (match) return match[1]
  }
  return null
}

function readCliente(lines) {
  const indexes = []
  lines.forEach((line, index) => {
    if (CUIT_RE.test(line)) indexes.push(index)
  })
  if (indexes.length < 2) return null
  const block = lines.slice(indexes[0] + 1, indexes[1])
  const payment = block.find((line) => PAYMENT_RE.test(line))
  if (payment) {
    const name = payment.split(PAYMENT_RE)[0].replace(/\s+/g, ' ').trim()
    return name || null
  }
  for (const line of block) {
    if (FACTURA_RE.test(line) || isAddress(line)) continue
    const name = line.replace(/\s+/g, ' ').trim()
    if (name) return name
  }
  return null
}

function isAddress(line) {
  return /\d/.test(line) && /\s-\s/.test(line)
}

function readMatch(match, warnings) {
  const it = Number(match[1])
  const quantity = readQuantity(match[2])
  if (quantity?.decimal) {
    warnings.push(`Renglón ${it}: cantidad con decimales, cargala a mano`)
    return null
  }
  if (!quantity || quantity.quantity < 1 || quantity.quantity > CANTIDAD_MAX) {
    warnings.push(`Renglón ${it}: cantidad inválida, cargala a mano`)
    return null
  }
  const code = match[3].trim().slice(0, ITEM_CODE_MAX)
  if (!code) return null
  return {
    it,
    code,
    internalCode: match[4].slice(0, 20),
    description: match[5].replace(/\s+/g, ' ').trim().slice(0, ITEM_DESCRIPTION_MAX),
    quantity: quantity.quantity,
  }
}

function readQuantity(raw) {
  const [whole, fraction = ''] = raw.split(',')
  if (fraction && !/^0+$/.test(fraction)) return { decimal: true }
  const quantity = Number(whole)
  if (!Number.isSafeInteger(quantity)) return null
  return { quantity }
}

function mergeItems(parsed, warnings) {
  const items = []
  const byCode = new Map()
  for (const item of parsed) {
    if (!item) continue
    const current = byCode.get(item.code)
    if (!current) {
      const next = { ...item }
      byCode.set(item.code, next)
      items.push(next)
      continue
    }
    current.quantity += item.quantity
  }
  return items.filter((item) => {
    if (item.quantity <= CANTIDAD_MAX) return true
    warnings.push(`Renglón ${item.it}: cantidad inválida, cargala a mano`)
    return false
  })
}
