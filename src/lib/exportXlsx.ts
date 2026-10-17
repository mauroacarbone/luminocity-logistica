import { guardCsvFormula } from './csv'
import type { ColumnKind, RawValue, SectionTotal } from './reportModel'

export type XlsxColumn = {
  key: string
  header: string
  kind: ColumnKind
}

export type XlsxRow = {
  pending?: boolean
  cells: Record<string, RawValue>
  text?: Record<string, string>
}

export type XlsxSheet = {
  name: string
  columns: XlsxColumn[]
  rows: XlsxRow[]
  total?: SectionTotal
  preamble?: string[]
}

export type XlsxMeta = {
  title: string
  filters: string[]
  generatedAt: string
  user: string
}

const NUM_FMT: Partial<Record<ColumnKind, string>> = {
  count: '0',
  money: '"$" #,##0.00',
  km: '0.0',
  pct: '0.0%',
  date: 'dd/mm/yyyy',
}

function sheetName(name: string) {
  const clean = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Hoja'
  return clean.slice(0, 31)
}

function asDate(value: RawValue) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function textOf(value: RawValue) {
  if (value == null) return ''
  return guardCsvFormula(String(value))
}

type ExcelCell = {
  value: string | number | Date | null
  font?: { bold?: boolean; italic?: boolean }
  numFmt?: string
  fill?: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }
}

function numeric(kind: ColumnKind, value: number): ExcelCell {
  if (kind === 'pct') return { value: value / 100, numFmt: NUM_FMT.pct }
  return { value, numFmt: NUM_FMT[kind] }
}

function dataCell(column: XlsxColumn, row: XlsxRow): ExcelCell {
  const raw = column.key in row.cells ? row.cells[column.key] : null
  const custom = row.text?.[column.key]
  const italic = row.pending ? { italic: true } : undefined
  if (column.kind === 'date') {
    const date = asDate(raw)
    if (date) return { value: date, numFmt: NUM_FMT.date, font: italic }
    return { value: textOf(custom ?? raw), font: italic }
  }
  if (column.kind === 'text') return { value: textOf(custom ?? raw), font: italic }
  if (typeof raw === 'number' && (column.kind === 'km' || !custom)) {
    return { ...numeric(column.kind, raw), font: italic }
  }
  if (custom) return { value: guardCsvFormula(custom), font: italic }
  if (raw == null) return { value: '', font: italic }
  return { value: textOf(raw), font: italic }
}

function totalCell(column: XlsxColumn | undefined, value: RawValue, text: string, italic: boolean): ExcelCell {
  const font = { bold: true, italic }
  if (column && typeof value === 'number' && !/estimad|sin monto/i.test(text)) {
    return { ...numeric(column.kind, value), font }
  }
  return { value: guardCsvFormula(text), font }
}

function paint(cell: { value: unknown; font?: unknown; numFmt?: string; fill?: unknown }, source: ExcelCell) {
  cell.value = source.value
  if (source.font) cell.font = source.font
  if (source.numFmt) cell.numFmt = source.numFmt
  if (source.fill) cell.fill = source.fill
}

export async function writeXlsx({ fileName, meta, sheets }: { fileName: string; meta: XlsxMeta; sheets: XlsxSheet[] }) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = meta.user
  const headerFill: ExcelCell['fill'] = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } }

  for (const source of sheets) {
    const sheet = workbook.addWorksheet(sheetName(source.name))
    const widths = source.columns.map((column) => Math.max(12, column.header.length + 2))
    const bump = (index: number, value: unknown) => {
      const length = value instanceof Date ? 12 : String(value ?? '').length
      widths[index] = Math.min(42, Math.max(widths[index] ?? 12, length + 2))
    }
    for (const line of source.preamble ?? []) {
      const row = sheet.addRow([line])
      row.getCell(1).value = guardCsvFormula(line)
      bump(0, line)
    }
    if ((source.preamble?.length ?? 0) > 0) sheet.addRow([])
    const header = sheet.addRow(source.columns.map((column) => column.header))
    const headerRow = header.number
    header.eachCell((cell, index) => {
      paint(cell, { value: source.columns[index - 1]?.header ?? '', font: { bold: true }, fill: headerFill })
    })
    for (const item of source.rows) {
      const row = sheet.addRow(source.columns.map(() => ''))
      source.columns.forEach((column, index) => {
        const written = dataCell(column, item)
        paint(row.getCell(index + 1), written)
        bump(index, written.value)
      })
    }
    if (source.total?.mode === 'rows') {
      for (const line of source.total.lines) {
        const row = sheet.addRow(source.columns.map(() => ''))
        const italic = line.label === 'Pendientes'
        line.cells.forEach((cell, index) => {
          const written = totalCell(source.columns[index], cell.value, cell.text, italic)
          paint(row.getCell(index + 1), written)
          bump(index, written.value)
        })
      }
    } else if (source.total?.mode === 'caption') {
      const row = sheet.addRow([source.total.text])
      paint(row.getCell(1), { value: guardCsvFormula(source.total.text), font: { bold: true } })
    }
    sheet.views = [{ state: 'frozen', ySplit: headerRow }]
    if (source.columns.length > 0) {
      sheet.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: sheet.rowCount, column: source.columns.length },
      }
    }
    sheet.columns = widths.map((width) => ({ width }))
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
