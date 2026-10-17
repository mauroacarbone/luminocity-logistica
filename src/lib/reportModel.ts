import { CLAIM_STATUS_LABEL, type ClaimStatus } from '../data/claims'
import { STATUS_PILL, type OrderStatus } from '../data/orders'
import { formatPrepMs } from './preparation'
import { isOrderPriority, PRIORITY_LABEL } from './priority'
import type {
  ClaimsReport,
  DayReport,
  DeliveriesReport,
  DriverReport,
  DriversReport,
  GroupReport,
  LateOrder,
  OpenClaimRow,
  OverduePickup,
  PickupDay,
  PickupsReport,
  PreparationReport,
  SlotDay,
} from './reportsApi'
import { formatIsoDate } from './week'

export type ColumnKind = 'text' | 'count' | 'money' | 'km' | 'pct' | 'date' | 'duration'

export type RawValue = string | number | null

export type ModelColumn = {
  key: string
  header: string
  kind: ColumnKind
  align: 'left' | 'right'
  value: (row: ModelRow) => RawValue
  format: (value: RawValue) => string
  pct?: {
    part: (row: ModelRow) => number
    whole: (row: ModelRow) => number
  }
  durationOf?: () => number | null
}

export type ModelRow = {
  rowId: string
  pending?: boolean
  values: Record<string, RawValue>
  text?: Record<string, string>
  kmEstimated?: number
  pct?: Record<string, { part: number; whole: number }>
}

export type TotalCell = { key: string; value: RawValue; text: string }

export type TotalLine = { label: string; cells: TotalCell[] }

export type SectionTotal = { mode: 'rows'; lines: TotalLine[] } | { mode: 'caption'; text: string }

export type ReportSectionModel = {
  id: string
  title: string
  sheet: string
  csvId: string
  columns: ModelColumn[]
  rows: ModelRow[]
  total: SectionTotal
}

export type ReportKpi = {
  id: string
  title: string
  value: string
  detail?: string
  detailTone?: 'danger' | 'neutral'
}

export type ReportSource = {
  deliveries: DeliveriesReport
  drivers: DriversReport
  claims: ClaimsReport
  pickups: PickupsReport
  preparation: PreparationReport
}

export type ReportModel = {
  period: { from: string; to: string }
  kpis: ReportKpi[]
  claimsNote: string
  sections: ReportSectionModel[]
}

const countFormat = new Intl.NumberFormat('es-AR')
const kmFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function formatCount(value: RawValue) {
  if (typeof value !== 'number') return '—'
  return countFormat.format(value)
}

export function formatKm(value: RawValue) {
  if (typeof value !== 'number') return '—'
  return kmFormat.format(value)
}

export function formatMoney(value: RawValue) {
  if (typeof value !== 'number') return 'Sin monto sellado'
  return moneyFormat.format(value)
}

