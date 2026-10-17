import type { ColumnKind } from './reportModel'

type Rgb = readonly [number, number, number]

export type PdfTable = {
  type: 'table'
  title: string
  columns: { header: string; align: 'left' | 'right'; kind: ColumnKind }[]
  rows: string[][]
  pending: boolean[]
  total: string[][]
}

export type PdfBlock = { type: 'kpis'; items: { title: string; value: string }[] } | PdfTable

export type PdfMeta = {
  title: string
  filters: string[]
  generatedAt: string
  user: string
}

const INK: Rgb = [31, 35, 40]
const MUTED: Rgb = [90, 98, 108]
const LINE: Rgb = [208, 215, 222]
const PAPER: Rgb = [255, 255, 255]
const HEAD: Rgb = [242, 244, 247]

type Doc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
  setPage: (page: number) => void
  addPage: () => void
  getNumberOfPages: () => number
  setFont: (font: string, style: string) => void
  setFontSize: (size: number) => void
  setTextColor: (...color: number[]) => void
  setFillColor: (...color: number[]) => void
  setDrawColor: (...color: number[]) => void
  text: (text: string, x: number, y: number, options?: { align?: 'left' | 'right' | 'center' }) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void
  save: (name: string) => void
}

const MARGIN = 12

function rgb(doc: Doc, color: Rgb, mode: 'fill' | 'draw' | 'text') {
  if (mode === 'fill') doc.setFillColor(color[0], color[1], color[2])
  else if (mode === 'draw') doc.setDrawColor(color[0], color[1], color[2])
  else doc.setTextColor(color[0], color[1], color[2])
}

function clip(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

function drawHeader(doc: Doc, meta: PdfMeta) {
  const width = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  rgb(doc, INK, 'text')
  doc.text(meta.title, MARGIN, 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  rgb(doc, MUTED, 'text')
  const detail = `${meta.filters.join(' · ')} · Generado el ${meta.generatedAt} por ${meta.user}`
  doc.text(clip(detail, 140), MARGIN, 13)
  rgb(doc, LINE, 'draw')
  doc.line(MARGIN, 16, width - MARGIN, 16)
}

function ensure(doc: Doc, y: number, height: number) {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + height <= pageHeight - 12) return y
  doc.addPage()
  return 22
}

function drawKpis(doc: Doc, items: { title: string; value: string }[], y: number) {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const gap = 3
  const boxW = (width - gap * 2) / 3
  const boxH = 16
  let cursor = y
  items.forEach((item, index) => {
    const col = index % 3
    if (col === 0) cursor = ensure(doc, cursor, boxH + 3)
    const x = MARGIN + col * (boxW + gap)
    rgb(doc, HEAD, 'fill')
    rgb(doc, LINE, 'draw')
    doc.roundedRect(x, cursor, boxW, boxH, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    rgb(doc, MUTED, 'text')
    doc.text(item.title, x + 2, cursor + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    rgb(doc, INK, 'text')
    doc.text(clip(item.value, 28), x + 2, cursor + 12)
    if (col === 2) cursor += boxH + gap
  })
  if (items.length % 3 !== 0) cursor += boxH + gap
  return cursor + 2
}

export async function writePdf({ fileName, meta, blocks }: { fileName: string; meta: PdfMeta; blocks: PdfBlock[] }) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as unknown as Doc
  let y = 22
  for (const block of blocks) {
    if (block.type === 'kpis') {
      y = drawKpis(doc, block.items, y)
      continue
    }
    y = ensure(doc, y, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    rgb(doc, INK, 'text')
    doc.text(block.title, MARGIN, y)
    const body = [...block.rows, ...block.total]
    autoTable(doc as unknown as never, {
      startY: y + 2,
      margin: { top: 20, left: MARGIN, right: MARGIN, bottom: 12 },
      head: [block.columns.map((column) => column.header)],
      body,
      styles: { font: 'helvetica', fontSize: 8, textColor: [...INK], cellPadding: 1.4, fillColor: [...PAPER] },
      headStyles: { fillColor: [...HEAD], textColor: [...INK], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(
        block.columns.map((column, index) => [index, { halign: column.align === 'right' ? 'right' : 'left' }]),
      ),
      didParseCell: (data: { section: string; row: { index: number }; cell: { styles: { fontStyle: string } } }) => {
        if (data.section !== 'body') return
        if (block.pending[data.row.index]) data.cell.styles.fontStyle = 'italic'
        if (data.row.index >= block.rows.length) data.cell.styles.fontStyle = 'bold'
      },
    })
    const finalY = (doc as Doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    y = (finalY ?? y) + 8
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    drawHeader(doc, meta)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    rgb(doc, MUTED, 'text')
    doc.text(`Página ${page} de ${pages}`, doc.internal.pageSize.getWidth() - MARGIN, doc.internal.pageSize.getHeight() - 6, {
      align: 'right',
    })
  }
  doc.save(fileName)
}
