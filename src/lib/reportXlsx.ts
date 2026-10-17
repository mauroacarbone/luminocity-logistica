import type { ReportModel } from './reportModel'

export type ReportFileMeta = {
  title: string
  filters: string[]
  generatedAt: string
  user: string
}

export async function downloadReportXlsx(model: ReportModel, meta: ReportFileMeta) {
  void model
  void meta
  throw new Error('No se pudo generar el Excel.')
}
