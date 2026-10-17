import { Router } from 'express'
import { queryRows, readCollection, usingDatabase } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { describeTrip } from './routeSheets.js'
import { deliveredTimeliness, slotRange } from './timeliness.js'

const STATUSES = ['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado']
const DISPATCHES = ['propia', 'correo', 'retiro']
const CLAIM_LABEL = {
  nuevo: 'Nuevo',
  recepcion: 'Recepción de producto',
  'pendiente-retiro': 'Pendiente de retiro cliente',
  'enviado-proveedor': 'Enviado al proveedor para verificación',
  reparacion: 'Reparación',
  entregado: 'Entregado al cliente',
  cancelado: 'Cancelado',
}
const CLAIM_DAY = `to_char((data->>'createdAt')::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`
const OPEN_CLAIM_MS = 7 * 24 * 60 * 60 * 1000

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

export const reportsRouter = Router()
reportsRouter.use(requireAuth)
reportsRouter.use(requireRole('encargado_deposito', 'admin', 'gerencia'))

/** from y to en YYYY-MM-DD, hora de Buenos Aires. Sin fechas, los últimos 30 días. */
export function readPeriod(query) {
  const source = query ?? {}
  const rawFrom = typeof source.from === 'string' ? source.from : ''
  const rawTo = typeof source.to === 'string' ? source.to : ''
  if (!rawFrom && !rawTo) {
    const today = businessDate()
    return { from: addDays(today, -29), to: today }
  }
  if (!isDate(rawFrom) || !isDate(rawTo)) return fail('El período no es válido.')
  if (rawFrom > rawTo) return fail('La fecha desde no puede ser posterior a la fecha hasta.')
  if (inclusiveDays(rawFrom, rawTo) > MAX_DAYS) return fail('El período no puede superar 366 días.')
  return { from: rawFrom, to: rawTo }
}

export function businessDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function inclusiveDays(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86400000) + 1
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function fail(error, status = 400) {
  return { error, status }
}

reportsRouter.get('/deliveries', async (req, res) => {
  await send(res, async () => {
    const period = readPeriod(req.query ?? {})
    if (period.error) {
      res.status(period.status).json({ message: period.error })
      return
    }
    const report = await locked(() => loadDeliveries(period))
    res.json(report)
  })
})

reportsRouter.get('/drivers', async (req, res) => {
  await send(res, async () => {
    const period = readPeriod(req.query ?? {})
    if (period.error) {
      res.status(period.status).json({ message: period.error })
      return
    }
    const report = await locked(() => loadDrivers(period))
    res.json(report)
  })
})

async function loadDrivers(period) {
  const sheets = await sheetsInPeriod(period)
  const names = await driverNames()
  const pendingIds = []
  for (const sheet of sheets) {
    if (sheet.status !== 'en_curso') continue
    const ids = Array.isArray(sheet.orderIds) ? sheet.orderIds : []
    for (const id of ids) if (typeof id === 'string' && id) pendingIds.push(id)
  }
  const byId = await ordersById([...new Set(pendingIds)])
  const rates = await readCollection('tripRates')
  const byDriver = new Map()
  for (const sheet of sheets) {
    if (sheet.status !== 'cerrada' && sheet.status !== 'en_curso') continue
    const driverId = typeof sheet.driverId === 'string' ? sheet.driverId : ''
    if (!driverId) continue
    const name = names.get(driverId) || driverId
    const trip = describeTrip(sheet, byId, name, rates)
    const current = byDriver.get(driverId) ?? emptyDriver(driverId, name)
    if (sheet.status === 'cerrada') {
      current.closedTrips += 1
      current.deliveries += trip.delivered
      current.undelivered += trip.undelivered
      current.km = roundKm(current.km + (Number(trip.km) || 0))
      if (trip.kmEstimated) current.kmEstimated = roundKm(current.kmEstimated + (Number(trip.km) || 0))
      if (trip.amountSealed) {
        current.amount = roundMoney((current.amount ?? 0) + trip.amount)
        current.sealedTrips += 1
      } else current.unsealed += 1
    } else {
      current.pendingTrips += 1
      current.pendingKm = roundKm(current.pendingKm + (Number(trip.km) || 0))
      if (typeof trip.amount === 'number') {
        current.pendingEstimated = roundMoney((current.pendingEstimated ?? 0) + trip.amount)
      }
    }
    byDriver.set(driverId, current)
  }
  const drivers = [...byDriver.values()].sort((left, right) => left.driverName.localeCompare(right.driverName, 'es'))
  const totals = emptyDriver('', '')
  for (const driver of drivers) {
    totals.closedTrips += driver.closedTrips
    totals.deliveries += driver.deliveries
    totals.undelivered += driver.undelivered
    totals.km = roundKm(totals.km + driver.km)
    totals.kmEstimated = roundKm(totals.kmEstimated + driver.kmEstimated)
    totals.unsealed += driver.unsealed
    totals.sealedTrips += driver.sealedTrips
    if (driver.amount != null) totals.amount = roundMoney((totals.amount ?? 0) + driver.amount)
    totals.pendingTrips += driver.pendingTrips
    totals.pendingKm = roundKm(totals.pendingKm + driver.pendingKm)
    if (driver.pendingEstimated != null) {
      totals.pendingEstimated = roundMoney((totals.pendingEstimated ?? 0) + driver.pendingEstimated)
    }
  }
  if (!totals.sealedTrips) totals.amount = null
  return {
    period,
    drivers: drivers.map(publicDriver),
    totals: publicDriver(totals),
  }
}

