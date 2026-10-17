import { Router } from 'express'
import { requireAuth, requireRole } from './middleware.js'

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

export async function send(res, task) {
  try {
    await task()
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
