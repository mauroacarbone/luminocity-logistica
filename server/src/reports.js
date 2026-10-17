import { Router } from 'express'
import { queryRows, readCollection, usingDatabase } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'
import { deliveredTimeliness, slotRange } from './timeliness.js'

const STATUSES = ['pendiente', 'preparado', 'asignado', 'en-viaje', 'entregado']
const DISPATCHES = ['propia', 'correo', 'retiro']

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

export const reportsRouter = Router()
reportsRouter.use(requireAuth)
reportsRouter.use(requireRole('encargado_deposito', 'admin'))

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

export async function send(res, task) {
  try {
    await task()
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