function emptyDriver(driverId, driverName) {
  return {
    driverId,
    driverName,
    closedTrips: 0,
    deliveries: 0,
    undelivered: 0,
    km: 0,
    kmEstimated: 0,
    amount: null,
    sealedTrips: 0,
    unsealed: 0,
    pendingTrips: 0,
    pendingKm: 0,
    pendingEstimated: null,
  }
}

function publicDriver(driver) {
  return {
    driverId: driver.driverId,
    driverName: driver.driverName,
    closedTrips: driver.closedTrips,
    deliveries: driver.deliveries,
    undelivered: driver.undelivered,
    km: driver.km,
    kmEstimated: driver.kmEstimated,
    amount: driver.sealedTrips ? driver.amount : null,
    unsealed: driver.unsealed,
    pendingTrips: driver.pendingTrips,
    pendingKm: driver.pendingKm,
    pendingEstimated: driver.pendingEstimated,
  }
}

async function sheetsInPeriod(period) {
  if (!usingDatabase()) {
    const sheets = await readCollection('routeSheets')
    return sheets.filter(
      (sheet) => sheet && typeof sheet.date === 'string' && sheet.date >= period.from && sheet.date <= period.to,
    )
  }
  const rows = await queryRows(
    `SELECT id, data
     FROM routeSheets
     WHERE data->>'date' BETWEEN $1 AND $2
       AND data->>'status' IN ('cerrada', 'en_curso')`,
    [period.from, period.to],
  )
  return rows.map((row) => ({ ...row.data, id: row.data?.id || row.id }))
}

async function driverNames() {
  const map = new Map()
  if (!usingDatabase()) {
    const users = await readCollection('users')
    for (const user of users) {
      if (user && user.role === 'chofer' && typeof user.id === 'string') {
        map.set(user.id, text(user.name) || user.id)
      }
    }
    return map
  }
  const rows = await queryRows(
    `SELECT COALESCE(data->>'id', id) AS id, COALESCE(data->>'name', '') AS name
     FROM users
     WHERE data->>'role' = 'chofer'`,
  )
  for (const row of rows) map.set(row.id, text(row.name) || row.id)
  return map
}

async function ordersById(ids) {
  const map = new Map()
  if (ids.length === 0) return map
  if (!usingDatabase()) {
    const orders = await readCollection('orders')
    for (const order of orders) {
      if (order && ids.includes(order.id)) map.set(order.id, order)
    }
    return map
  }
  const rows = await queryRows(`SELECT id, data FROM orders WHERE id = ANY($1::text[])`, [ids])
  for (const row of rows) {
    const order = row.data
    if (order) map.set(order.id || row.id, order)
  }
  return map
}

reportsRouter.get('/claims', async (req, res) => {
  await send(res, async () => {
    const period = readPeriod(req.query ?? {})
    if (period.error) {
      res.status(period.status).json({ message: period.error })
      return
    }
    const report = await locked(() => loadClaims(period))
    res.json(report)
  })
})

