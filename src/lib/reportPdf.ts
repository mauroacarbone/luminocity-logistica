import type { ReportFileMeta } from './reportXlsx'
import type { ReportModel } from './reportModel'

export async function downloadReportPdf(model: ReportModel, meta: ReportFileMeta) {
  void model
  void meta
  throw new Error('No se pudo generar el PDF.')
}
