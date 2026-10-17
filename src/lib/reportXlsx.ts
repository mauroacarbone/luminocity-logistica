import { writeXlsx, type XlsxMeta, type XlsxSheet } from './exportXlsx'
import type { ReportModel } from './reportModel'

export type ReportFileMeta = XlsxMeta

export async function downloadReportXlsx(model: ReportModel, meta: ReportFileMeta) {
  const summary: XlsxSheet = {
    name: 'Resumen',
    preamble: [meta.title, ...meta.filters, `Generado el ${meta.generatedAt}`, meta.user],
    columns: [
      { key: 'name', header: 'Indicador', kind: 'text' },
      { key: 'value', header: 'Valor', kind: 'text' },
    ],
    rows: model.kpis.map((kpi) => ({
      cells: {
        name: kpi.title,
        value: kpi.detail ? `${kpi.value} · ${kpi.detail}` : kpi.value,
      },
    })),
  }
  const sheets: XlsxSheet[] = [
    summary,
    ...model.sections.map((section) => ({
      name: section.sheet,
      columns: section.columns.map((column) => ({ key: column.key, header: column.header, kind: column.kind })),
      rows: section.rows.map((row) => ({ pending: row.pending, cells: row.values, text: row.text })),
      total: section.total,
    })),
  ]
  await writeXlsx({
    fileName: `reporte-luminocity-${model.period.from}_${model.period.to}.xlsx`,
    meta,
    sheets,
  })
}