export function formatPct(value: RawValue) {
  if (typeof value !== 'number') return '—'
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

export function formatDate(value: RawValue) {
  if (typeof value !== 'string' || !value) return '—'
  return formatIsoDate(value)
}

export function formatText(value: RawValue) {
  if (value == null || value === '') return '—'
  return String(value)
}

export function cellText(column: ModelColumn, row: ModelRow) {
  const custom = row.text?.[column.key]
  if (custom != null) return custom
  return column.format(column.value(row))
}

export function sectionCsv(section: ReportSectionModel) {
  const header = section.columns.map((column) => column.header)
  const body = section.rows.map((row) => section.columns.map((column) => cellText(column, row)))
  const lines = [header, ...body]
  if (section.total.mode === 'caption') {
    lines.push([section.total.text, ...section.columns.slice(1).map(() => '')])
    return lines
  }
  for (const line of section.total.lines) lines.push(line.cells.map((cell) => cell.text))
  return lines
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function totalRow(columns: ModelColumn[], rows: ModelRow[], label = 'Total'): TotalLine {
  const cells = columns.map((column, index) => {
    if (index === 0) return { key: column.key, value: label, text: label }
    if (column.kind === 'text' || column.kind === 'date') return { key: column.key, value: '', text: '' }
    if (column.kind === 'pct' && column.pct) {
      const part = rows.reduce((sum, row) => sum + column.pct!.part(row), 0)
      const whole = rows.reduce((sum, row) => sum + column.pct!.whole(row), 0)
      const value = whole ? Math.round((part / whole) * 1000) / 10 : null
      return { key: column.key, value, text: column.format(value) }
    }
    if (column.kind === 'duration') {
      const value = column.durationOf ? column.durationOf() : null
      return { key: column.key, value, text: column.format(value) }
    }
    if (column.kind !== 'count' && column.kind !== 'money' && column.kind !== 'km') {
      return { key: column.key, value: '', text: '' }
    }
    let sum = 0
    let any = false
    let estimated = 0
    for (const row of rows) {
      const raw = column.value(row)
      if (typeof raw === 'number') {
        sum += raw
        any = true
      }
      if (column.kind === 'km') estimated += row.kmEstimated ?? 0
    }
    if (!any) {
      if (column.kind === 'money') {
        return { key: column.key, value: null, text: rows.length === 0 ? formatMoney(null) : '' }
      }
      if (rows.length > 0) return { key: column.key, value: null, text: '—' }
      return { key: column.key, value: 0, text: column.format(0) }
    }
    if (column.kind === 'money') {
      const value = round2(sum)
      return { key: column.key, value, text: column.format(value) }
    }
    if (column.kind === 'km') {
      const value = round1(sum)
      const estimatedKm = round1(estimated)
      const text = estimatedKm > 0 ? `${formatKm(value)} (${formatKm(estimatedKm)} estimados)` : formatKm(value)
      return { key: column.key, value, text }
    }
    return { key: column.key, value: sum, text: column.format(sum) }
  })
  return { label, cells }
}

function sectionTotal(id: string, columns: ModelColumn[], rows: ModelRow[]): SectionTotal {
  if (id === 'atrasados' || id === 'retiros-vencidos') {
    const noun = rows.length === 1 ? 'pedido' : 'pedidos'
    return { mode: 'caption', text: `${countFormat.format(rows.length)} ${noun}` }
  }
  if (id === 'reclamos-abiertos') {
    const noun = rows.length === 1 ? 'reclamo' : 'reclamos'
    return { mode: 'caption', text: `${countFormat.format(rows.length)} ${noun}` }
  }
  const lines = [totalRow(columns, rows.filter((row) => !row.pending))]
  if (id === 'choferes') {
    const pending = rows.filter((row) => row.pending)
    if (pending.length > 0) lines.push(totalRow(columns, pending, 'Pendientes'))
  }
  return { mode: 'rows', lines }
}

function formatDuration(value: RawValue) {
  return formatPrepMs(typeof value === 'number' ? value : null)
}

function column(
  key: string,
  header: string,
  kind: ColumnKind,
  format: (value: RawValue) => string,
  pctKey?: string,
  durationOf?: () => number | null,
): ModelColumn {
  const align = kind === 'text' || kind === 'date' ? 'left' : 'right'
  return {
    key,
    header,
    kind,
    align,
    value: (row) => (key in row.values ? row.values[key] : null),
    format,
    pct: pctKey
      ? {
          part: (row) => row.pct?.[pctKey]?.part ?? 0,
          whole: (row) => row.pct?.[pctKey]?.whole ?? 0,
        }
      : undefined,
    durationOf,
  }
}

function orderStatusLabel(status: string) {
  return status in STATUS_PILL ? STATUS_PILL[status as OrderStatus] : status
}

function claimStatusLabel(status: string) {
  return status in CLAIM_STATUS_LABEL ? CLAIM_STATUS_LABEL[status as ClaimStatus] : status
}

function priorityLabel(key: string) {
  return isOrderPriority(key) ? PRIORITY_LABEL[key] : key
}

function withSlot(antes: number, enHorario: number, conDemora: number) {
  return antes + enHorario + conDemora
}

function dayRow(day: DayReport): ModelRow {
  return {
    rowId: day.date,
    values: {
      date: day.date,
      pendiente: day.status.pendiente,
      preparado: day.status.preparado,
      asignado: day.status.asignado,
      viaje: day.status['en-viaje'],
      entregado: day.status.entregado,
      propia: day.dispatch.propia,
      correo: day.dispatch.correo,
      retiro: day.dispatch.retiro,
    },
  }
}

function slotRow(day: SlotDay): ModelRow {
  const whole = withSlot(day.antes, day.enHorario, day.conDemora)
  return {
    rowId: day.date,
    values: {
      date: day.date,
      antes: day.antes,
      en: day.enHorario,
      demora: day.conDemora,
      sin: day.sinFranja,
      pct: day.pctOnTime,
    },
    pct: {
      pct: { part: day.antes + day.enHorario, whole },
    },
  }
}

function lateRow(row: LateOrder): ModelRow {
  return {
    rowId: row.id,
    values: {
      id: row.id,
      client: row.client,
      seller: row.seller,
      zone: row.zone,
      date: row.date,
      slot: row.timeWindow,
      status: orderStatusLabel(row.status),
    },
  }
}

function groupRow(row: GroupReport, label: string): ModelRow {
  const whole = withSlot(row.antes, row.enHorario, row.conDemora)
  return {
    rowId: row.key,
    values: {
      key: label,
      total: row.total,
      entregados: row.entregados,
      cancelados: row.cancelados,
      antes: row.antes,
      en: row.enHorario,
      demora: row.conDemora,
      pctAntes: row.pctAntes,
      pct: row.pctOnTime,
      pctDemora: row.pctConDemora,
      sin: row.sinFranja,
    },
    pct: {
      pctAntes: { part: row.antes, whole },
      pct: { part: row.antes + row.enHorario, whole },
      pctDemora: { part: row.conDemora, whole },
    },
  }
}

function groupColumns(label: string): ModelColumn[] {
  return [
    column('key', label, 'text', formatText),
    column('total', 'Total', 'count', formatCount),
    column('entregados', 'Entregados', 'count', formatCount),
    column('cancelados', 'Cancelados', 'count', formatCount),
    column('antes', 'Entregado antes', 'count', formatCount),
    column('en', 'En horario', 'count', formatCount),
    column('demora', 'Entregado con demora', 'count', formatCount),
    column('pctAntes', '% antes', 'pct', formatPct, 'pctAntes'),
    column('pct', '% en horario', 'pct', formatPct, 'pct'),
    column('pctDemora', '% con demora', 'pct', formatPct, 'pctDemora'),
    column('sin', 'Sin franja', 'count', formatCount),
  ]
}

function moneyLabel(amount: number | null, unsealed: number) {
  if (amount == null) return 'Sin monto sellado'
  if (unsealed > 0) return `${formatMoney(amount)} · ${unsealed} sin monto sellado`
  return formatMoney(amount)
}

function driverLines(driver: DriverReport): ModelRow[] {
  const lines: ModelRow[] = []
  if (driver.closedTrips > 0 || driver.pendingTrips === 0) {
    const text: Record<string, string> = {}
    if (driver.kmEstimated > 0) {
      text.km = `${formatKm(driver.km)} (${formatKm(driver.kmEstimated)} estimados)`
    }
    text.amount = moneyLabel(driver.amount, driver.unsealed)
    lines.push({
      rowId: `${driver.driverId}-cerrado`,
      values: {
        name: driver.driverName,
        estado: 'Cerrado',
        trips: driver.closedTrips,
        deliveries: driver.deliveries,
        undelivered: driver.undelivered,
        km: driver.km,
        amount: driver.amount,
      },
      text,
      kmEstimated: driver.kmEstimated,
    })
  }
  if (driver.pendingTrips > 0) {
    const estimated =
      driver.pendingEstimated == null ? 'Estimado' : `Estimado ${formatMoney(driver.pendingEstimated)}`
    lines.push({
      rowId: `${driver.driverId}-curso`,
      pending: true,
      values: {
        name: driver.driverName,
        estado: 'En curso',
        trips: driver.pendingTrips,
        deliveries: null,
        undelivered: null,
        km: driver.pendingKm,
        amount: null,
      },
      text: { amount: estimated },
    })
  }
  return lines
}

function repairRows(repairs: ClaimsReport['repairs']): ModelRow[] {
  const decided = repairs.accepted + repairs.rejected
  const rows: ModelRow[] = repairs.byStep.map((row) => ({
    rowId: row.step,
    values: { label: row.label, count: row.count, aceptacion: null },
    pct: { aceptacion: { part: 0, whole: 0 } },
  }))
  const extras = [
    ['garantia', 'Garantía', repairs.garantia],
    ['cobro', 'Cobro', repairs.cobro],
    ['enviados', 'Presupuestos enviados', repairs.sent],
    ['vencidos', 'Presupuestos vencidos', repairs.expired],
    ['reenviados', 'Presupuestos reenviados', repairs.resent],
    ['aceptados', 'Aceptados', repairs.accepted],
    ['rechazados', 'Rechazados', repairs.rejected],
  ] as const
  for (const [id, label, count] of extras) {
    const rate = id === 'aceptados' && decided > 0 ? Math.round((repairs.accepted / decided) * 1000) / 10 : null
    rows.push({
      rowId: id,
      values: { label, count, aceptacion: rate },
      pct: { aceptacion: id === 'aceptados' ? { part: repairs.accepted, whole: decided } : { part: 0, whole: 0 } },
    })
  }
  return rows
}

function claimStatusRow(row: { status: string; label: string; count: number }): ModelRow {
  return { rowId: row.status, values: { label: row.label, count: row.count } }
}

function claimMotiveRow(row: { motive: string; count: number }): ModelRow {
  return { rowId: row.motive, values: { motive: row.motive, count: row.count } }
}

function openClaimRow(row: OpenClaimRow): ModelRow {
  return {
    rowId: row.id,
    values: {
      id: row.id,
      client: row.client,
      motive: row.motive,
      status: claimStatusLabel(row.status),
      days: row.days,
    },
  }
}

function pickupRow(row: PickupDay): ModelRow {
  return {
    rowId: row.date,
    values: {
      date: row.date,
      total: row.total,
      pendiente: row.status.pendiente,
      preparado: row.status.preparado,
      asignado: row.status.asignado,
      viaje: row.status['en-viaje'],
      entregado: row.status.entregado,
    },
  }
}

function overdueRow(row: OverduePickup): ModelRow {
  return {
    rowId: row.id,
    values: {
      id: row.id,
      client: row.client,
      seller: row.seller,
      date: row.date,
      status: orderStatusLabel(row.status),
    },
  }
}

function kpis(data: ReportSource): ReportKpi[] {
  const delivered = data.deliveries.byDay.reduce((sum, day) => sum + day.status.entregado, 0)
  const slot = data.deliveries.slot
  const totals = data.drivers.totals
  return [
    { id: 'entregados', title: 'Entregados', value: countFormat.format(delivered) },
    {
      id: 'horario',
      title: '% en horario',
      value: formatPct(slot.pctOnTime),
      detail: `${slot.conDemora} con demora`,
      detailTone: slot.conDemora > 0 ? 'danger' : 'neutral',
    },
    { id: 'atrasados', title: 'Atrasados abiertos', value: countFormat.format(data.deliveries.late.length) },
    { id: 'viajes', title: 'Viajes cerrados', value: countFormat.format(totals.closedTrips) },
    {
      id: 'km',
      title: 'Km',
      value: formatKm(totals.km),
      detail: totals.kmEstimated > 0 ? `${formatKm(totals.kmEstimated)} estimados` : undefined,
      detailTone: 'neutral',
    },
    {
      id: 'monto',
      title: 'Monto a pagar',
      value: totals.amount == null ? 'Sin monto sellado' : formatMoney(totals.amount),
    },
    {
      id: 'pendientes',
      title: 'Viajes pendientes',
      value: countFormat.format(totals.pendingTrips),
      detail: 'sin monto',
      detailTone: 'neutral',
    },
  ]
}

export function buildReportModel(data: ReportSource, period: { from: string; to: string }): ReportModel {
  const hours = data.claims.averageCloseHours
  const claimsNote =
    hours == null ? 'Sin cierres en el período' : `Tiempo promedio hasta el cierre: ${formatKm(hours)} h`
  const drafts: Omit<ReportSectionModel, 'total'>[] = [
    {
      id: 'entregas',
      title: 'Entregas por día',
      sheet: 'Entregas por día',
      csvId: 'entregas',
      columns: [
        column('date', 'Fecha', 'date', formatDate),
        column('pendiente', 'Pendiente', 'count', formatCount),
        column('preparado', 'Preparado', 'count', formatCount),
        column('asignado', 'Asignado', 'count', formatCount),
        column('viaje', 'En viaje', 'count', formatCount),
        column('entregado', 'Entregado', 'count', formatCount),
        column('propia', 'Propia', 'count', formatCount),
        column('correo', 'Correo', 'count', formatCount),
        column('retiro', 'Retiro', 'count', formatCount),
      ],
      rows: data.deliveries.byDay.map(dayRow),
    },
    {
      id: 'franja',
      title: 'Cumplimiento de franja',
      sheet: 'Franja',
      csvId: 'franja',
      columns: [
        column('date', 'Fecha', 'date', formatDate),
        column('antes', 'Entregado antes', 'count', formatCount),
        column('en', 'En horario', 'count', formatCount),
        column('demora', 'Entregado con demora', 'count', formatCount),
        column('sin', 'Sin franja', 'count', formatCount),
        column('pct', '% en horario', 'pct', formatPct, 'pct'),
      ],
      rows: data.deliveries.slotByDay.map(slotRow),
    },
    {
      id: 'atrasados',
      title: 'Atrasados',
      sheet: 'Atrasados',
      csvId: 'atrasados',
      columns: [
        column('id', 'Pedido', 'text', formatText),
        column('client', 'Cliente', 'text', formatText),
        column('seller', 'Vendedor', 'text', formatText),
        column('zone', 'Zona', 'text', formatText),
        column('date', 'Fecha', 'date', formatDate),
        column('slot', 'Franja', 'text', formatText),
        column('status', 'Estado', 'text', formatText),
      ],
      rows: data.deliveries.late.map(lateRow),
    },
    {
      id: 'vendedores',
      title: 'Por vendedor',
      sheet: 'Vendedores',
      csvId: 'vendedores',
      columns: groupColumns('Vendedor'),
      rows: data.deliveries.bySeller.map((row) => groupRow(row, row.key)),
    },
    {
      id: 'zonas',
      title: 'Por zona',
      sheet: 'Zonas',
      csvId: 'zonas',
      columns: groupColumns('Zona'),
      rows: data.deliveries.byZone.map((row) => groupRow(row, row.key)),
    },
    {
      id: 'prioridad',
      title: 'Por prioridad',
      sheet: 'Prioridad',
      csvId: 'prioridad',
      columns: groupColumns('Prioridad'),
      rows: data.deliveries.byPriority.map((row) => groupRow(row, priorityLabel(row.key))),
    },
    {
      id: 'choferes',
      title: 'Por chofer',
      sheet: 'Choferes',
      csvId: 'choferes',
      columns: [
        column('name', 'Chofer', 'text', formatText),
        column('estado', 'Estado', 'text', formatText),
        column('trips', 'Viajes', 'count', formatCount),
        column('deliveries', 'Entregas', 'count', formatCount),
        column('undelivered', 'No entregas', 'count', formatCount),
        column('km', 'Km', 'km', formatKm),
        column('amount', 'Monto', 'money', formatMoney),
      ],
      rows: data.drivers.drivers.flatMap(driverLines),
    },
    {
      id: 'reclamos-estado',
      title: 'Por estado',
      sheet: 'Reclamos estado',
      csvId: 'reclamos-estado',
      columns: [column('label', 'Estado', 'text', formatText), column('count', 'Cantidad', 'count', formatCount)],
      rows: data.claims.byStatus.map(claimStatusRow),
    },
    {
      id: 'reclamos-motivo',
      title: 'Por tipo',
      sheet: 'Reclamos tipo',
      csvId: 'reclamos-motivo',
      columns: [column('motive', 'Tipo', 'text', formatText), column('count', 'Cantidad', 'count', formatCount)],
      rows: data.claims.byMotive.map(claimMotiveRow),
    },
    {
      id: 'reclamos-abiertos',
      title: 'Abiertos con más de 7 días',
      sheet: 'Reclamos abiertos',
      csvId: 'reclamos-abiertos',
      columns: [
        column('id', 'Reclamo', 'text', formatText),
        column('client', 'Cliente', 'text', formatText),
        column('motive', 'Tipo', 'text', formatText),
        column('status', 'Estado', 'text', formatText),
        column('days', 'Días', 'count', formatCount),
      ],
      rows: data.claims.openAged.map(openClaimRow),
    },
    {
      id: 'reparaciones',
      title: 'Reparaciones',
      sheet: 'Reparaciones',
      csvId: 'reparaciones',
      columns: [
        column('label', 'Indicador', 'text', formatText),
        column('count', 'Cantidad', 'count', formatCount),
        column('aceptacion', 'Aceptación', 'pct', formatPct, 'aceptacion'),
      ],
      rows: repairRows(data.claims.repairs),
    },
    {
      id: 'retiros-dia',
      title: 'Por día',
      sheet: 'Retiros día',
      csvId: 'retiros',
      columns: [
        column('date', 'Fecha', 'date', formatDate),
        column('total', 'Total', 'count', formatCount),
        column('pendiente', 'Pendiente', 'count', formatCount),
        column('preparado', 'Preparado', 'count', formatCount),
        column('asignado', 'Asignado', 'count', formatCount),
        column('viaje', 'En viaje', 'count', formatCount),
        column('entregado', 'Entregado', 'count', formatCount),
      ],
      rows: data.pickups.byDay.map(pickupRow),
    },
    {
      id: 'retiros-vencidos',
      title: 'Pendientes de retiro vencidos',
      sheet: 'Retiros vencidos',
      csvId: 'retiros-vencidos',
      columns: [
        column('id', 'Pedido', 'text', formatText),
        column('client', 'Cliente', 'text', formatText),
        column('seller', 'Vendedor', 'text', formatText),
        column('date', 'Fecha', 'date', formatDate),
        column('status', 'Estado', 'text', formatText),
      ],
      rows: data.pickups.overdue.map(overdueRow),
    },
    {
      id: 'preparacion',
      title: 'Preparación por operario',
      sheet: 'Preparación',
      csvId: 'preparacion',
      columns: [
        column('name', 'Operario', 'text', formatText),
        column('armed', 'Armados', 'count', formatCount),
        column('packages', 'Bultos', 'count', formatCount),
        column('timed', 'Con duración', 'count', formatCount),
        column('incomplete', 'Incompletos', 'count', formatCount),
        column('direct', 'Directos', 'count', formatCount),
        column('avg', 'Promedio', 'duration', formatDuration, undefined, () => data.preparation.total.avgMs),
        column('median', 'Mediana', 'duration', formatDuration, undefined, () => data.preparation.total.medianMs),
      ],
      rows: data.preparation.rows.map((row) => ({
        rowId: row.id || row.name,
        values: {
          name: row.name,
          armed: row.armed,
          packages: row.packages,
          timed: row.timed,
          incomplete: row.incomplete,
          direct: row.direct,
          avg: row.avgMs,
          median: row.medianMs,
        },
      })),
    },
  ]
  const sections = drafts.map((draft) => ({
    ...draft,
    total: sectionTotal(draft.id, draft.columns, draft.rows),
  }))
  return { period, kpis: kpis(data), claimsNote, sections }
}