reportsRouter.get('/pickups', async (req, res) => {
  await send(res, async () => {
    const period = readPeriod(req.query ?? {})
    if (period.error) {
      res.status(period.status).json({ message: period.error })
      return
    }
    const report = await locked(() => loadPickups(period))
    res.json(report)
  })
})

reportsRouter.get('/preparation', async (req, res) => {
  await send(res, async () => {
    const period = readPeriod(req.query ?? {})
    if (period.error) {
      res.status(period.status).json({ message: period.error })
      return
    }
    const report = await locked(() => loadPreparation(period))
    res.json(report)
  })
})

async function loadClaims(period) {
  const now = Date.now()
  const rows = await claimsInPeriod(period)
  const byStatus = new Map()
  const byMotive = new Map()
  let closeMs = 0
  let closed = 0
  const openAged = []
  for (const row of rows) {
    const status = text(row.status) || 'nuevo'
    const motive = text(row.motive) || 'Sin motivo'
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
    byMotive.set(motive, (byMotive.get(motive) ?? 0) + 1)
    const created = Date.parse(row.createdAt)
    const ended = claimClosedAt(row)
    if (Number.isFinite(created) && ended != null && ended >= created) {
      closeMs += ended - created
      closed += 1
    }
    if (isOpenClaim(status) && Number.isFinite(created) && now - created > OPEN_CLAIM_MS) {
      openAged.push({
        id: text(row.id),
        client: text(row.client),
        motive,
        status,
        createdAt: text(row.createdAt),
        days: Math.floor((now - created) / 86400000),
      })
    }
  }
  openAged.sort((left, right) => right.days - left.days || left.id.localeCompare(right.id, 'es'))
  return {
    period,
    total: rows.length,
    averageCloseHours: closed ? Math.round((closeMs / closed / 3600000) * 10) / 10 : null,
    byStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, label: CLAIM_LABEL[status] ?? status, count }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es')),
    byMotive: [...byMotive.entries()]
      .map(([motive, count]) => ({ motive, count }))
      .sort((left, right) => right.count - left.count || left.motive.localeCompare(right.motive, 'es')),
    openAged,
    repairs: repairStats(rows),
  }
}

const REPAIR_LABEL = {
  'por-levantar': 'Por levantar',
  diagnostico: 'Diagnóstico',
  'presupuesto-enviado': 'Presupuesto enviado',
  'presupuesto-vencido': 'Presupuesto vencido',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  'en-reparacion': 'En reparación',
  listo: 'Lista',
  entregado: 'Entregado',
}

function asRepair(value) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return typeof value === 'object' ? value : null
}

function repairStats(rows) {
  const byStep = new Map()
  let garantia = 0
  let cobro = 0
  let sent = 0
  let expired = 0
  let resent = 0
  let accepted = 0
  let rejected = 0
  for (const row of rows) {
    const repair = asRepair(row.repair)
    if (!repair) continue
    const step = typeof repair.step === 'string' ? repair.step : ''
    if (step) byStep.set(step, (byStep.get(step) ?? 0) + 1)
    if (repair.coverage === 'garantia') garantia += 1
    else if (repair.coverage === 'cobro') cobro += 1
    const quote = repair.quote && typeof repair.quote === 'object' ? repair.quote : {}
    if (quote.sentAt) sent += 1
    if (step === 'presupuesto-vencido' || quote.expiredNotifiedAt) expired += 1
    if (Array.isArray(repair.contacts)) {
      resent += repair.contacts.filter((contact) => contact?.kind === 'reenvio').length
    }
    if (repair.answer?.value === 'acepta') accepted += 1
    else if (repair.answer?.value === 'rechaza' || step === 'rechazado') rejected += 1
  }
  const steps = [...byStep.entries()].map(([step, count]) => ({
    step,
    label: REPAIR_LABEL[step] ?? step,
    count,
  }))
  return { byStep: steps, garantia, cobro, sent, expired, resent, accepted, rejected }
}

