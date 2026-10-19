import { apiRequest, type ApiFailure } from './api'

export type ReportPeriod = { from: string; to: string }

export type StatusCounts = {
  pendiente: number
  preparado: number
  asignado: number
  'en-viaje': number
  entregado: number
}

export type DispatchCounts = {
  propia: number
  correo: number
  retiro: number
}

export type DayReport = {
  date: string
  status: StatusCounts
  dispatch: DispatchCounts
}

export type SlotReport = {
  antes: number
  enHorario: number
  conDemora: number
  sinFranja: number
  pctOnTime: number | null
}

export type SlotDay = SlotReport & { date: string }

export type LateOrder = {
  id: string
  client: string
  seller: string
  zone: string
  date: string
  timeWindow: string
  status: string
}

export type GroupReport = {
  key: string
  total: number
  entregados: number
  cancelados: number
  antes: number
  enHorario: number
  conDemora: number
  sinFranja: number
  pctAntes: number | null
  pctEnHorario: number | null
  pctConDemora: number | null
  pctOnTime: number | null
}

export type DeliveriesReport = {
  period: ReportPeriod
  byDay: DayReport[]
  slot: SlotReport
  slotByDay: SlotDay[]
  late: LateOrder[]
  bySeller: GroupReport[]
  byZone: GroupReport[]
  byPriority: GroupReport[]
}

export type DriverReport = {
  driverId: string
  driverName: string
  closedTrips: number
  deliveries: number
  undelivered: number
  km: number
  kmEstimated: number
  amount: number | null
  unsealed: number
  pendingTrips: number
  pendingKm: number
  pendingEstimated: number | null
}

export type DriversReport = {
  period: ReportPeriod
  drivers: DriverReport[]
  totals: DriverReport
}

export type ClaimStatusRow = { status: string; label: string; count: number }
export type ClaimMotiveRow = { motive: string; count: number }
export type OpenClaimRow = {
  id: string
  client: string
  motive: string
  status: string
  createdAt: string
  days: number
}

export type RepairReport = {
  byStep: { step: string; label: string; count: number }[]
  garantia: number
  cobro: number
  sent: number
  expired: number
  resent: number
  accepted: number
  rejected: number
  closed: number
  chargeCost: number
}

export type ClaimsReport = {
  period: ReportPeriod
  total: number
  averageCloseHours: number | null
  byStatus: ClaimStatusRow[]
  byMotive: ClaimMotiveRow[]
  openAged: OpenClaimRow[]
  repairs: RepairReport
}

export type PickupDay = DayReport & { total: number }
export type OverduePickup = {
  id: string
  client: string
  seller: string
  date: string
  status: string
}

