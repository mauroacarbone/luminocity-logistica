import { writePdf, type PdfBlock } from './exportPdf'
import { reportCharts } from './reportCharts'
import { cellText, type ReportModel } from './reportModel'
import type { ReportFileMeta } from './reportXlsx'

export async function downloadReportPdf(model: ReportModel, meta: ReportFileMeta) {
  const blocks: PdfBlock[] = [
    { type: 'kpis', items: model.kpis.map((kpi) => ({ title: kpi.title, value: kpi.detail ? `${kpi.value} · ${kpi.detail}` : kpi.value })) },
    ...reportCharts(model).map((chart) => ({ type: 'chart' as const, chart })),
    ...model.sections.map((section) => {
      const rows = section.rows.map((row) => section.columns.map((column) => cellText(column, row)))
      const total =
        section.total.mode === 'caption'
          ? [[section.total.text, ...section.columns.slice(1).map(() => '')]]
          : section.total.lines.map((line) => line.cells.map((cell) => cell.text))
      return {
        type: 'table' as const,
        title: section.title,
        columns: section.columns.map((column) => ({ header: column.header, align: column.align, kind: column.kind })),
        rows,
        pending: section.rows.map((row) => Boolean(row.pending)),
        total,
      }
    }),
  ]
  await writePdf({
    fileName: `reporte-luminocity-${model.period.from}_${model.period.to}.pdf`,
    meta,
    blocks,
  })
}
