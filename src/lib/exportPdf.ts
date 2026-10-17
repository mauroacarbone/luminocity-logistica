import type { ColumnKind } from './reportModel'
import type { ChartSpec, Rgb } from './reportCharts'

export type PdfTable = {
  type: 'table'
  title: string
  columns: { header: string; align: 'left' | 'right'; kind: ColumnKind }[]
  rows: string[][]
  pending: boolean[]
  total: string[][]
}

export type PdfBlock =
  | { type: 'kpis'; items: { title: string; value: string }[] }
  | PdfTable
  | { type: 'chart'; chart: ChartSpec }

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
  rect: (x: number, y: number, w: number, h: number, style?: string) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void
  save: (name: string) => void
  getTextWidth: (text: string) => number
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

function maxOf(values: number[]) {
  return Math.max(1, ...values, 0)
}

function hatch(doc: Doc, x: number, y: number, w: number, h: number) {
  if (w < 1 || h < 1) return
  rgb(doc, PAPER, 'draw')
  for (let offset = 1.6; offset < w + h; offset += 1.6) {
    const x1 = x + Math.max(0, offset - h)
    const y1 = y + Math.max(0, h - offset)
    const x2 = x + Math.min(w, offset)
    const y2 = y + Math.min(h, w - (x2 - x) + (y1 - y))
    if (x2 - x1 < 0.4) continue
    doc.line(x1, y1, x2, Math.min(y + h, Math.max(y, y2)))
  }
}

function drawLegend(doc: Doc, chart: ChartSpec, x: number, y: number) {
  let cursor = x
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  for (const series of chart.series) {
    rgb(doc, series.color, 'fill')
    doc.rect(cursor, y - 2, 3, 3, 'F')
    if (series.hatch) hatch(doc, cursor, y - 2, 3, 3)
    rgb(doc, INK, 'text')
    doc.text(series.name, cursor + 4, y)
    cursor += doc.getTextWidth(series.name) + 10
  }
  return y + 4
}

function drawLine(doc: Doc, chart: ChartSpec, y: number) {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const height = 36
  y = ensure(doc, y, height + 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  rgb(doc, INK, 'text')
  doc.text(chart.title, MARGIN, y)
  y = drawLegend(doc, chart, MARGIN, y + 5)
  const left = MARGIN + 8
  const plotW = width - 10
  const base = y + height
  rgb(doc, LINE, 'draw')
  doc.line(left, base, left + plotW, base)
  const peak = maxOf(chart.series.flatMap((series) => series.values))
  for (const series of chart.series) {
    rgb(doc, series.color, 'draw')
    const step = plotW / Math.max(1, series.values.length - 1)
    series.values.forEach((value, index) => {
      if (index === 0) return
      const x1 = left + (index - 1) * step
      const x2 = left + index * step
      const y1 = base - (series.values[index - 1] / peak) * (height - 4)
      const y2 = base - (value / peak) * (height - 4)
      doc.line(x1, y1, x2, y2)
    })
  }
  return base + 6
}

function drawStacked(doc: Doc, chart: ChartSpec, y: number) {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  y = ensure(doc, y, 48)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  rgb(doc, INK, 'text')
  doc.text(chart.title, MARGIN, y)
  y = drawLegend(doc, chart, MARGIN, y + 5)
  const count = Math.max(1, chart.labels.length)
  const gap = 1.2
  const barW = Math.max(2, Math.min(8, (width - 36) / count - gap))
  const height = 28
  const base = y + height
  chart.labels.forEach((_, index) => {
    const total = chart.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0) || 1
    let cursor = base
    const x = MARGIN + index * (barW + gap)
    for (const series of chart.series) {
      const part = ((series.values[index] ?? 0) / total) * height
      cursor -= part
      rgb(doc, series.color, 'fill')
      if (part > 0) doc.rect(x, cursor, barW, part, 'F')
      if (series.hatch && part > 0) hatch(doc, x, cursor, barW, part)
    }
  })
  const sums = chart.series.map((series) => series.values.reduce((sum, value) => sum + value, 0))
  const all = sums.reduce((sum, value) => sum + value, 0) || 1
  const shareX = MARGIN + count * (barW + gap) + 6
  const shareW = 10
  let shareY = base
  chart.series.forEach((series, index) => {
    const part = (sums[index] / all) * height
    shareY -= part
    rgb(doc, series.color, 'fill')
    if (part > 0) doc.rect(shareX, shareY, shareW, part, 'F')
    if (series.hatch && part > 0) hatch(doc, shareX, shareY, shareW, part)
  })
  doc.setFontSize(7)
  rgb(doc, MUTED, 'text')
  doc.text('Período', shareX, base + 4)
  return base + 8
}