async function claimsInPeriod(period) {
  if (!usingDatabase()) {
    const claims = await readCollection('claims')
    return claims.filter((claim) => {
      const day = claimDay(claim?.createdAt)
      return day && day >= period.from && day <= period.to
    })
  }
  const rows = await queryRows(
    `SELECT COALESCE(data->>'id', id) AS id,
            COALESCE(data->>'client', '') AS client,
            COALESCE(data->>'motive', '') AS motive,
            COALESCE(data->>'status', '') AS status,
            COALESCE(data->>'createdAt', '') AS "createdAt",
            data->>'resolvedAt' AS "resolvedAt",
            data->'events' AS events,
            data->'repair' AS repair
     FROM claims
     WHERE data->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
       AND ${CLAIM_DAY} BETWEEN $1 AND $2`,
    [period.from, period.to],
  )
  return rows
}

function claimDay(iso) {
  if (typeof iso !== 'string' || !iso) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  return businessDate(at)
}

function claimClosedAt(claim) {
  const status = text(claim.status)
  if (status !== 'entregado' && status !== 'cancelado') return null
  if (typeof claim.resolvedAt === 'string' && claim.resolvedAt) {
    const at = Date.parse(claim.resolvedAt)
    if (Number.isFinite(at)) return at
  }
  const events = Array.isArray(claim.events) ? claim.events : []
  let best = null
  for (const event of events) {
    if (!event || (event.status !== 'entregado' && event.status !== 'cancelado')) continue
    const at = Date.parse(event.at)
    if (!Number.isFinite(at)) continue
    if (best == null || at > best) best = at
  }
  return best
}

function isOpenClaim(status) {
  return status !== 'entregado' && status !== 'cancelado'
}

async function loadPickups(period) {
  const today = businessDate()
  if (!usingDatabase()) {
    const orders = await readCollection('orders')
    const rows = orders.filter(
      (order) =>
        order &&
        order.dispatchType === 'retiro' &&
        typeof order.deliveryDate === 'string' &&
        order.deliveryDate >= period.from &&
        order.deliveryDate <= period.to,
    )
    return buildPickups(period, groupedCounts(rows.map(orderRow)), rows, today)
  }
  const counts = await queryRows(
    `SELECT data->>'deliveryDate' AS date,
            COALESCE(data->>'status', '') AS status,
            COUNT(*)::int AS count
     FROM orders
     WHERE data->>'dispatchType' = 'retiro'
       AND data->>'deliveryDate' BETWEEN $1 AND $2
     GROUP BY 1, 2
     ORDER BY 1`,
    [period.from, period.to],
  )
  const overdue = await queryRows(
    `SELECT COALESCE(data->>'id', id) AS id,
            COALESCE(data->>'client', '') AS client,
            COALESCE(data->>'seller', '') AS seller,
            COALESCE(data->>'status', '') AS status,
            COALESCE(data->>'deliveryDate', '') AS date
     FROM orders
     WHERE data->>'dispatchType' = 'retiro'
       AND data->>'deliveryDate' BETWEEN $1 AND $2
       AND data->>'deliveryDate' < $3
       AND COALESCE(data->>'status', '') NOT IN ('entregado', 'cancelado')
     ORDER BY data->>'deliveryDate', id`,
    [period.from, period.to, today],
  )
  const days = new Map()
  for (const item of counts) {
    const date = text(item.date)
    const current = days.get(date) ?? { ...emptyDay(date), total: 0 }
    const count = Number(item.count) || 0
    if (STATUSES.includes(item.status)) current.status[item.status] += count
    current.total += count
    days.set(date, current)
  }
  return {
    period,
    byDay: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    overdue: overdue.map((row) => ({
      id: text(row.id),
      client: text(row.client),
      seller: text(row.seller),
      date: text(row.date),
      status: text(row.status),
    })),
  }
}

function buildPickups(period, counts, rows, today) {
  const days = new Map()
  for (const item of counts) {
    const date = text(item.date)
    const current = days.get(date) ?? { ...emptyDay(date), total: 0 }
    const count = Number(item.count) || 0
    if (STATUSES.includes(item.status)) current.status[item.status] += count
    current.total += count
    days.set(date, current)
  }
  const overdue = []
  for (const row of rows) {
    const date = text(row.deliveryDate)
    const status = text(row.status)
    if (!date || date >= today || !status || status === 'entregado' || status === 'cancelado') continue
    overdue.push({
      id: text(row.id),
      client: text(row.client),
      seller: text(row.seller),
      date,
      status,
    })
  }
  overdue.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id, 'es'))
  return {
    period,
    byDay: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    overdue,
  }
}

