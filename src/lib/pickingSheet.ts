import * as XLSX from 'xlsx'
import { buildCsv } from './csv'
import type { PickingBatchRow } from './pickingApi'

export type PickingLine = {
  id: string
  invoice: string
  client: string
  seller: string
  product: string
  quantity: number
  ready: boolean
  date?: string
  status?: 'pendiente' | 'en_preparacion' | 'preparado'
  raw?: Record<string, string | number | boolean>
}

export type PickingPreviewRow = {
  excelRows: number[]
  cliente: string
  comprobante: string
  articulo: string
  cantidad: number
  vendedor: string
  raw: Record<string, string | number | boolean>
  combinedFrom: number
}

export type PickingDiscardedRow = {
  excelRow: number
  message: string
}

export type PickingPreview = {
  valid: PickingPreviewRow[]
  discarded: PickingDiscardedRow[]
}

const FIELD_BY_HEADER: Record<string, 'invoice' | 'client' | 'seller' | 'product' | 'quantity' | 'date'> = {
  factura: 'invoice',
  comprobante: 'invoice',
  documento: 'invoice',
  cliente: 'client',
  nombre: 'client',
  vendedor: 'seller',
  disenador: 'seller',
  producto: 'product',
  descripcion: 'product',
  articulo: 'product',
  cantidad: 'quantity',
  cant: 'quantity',
  fecha: 'date',
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0')
    const month = String(value.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${value.getFullYear()}`
  }
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return undefined
}

function cellText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value) ?? ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value ?? '').trim()
}

function parseQuantity(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: 1 }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return { ok: false, message: 'Cantidad inválida' }
    return { ok: true, value }
  }
  const parsed = Number(String(value).replace(',', '.').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return { ok: false, message: 'Cantidad inválida' }
  return { ok: true, value: parsed }
}

export function mergeKey(comprobante: string, articulo: string) {
  return `${comprobante.trim().toLocaleLowerCase('es')}\0${articulo.trim().toLocaleLowerCase('es')}`
}

function rawValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value) ?? ''
  return cellText(value)
}

/** Vista previa: válidas, descartadas y repetidas combinadas. */
export function previewPickingWorkbook(data: ArrayBuffer): PickingPreview {
  const book = XLSX.read(data, { type: 'array', cellDates: true })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error('El archivo no tiene una hoja.')

  const rows = XLSX.utils.sheet_to_json<(string | number | Date | boolean | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })
  const headerRow = rows.find((row) => row.some((cell) => String(cell).trim()))
  if (!headerRow) throw new Error('El archivo está vacío.')

  const headerIndex = rows.indexOf(headerRow)
  const headers = headerRow.map((cell) => String(cell ?? '').trim())
  const columns = headers.map((header) => FIELD_BY_HEADER[normalizeHeader(header)])
  if (!columns.includes('invoice') || !columns.includes('client') || !columns.includes('product')) {
    throw new Error('El Excel necesita las columnas Factura, Cliente y Producto.')
  }

  const discarded: PickingDiscardedRow[] = []
  const byKey = new Map<string, PickingPreviewRow>()

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const excelRow = headerIndex + 2 + offset
    const empty = row.every((cell) => cellText(cell) === '')
    if (empty) return

    const valueOf = (field: (typeof columns)[number]) => {
      const column = columns.indexOf(field)
      return column === -1 ? '' : row[column]
    }

    const comprobante = cellText(valueOf('invoice'))
    const cliente = cellText(valueOf('client'))
    const articulo = cellText(valueOf('product'))
    const vendedor = cellText(valueOf('seller'))
    const quantity = parseQuantity(valueOf('quantity'))

    if (!comprobante) {
      discarded.push({ excelRow, message: 'Falta comprobante' })
      return
    }
    if (!cliente) {
      discarded.push({ excelRow, message: 'Falta cliente' })
      return
    }
    if (!articulo) {
      discarded.push({ excelRow, message: 'Falta artículo' })
      return
    }
    if (!quantity.ok) {
      discarded.push({ excelRow, message: quantity.message })
      return
    }

    const raw: Record<string, string | number | boolean> = {}
    headers.forEach((header, column) => {
      const key = header.trim() || `Columna ${column + 1}`
      if (Object.prototype.hasOwnProperty.call(raw, key)) return
      raw[key] = rawValue(row[column])
    })

    const key = mergeKey(comprobante, articulo)
    const existing = byKey.get(key)
    if (existing) {
      existing.cantidad += quantity.value
      existing.excelRows.push(excelRow)
      existing.combinedFrom += 1
      if (!existing.vendedor && vendedor) existing.vendedor = vendedor
      if (!existing.cliente && cliente) existing.cliente = cliente
      existing.raw = raw
      return
    }
    byKey.set(key, {
      excelRows: [excelRow],
      cliente,
      comprobante,
      articulo,
      cantidad: quantity.value,
      vendedor,
      raw,
      combinedFrom: 1,
    })
  })

  const valid = [...byKey.values()]
  if (valid.length === 0 && discarded.length === 0) {
    throw new Error('El archivo no tiene productos para cargar.')
  }
  return { valid, discarded }
}

export function batchRowsFromPreview(valid: PickingPreviewRow[]): PickingBatchRow[] {
  return valid.map((row) => ({
    cliente: row.cliente,
    comprobante: row.comprobante,
    articulo: row.articulo,
    cantidad: row.cantidad,
    vendedor: row.vendedor,
    raw: row.raw,
  }))
}

export function pickingTemplateCsv() {
  return buildCsv([
    ['Factura', 'Cliente', 'Vendedor', 'Producto', 'Cantidad', 'Fecha'],
    ['F-0001', 'Cliente ejemplo', 'Ana', 'Lámpara mesa', '1', '07/10/2026'],
  ])
}