function drawBars(doc: Doc, chart: ChartSpec, y: number, horizontal: boolean) {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const rowH = horizontal ? 6 : 0
  const height = horizontal ? chart.labels.length * rowH + 8 : 36
  y = ensure(doc, y, height + 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  rgb(doc, INK, 'text')
  doc.text(chart.title, MARGIN, y)
  y += 5
  const series = chart.series[0]
  if (!series) return y
  const peak = maxOf(series.values)
  if (!horizontal) {
    const count = Math.max(1, chart.labels.length)
    const barW = Math.max(2, Math.min(8, width / count - 1.2))
    const base = y + 28
    series.values.forEach((value, index) => {
      const barH = (value / peak) * 26
      const x = MARGIN + index * (barW + 1.2)
      rgb(doc, series.color, 'fill')
      doc.rect(x, base - barH, barW, barH, 'F')
    })
    return base + 6
  }
  series.values.forEach((value, index) => {
    const label = clip(chart.labels[index] ?? '', 22)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    rgb(doc, INK, 'text')
    doc.text(label, MARGIN, y + 3)
    const barX = MARGIN + 38
    const barW = (value / peak) * (width - 78)
    rgb(doc, series.color, 'fill')
    doc.rect(barX, y, Math.max(0.5, barW), 3.5, 'F')
    rgb(doc, MUTED, 'text')
    const note = chart.notes?.[index] ? ` ${chart.notes[index]}` : ''
    doc.text(`${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}${note}`, barX + barW + 1.5, y + 3)
    y += rowH
  })
  return y + 2
}

function drawDrivers(doc: Doc, chart: ChartSpec, y: number) {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const height = chart.labels.length * 6 + 12
  y = ensure(doc, y, height)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  rgb(doc, INK, 'text')
  doc.text(chart.title, MARGIN, y)
  y = drawLegend(doc, chart, MARGIN, y + 5)
  const trips = chart.series[0]
  const km = chart.series[1]
  const tripPeak = maxOf(trips?.values ?? [])
  const kmPeak = maxOf(km?.values ?? [])
  chart.labels.forEach((label, index) => {
    doc.setFontSize(7)
    rgb(doc, INK, 'text')
    doc.text(clip(label, 18), MARGIN, y + 3)
    const tripW = ((trips?.values[index] ?? 0) / tripPeak) * 40
    const kmW = ((km?.values[index] ?? 0) / kmPeak) * 40
    if (trips) {
      rgb(doc, trips.color, 'fill')
      doc.rect(MARGIN + 36, y, Math.max(0.4, tripW), 3, 'F')
    }
    if (km) {
      rgb(doc, km.color, 'fill')
      doc.rect(MARGIN + 80, y, Math.max(0.4, kmW), 3, 'F')
    }
    rgb(doc, MUTED, 'text')
    doc.text(clip(chart.notes?.[index] ?? '', 36), Math.min(MARGIN + 124, MARGIN + width - 40), y + 3)
    y += 6
  })
  return y + 2
}

function drawChart(doc: Doc, chart: ChartSpec, y: number) {
  if (chart.kind === 'line') return drawLine(doc, chart, y)
  if (chart.kind === 'stacked') return drawStacked(doc, chart, y)
  if (chart.kind === 'drivers') return drawDrivers(doc, chart, y)
  return drawBars(doc, chart, y, chart.kind === 'hbar')
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
    if (block.type === 'chart') {
      y = drawChart(doc, block.chart, y)
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