function roundKm(value) {
  return Math.round(value * 10) / 10
}

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

async function loadDeliveries(period) {
  const now = Date.now()
  const today = businessDate(now)
  if (!usingDatabase()) {
    const orders = await readCollection('orders')
    const rows = orders
      .filter((order) => order && order.deliveryDate >= period.from && order.deliveryDate <= period.to)
      .map(orderRow)
    return buildDeliveries(period, rows, groupedCounts(rows), today, now)
  }
  const counts = await queryRows(
    `SELECT data->>'deliveryDate' AS date,
            COALESCE(data->>'status', '') AS status,
            COALESCE(data->>'dispatchType', '') AS "dispatchType",
            COUNT(*)::int AS count
     FROM orders
     WHERE data->>'deliveryDate' BETWEEN $1 AND $2
     GROUP BY 1, 2, 3
     ORDER BY 1`,
    [period.from, period.to],
  )
  const rows = await queryRows(
    `SELECT COALESCE(data->>'id', id) AS id,
            COALESCE(data->>'client', '') AS client,
            COALESCE(data->>'seller', '') AS seller,
            COALESCE(data->>'zone', '') AS zone,
            COALESCE(data->>'status', '') AS status,
            COALESCE(data->>'dispatchType', '') AS "dispatchType",
            COALESCE(data->>'priority', '') AS priority,
            COALESCE(data->>'deliveryDate', '') AS "deliveryDate",
            COALESCE(data->>'timeWindow', '') AS "timeWindow",
            data->>'deliveredAt' AS "deliveredAt"
     FROM orders
     WHERE data->>'deliveryDate' BETWEEN $1 AND $2`,
    [period.from, period.to],
  )
  return buildDeliveries(period, rows.map(orderRow), counts, today, now)
}

function orderRow(order) {
  return {
    id: typeof order.id === 'string' ? order.id : '',
    client: text(order.client),
    seller: text(order.seller),
    zone: text(order.zone),
    status: text(order.status),
    dispatchType: text(order.dispatchType),
    priority: text(order.priority) || 'normal',
    deliveryDate: text(order.deliveryDate),
    timeWindow: text(order.timeWindow),
    deliveredAt: typeof order.deliveredAt === 'string' ? order.deliveredAt : '',
  }
}