export type PickupsReport = {
  period: ReportPeriod
  byDay: PickupDay[]
  overdue: OverduePickup[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumOrNull(value: unknown): value is number | null {
  return value === null || isNum(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}

function isPeriod(value: unknown): value is ReportPeriod {
  return isRecord(value) && DATE.test(String(value.from ?? '')) && DATE.test(String(value.to ?? ''))
}

function countBag(value: unknown, keys: string[]) {
  if (!isRecord(value)) return false
  return keys.every((key) => isNum(value[key]))
}

function isDay(value: unknown): value is DayReport {
  if (!isRecord(value) || !DATE.test(String(value.date ?? ''))) return false
  return (
    countBag(value.status, ['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado']) &&
    countBag(value.dispatch, ['propia', 'correo', 'retiro'])
  )
}

function isSlot(value: unknown): value is SlotReport {
  if (!isRecord(value)) return false
  return (
    isNum(value.antes) &&
    isNum(value.enHorario) &&
    isNum(value.conDemora) &&
    isNum(value.sinFranja) &&
    isNumOrNull(value.pctOnTime)
  )
}

function isGroup(value: unknown): value is GroupReport {
  if (!isRecord(value) || !isText(value.key)) return false
  return (
    isNum(value.total) &&
    isNum(value.entregados) &&
    isNum(value.cancelados) &&
    isNum(value.antes) &&
    isNum(value.enHorario) &&
    isNum(value.conDemora) &&
    isNum(value.sinFranja) &&
    isNumOrNull(value.pctAntes) &&
    isNumOrNull(value.pctEnHorario) &&
    isNumOrNull(value.pctConDemora) &&
    isNumOrNull(value.pctOnTime)
  )
}

function isLate(value: unknown): value is LateOrder {
  if (!isRecord(value)) return false
  return (
    isText(value.id) &&
    value.id.length > 0 &&
    isText(value.client) &&
    isText(value.seller) &&
    isText(value.zone) &&
    isText(value.date) &&
    isText(value.timeWindow) &&
    isText(value.status)
  )
}

function isSlotDay(value: unknown): value is SlotDay {
  return isRecord(value) && DATE.test(typeof value.date === 'string' ? value.date : '') && isSlot(value)
}

function isDeliveries(value: unknown): value is DeliveriesReport {
  if (!isRecord(value) || !isPeriod(value.period) || !isSlot(value.slot)) return false
  return (
    Array.isArray(value.byDay) &&
    value.byDay.every(isDay) &&
    Array.isArray(value.slotByDay) &&
    value.slotByDay.every(isSlotDay) &&
    Array.isArray(value.late) &&
    value.late.every(isLate) &&
    Array.isArray(value.bySeller) &&
    value.bySeller.every(isGroup) &&
    Array.isArray(value.byZone) &&
    value.byZone.every(isGroup) &&
    Array.isArray(value.byPriority) &&
    value.byPriority.every(isGroup)
  )
}

function isDriver(value: unknown): value is DriverReport {
  if (!isRecord(value)) return false
  return (
    isText(value.driverId) &&
    isText(value.driverName) &&
    isNum(value.closedTrips) &&
    isNum(value.deliveries) &&
    isNum(value.undelivered) &&
    isNum(value.km) &&
    isNum(value.kmEstimated) &&
    isNumOrNull(value.amount) &&
    isNum(value.unsealed) &&
    isNum(value.pendingTrips) &&
    isNum(value.pendingKm) &&
    isNumOrNull(value.pendingEstimated)
  )
}

function isDrivers(value: unknown): value is DriversReport {
  if (!isRecord(value) || !isPeriod(value.period) || !isDriver(value.totals)) return false
  return Array.isArray(value.drivers) && value.drivers.every(isDriver)
}

function isClaims(value: unknown): value is ClaimsReport {
  if (!isRecord(value) || !isPeriod(value.period) || !isNum(value.total) || !isNumOrNull(value.averageCloseHours)) {
    return false
  }
  if (!Array.isArray(value.byStatus) || !Array.isArray(value.byMotive) || !Array.isArray(value.openAged)) return false
  const statusOk = value.byStatus.every(
    (item) => isRecord(item) && isText(item.status) && isText(item.label) && isNum(item.count),
  )
  const motiveOk = value.byMotive.every((item) => isRecord(item) && isText(item.motive) && isNum(item.count))
  const openOk = value.openAged.every(
    (item) =>
      isRecord(item) &&
      isText(item.id) &&
      isText(item.client) &&
      isText(item.motive) &&
      isText(item.status) &&
      isText(item.createdAt) &&
      isNum(item.days),
  )
  const repairs = value.repairs
  const repairsOk =
    isRecord(repairs) &&
    isNum(repairs.garantia) &&
    isNum(repairs.cobro) &&
    isNum(repairs.sent) &&
    isNum(repairs.expired) &&
    isNum(repairs.resent) &&
    isNum(repairs.accepted) &&
    isNum(repairs.rejected) &&
    isNum(repairs.closed) &&
    isNum(repairs.chargeCost) &&
    Array.isArray(repairs.byStep) &&
    repairs.byStep.every((item) => isRecord(item) && isText(item.step) && isText(item.label) && isNum(item.count))
  return statusOk && motiveOk && openOk && repairsOk
}

function isPickupDay(value: unknown): value is PickupDay {
  return isDay(value) && isNum((value as PickupDay).total)
}

function isPickups(value: unknown): value is PickupsReport {
  if (!isRecord(value) || !isPeriod(value.period)) return false
  if (!Array.isArray(value.byDay) || !Array.isArray(value.overdue)) return false
  const daysOk = value.byDay.every(isPickupDay)
  const lateOk = value.overdue.every(
    (item) => isRecord(item) && isText(item.id) && isText(item.client) && isText(item.seller) && isText(item.date) && isText(item.status),
  )
  return daysOk && lateOk
}

function queryOf(period: ReportPeriod) {
  return new URLSearchParams({ from: period.from, to: period.to }).toString()
}

async function getReport<T>(path: string, period: ReportPeriod, fallback: string, guard: (value: unknown) => value is T) {
  const result = await apiRequest(`${path}?${queryOf(period)}`, 'GET', undefined, fallback)
  if (!result.ok) return result
  if (!guard(result.data)) return { ok: false as const, status: 500, message: fallback }
  return { ok: true as const, data: result.data }
}

export function getDeliveriesReport(period: ReportPeriod): Promise<{ ok: true; data: DeliveriesReport } | ApiFailure> {
  return getReport('/api/reports/deliveries', period, 'No se pudieron cargar las entregas.', isDeliveries)
}

export function getDriversReport(period: ReportPeriod): Promise<{ ok: true; data: DriversReport } | ApiFailure> {
  return getReport('/api/reports/drivers', period, 'No se pudo cargar el reporte de choferes.', isDrivers)
}

export function getClaimsReport(period: ReportPeriod): Promise<{ ok: true; data: ClaimsReport } | ApiFailure> {
  return getReport('/api/reports/claims', period, 'No se pudieron cargar los reclamos.', isClaims)
}

export function getPickupsReport(period: ReportPeriod): Promise<{ ok: true; data: PickupsReport } | ApiFailure> {
  return getReport('/api/reports/pickups', period, 'No se pudieron cargar los retiros.', isPickups)
}

export type PreparationRow = {
  id: string
  name: string
  armed: number
  packages: number
  timed: number
  avgMs: number | null
  medianMs: number | null
  incomplete: number
  direct: number
}

export type PreparationReport = {
  period: ReportPeriod
  rows: PreparationRow[]
  total: PreparationRow
}

function isPreparationRow(value: unknown): value is PreparationRow {
  if (!isRecord(value)) return false
  return (
    isText(value.id) &&
    isText(value.name) &&
    isNum(value.armed) &&
    isNum(value.packages) &&
    isNum(value.timed) &&
    isNumOrNull(value.avgMs) &&
    isNumOrNull(value.medianMs) &&
    isNum(value.incomplete) &&
    isNum(value.direct)
  )
}

function isPreparation(value: unknown): value is PreparationReport {
  if (!isRecord(value) || !isPeriod(value.period) || !isPreparationRow(value.total)) return false
  return Array.isArray(value.rows) && value.rows.every(isPreparationRow)
}

export function getPreparationReport(period: ReportPeriod): Promise<{ ok: true; data: PreparationReport } | ApiFailure> {
  return getReport('/api/reports/preparation', period, 'No se pudo cargar la preparación.', isPreparation)
}
