import * as XLSX from 'xlsx'

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

function quantityOf(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  const parsed = Number(String(value ?? '').replace(',', '.').trim())
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return 1
}

/** Parser simple usado hasta la vista previa del 22b. */
export function parsePickingWorkbook(data: ArrayBuffer) {
  const book = XLSX.read(data, { type: 'array', cellDates: true })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error('El archivo no tiene una hoja.')

  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })
  const headerRow = rows.find((row) => row.some((cell) => String(cell).trim()))
  if (!headerRow) throw new Error('El archivo está vacío.')

  const headerIndex = rows.indexOf(headerRow)
  const columns = headerRow.map((cell) => FIELD_BY_HEADER[normalizeHeader(String(cell))])
  if (!columns.includes('invoice') || !columns.includes('client') || !columns.includes('product')) {
    throw new Error('El Excel necesita las columnas Factura, Cliente y Producto.')
  }

  const lines: PickingLine[] = []
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const valueOf = (field: (typeof columns)[number]) => {
      const column = columns.indexOf(field)
      return column === -1 ? '' : row[column]
    }
    const invoice = String(valueOf('invoice') ?? '').trim()
    const client = String(valueOf('client') ?? '').trim()
    const product = String(valueOf('product') ?? '').trim()
    if (!invoice || !client || !product) return
    lines.push({
      id: `${invoice}::${product}::${index}`,
      invoice,
      client,
      seller: String(valueOf('seller') ?? '').trim(),
      product,
      quantity: quantityOf(valueOf('quantity')),
      ready: false,
      date: formatDate(valueOf('date')),
    })
  })

  if (lines.length === 0) throw new Error('El archivo no tiene productos para cargar.')
  return lines
}