function groupedCounts(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = `${row.deliveryDate}\n${row.status}\n${row.dispatchType}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].map(([key, count]) => {
    const [date, status, dispatchType] = key.split('\n')
    return { date, status, dispatchType, count }
  })
}

function buildDeliveries(period, rows, counts, today, now) {
  const byDay = foldByDay(counts)
  const slotByDay = new Map()
  const groups = {
    seller: new Map(),
    zone: new Map(),
    priority: new Map(),
  }
  const slot = emptySlot()
  const late = []
  for (const row of rows) {
    const timing = deliveredTimeliness(row)
    if (row.status === 'entregado') addSlot(slot, timing)
    const day = slotByDay.get(row.deliveryDate) ?? emptySlot()
    if (row.status === 'entregado') addSlot(day, timing)
    slotByDay.set(row.deliveryDate, day)
    addGroup(groups.seller, row.seller || 'Sin vendedor', row, timing)
    addGroup(groups.zone, row.zone || 'Sin zona', row, timing)
    addGroup(groups.priority, row.priority || 'normal', row, timing)
    if (isOpenLate(row, today, now)) {
      late.push({
        id: row.id,
        client: row.client,
        seller: row.seller,
        zone: row.zone,
        date: row.deliveryDate,
        timeWindow: row.timeWindow,
        status: row.status,
      })
    }
  }
  late.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id, 'es'))
  return {
    period,
    byDay,
    slot: finishSlot(slot),
    slotByDay: [...slotByDay.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, item]) => ({ date, ...finishSlot(item) })),
    late,
    bySeller: finishGroups(groups.seller),
    byZone: finishGroups(groups.zone),
    byPriority: finishGroups(groups.priority),
  }
}

function foldByDay(counts) {
  const days = new Map()
  for (const item of counts) {
    const date = text(item.date)
    const current = days.get(date) ?? emptyDay(date)
    const count = Number(item.count) || 0
    if (STATUSES.includes(item.status)) current.status[item.status] += count
    if (DISPATCHES.includes(item.dispatchType)) current.dispatch[item.dispatchType] += count
    days.set(date, current)
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function emptyDay(date) {
  return {
    date,
    status: { pendiente: 0, preparado: 0, asignado: 0, 'en-viaje': 0, entregado: 0 },
    dispatch: { propia: 0, correo: 0, retiro: 0 },
  }
}

function emptySlot() {
  return { antes: 0, enHorario: 0, conDemora: 0, sinFranja: 0 }
}

function addSlot(bucket, timing) {
  if (timing === 'antes') bucket.antes += 1
  else if (timing === 'en-horario') bucket.enHorario += 1
  else if (timing === 'con-demora') bucket.conDemora += 1
  else bucket.sinFranja += 1
}

function finishSlot(bucket) {
  const withSlot = bucket.antes + bucket.enHorario + bucket.conDemora
  return {
    ...bucket,
    pctOnTime: percent(bucket.antes + bucket.enHorario, withSlot),
  }
}

function addGroup(map, key, row, timing) {
  const current = map.get(key) ?? {
    key,
    total: 0,
    entregados: 0,
    cancelados: 0,
    antes: 0,
    enHorario: 0,
    conDemora: 0,
    sinFranja: 0,
  }
  current.total += 1
  if (row.status === 'entregado') current.entregados += 1
  if (row.status === 'cancelado') current.cancelados += 1
  if (row.status === 'entregado') {
    if (timing === 'antes') current.antes += 1
    else if (timing === 'en-horario') current.enHorario += 1
    else if (timing === 'con-demora') current.conDemora += 1
    else current.sinFranja += 1
  }
  map.set(key, current)
}

function finishGroups(map) {
  return [...map.values()]
    .map((item) => {
      const withSlot = item.antes + item.enHorario + item.conDemora
      return {
        ...item,
        pctAntes: percent(item.antes, withSlot),
        pctEnHorario: percent(item.enHorario, withSlot),
        pctConDemora: percent(item.conDemora, withSlot),
        pctOnTime: percent(item.antes + item.enHorario, withSlot),
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key, 'es'))
}

function isOpenLate(row, today, now) {
  if (!row.status || row.status === 'entregado' || row.status === 'cancelado') return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(row.deliveryDate) && row.deliveryDate < today) return true
  const range = slotRange(row.deliveryDate, row.timeWindow)
  return Boolean(range && now >= range.end)
}

function percent(part, whole) {
  if (!whole) return null
  return Math.round((part / whole) * 1000) / 10
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

const PREP_DAY = `to_char((data->>'preparedAt')::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`
const PREP_MS = `(data->>'prepMs') ~ '^[0-9]+$'`

async function loadPreparation(period) {
  if (!usingDatabase()) return preparationFromOrders(await readCollection('orders'), period)
  const rows = await queryRows(
    `SELECT operator_id, operator_name, armed, packages, timed, avg_ms, median_ms, incomplete, direct
     FROM (
       SELECT data->'preparedBy'->>'id' AS operator_id,
              (array_agg(data->'preparedBy'->>'name' ORDER BY data->>'preparedAt' DESC))[1] AS operator_name,
              COUNT(*)::int AS armed,
              COALESCE(SUM(CASE WHEN (data->>'packages') ~ '^[0-9]+$' THEN (data->>'packages')::int ELSE 0 END), 0)::int AS packages,
              COUNT(*) FILTER (WHERE ${PREP_MS})::int AS timed,
              AVG(CASE WHEN ${PREP_MS} THEN (data->>'prepMs')::float END) AS avg_ms,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY (data->>'prepMs')::float) FILTER (WHERE ${PREP_MS}) AS median_ms,
              COUNT(*) FILTER (WHERE data->>'prepIncomplete' = 'true')::int AS incomplete,
              COUNT(*) FILTER (WHERE NOT (${PREP_MS}))::int AS direct
       FROM orders
       WHERE data->>'preparedAt' IS NOT NULL
         AND ${PREP_DAY} BETWEEN $1 AND $2
         AND COALESCE(data->'preparedBy'->>'id', '') <> ''
       GROUP BY data->'preparedBy'->>'id'
     ) AS grouped
     ORDER BY operator_name`,
    [period.from, period.to],
  )
  const totals = await queryRows(
    `SELECT COUNT(*)::int AS armed,
            COALESCE(SUM(CASE WHEN (data->>'packages') ~ '^[0-9]+$' THEN (data->>'packages')::int ELSE 0 END), 0)::int AS packages,
            COUNT(*) FILTER (WHERE ${PREP_MS})::int AS timed,
            AVG(CASE WHEN ${PREP_MS} THEN (data->>'prepMs')::float END) AS avg_ms,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY (data->>'prepMs')::float) FILTER (WHERE ${PREP_MS}) AS median_ms,
            COUNT(*) FILTER (WHERE data->>'prepIncomplete' = 'true')::int AS incomplete,
            COUNT(*) FILTER (WHERE NOT (${PREP_MS}))::int AS direct
     FROM orders
     WHERE data->>'preparedAt' IS NOT NULL
       AND ${PREP_DAY} BETWEEN $1 AND $2
       AND COALESCE(data->'preparedBy'->>'id', '') <> ''`,
    [period.from, period.to],
  )
  return {
    period,
    rows: rows.map(prepRow),
    total: prepRow(totals[0] ?? {}),
  }
}

function preparationFromOrders(orders, period) {
  const groups = new Map()
  const allMs = []
  let packages = 0
  let incomplete = 0
  let direct = 0
  for (const order of orders) {
    if (!order?.preparedAt || !order.preparedBy?.id) continue
    const parsed = Date.parse(order.preparedAt)
    if (!Number.isFinite(parsed)) continue
    const day = businessDate(parsed)
    if (!day || day < period.from || day > period.to) continue
    const id = order.preparedBy.id
    const current = groups.get(id) ?? {
      id,
      name: text(order.preparedBy.name) || id,
      armed: 0,
      packages: 0,
      timed: 0,
      ms: [],
      incomplete: 0,
      direct: 0,
      latest: '',
    }
    if (order.preparedAt >= current.latest) {
      current.latest = order.preparedAt
      current.name = text(order.preparedBy.name) || id
    }
    current.armed += 1
    const count = Number.isInteger(order.packages) ? order.packages : 0
    current.packages += count
    packages += count
    if (order.prepIncomplete === true) {
      current.incomplete += 1
      incomplete += 1
    }
    if (typeof order.prepMs === 'number' && Number.isFinite(order.prepMs) && order.prepMs >= 0) {
      current.timed += 1
      current.ms.push(order.prepMs)
      allMs.push(order.prepMs)
    } else {
      current.direct += 1
      direct += 1
    }
    groups.set(id, current)
  }
  const rows = [...groups.values()]
    .map((group) => ({
      id: group.id,
      name: group.name,
      armed: group.armed,
      packages: group.packages,
      timed: group.timed,
      avgMs: averageMs(group.ms),
      medianMs: medianMs(group.ms),
      incomplete: group.incomplete,
      direct: group.direct,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'))
  return {
    period,
    rows,
    total: {
      id: '',
      name: '',
      armed: rows.reduce((sum, row) => sum + row.armed, 0),
      packages,
      timed: allMs.length,
      avgMs: averageMs(allMs),
      medianMs: medianMs(allMs),
      incomplete,
      direct,
    },
  }
}

function prepRow(row) {
  return {
    id: text(row.operator_id),
    name: text(row.operator_name),
    armed: Number(row.armed) || 0,
    packages: Number(row.packages) || 0,
    timed: Number(row.timed) || 0,
    avgMs: row.avg_ms == null ? null : Math.round(Number(row.avg_ms)),
    medianMs: row.median_ms == null ? null : Math.round(Number(row.median_ms)),
    incomplete: Number(row.incomplete) || 0,
    direct: Number(row.direct) || 0,
  }
}

function averageMs(values) {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function medianMs(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const mid = (sorted.length - 1) * 0.5
  const low = Math.floor(mid)
  const high = Math.ceil(mid)
  const value = low === high ? sorted[low] : sorted[low] * (high - mid) + sorted[high] * (mid - low)
  return Math.round(value)
}

export async function send(res, task) {
  try {
    await task()
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
