import { createHash } from 'node:crypto'
import { Router } from 'express'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const tripRatesRouter = Router()
tripRatesRouter.use(requireAuth)
tripRatesRouter.use(requireRole('encargado_deposito', 'admin'))

tripRatesRouter.get('/', async (req, res) => {
  await send(res, async () => {
    const rates = await locked(() => readCollection('tripRates'))
    res.json(rates.filter(isRate).sort(byZoneDate))
  })
})

tripRatesRouter.put('/', async (req, res) => {
  await send(res, async () => {
    const parsed = readRate(req.body ?? {})
    if (parsed.error) {
      res.status(parsed.status).json({ message: parsed.error })
      return
    }
    const saved = await locked(() => saveRate(parsed.rate, req.user))
    res.status(saved.created ? 201 : 200).json(saved.rate)
  })
})

/** Monto y tarifa vigentes ese día. Sin tarifa, amount y rateId quedan en null. */
export function quoteTripDetail(rates, trip) {
  const list = Array.isArray(rates) ? rates.filter(isRate) : []
  const zones = Array.isArray(trip?.zones) ? trip.zones : []
  const date = typeof trip?.date === 'string' ? trip.date : ''
  const km = typeof trip?.km === 'number' && Number.isFinite(trip.km) ? trip.km : 0
  let best = null
  let rateId = null
  for (const zone of zones) {
    const rate = rateOn(list, zone, date)
    if (!rate) continue
    const perKm = rate.perKm == null ? 0 : rate.perKm
    const amount = roundMoney(rate.perTrip + perKm * km)
    if (best == null || amount > best) {
      best = amount
      rateId = rate.id
    }
  }
  return { amount: best, rateId }
}

/** Monto del viaje según la tarifa vigente ese día. Sin tarifa, null. */
export function quoteTrip(rates, trip) {
  return quoteTripDetail(rates, trip).amount
}

function rateOn(rates, zone, date) {
  let best = null
  for (const rate of rates) {
    if (rate.zone !== zone || rate.effectiveFrom > date) continue
    if (!best || rate.effectiveFrom > best.effectiveFrom) best = rate
  }
  return best
}

async function saveRate(input, user) {
  const rates = await readCollection('tripRates')
  const id = rateId(input.zone, input.effectiveFrom)
  const now = new Date().toISOString()
  const index = rates.findIndex(
    (item) => item && (item.id === id || (item.zone === input.zone && item.effectiveFrom === input.effectiveFrom)),
  )
  const current = index >= 0 && isRate(rates[index]) ? rates[index] : null
  const rate = {
    id,
    zone: input.zone,
    effectiveFrom: input.effectiveFrom,
    perTrip: input.perTrip,
    perKm: input.perKm,
    createdBy: current?.createdBy ?? user.id,
    createdAt: current?.createdAt ?? now,
    updatedBy: user.id,
    updatedAt: now,
  }
  const next = index >= 0 ? rates.map((item, at) => (at === index ? rate : item)) : [...rates, rate]
  await writeCollection('tripRates', next)
  return { rate, created: index < 0 }
}

function readRate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('La tarifa no es válida.')
  const zone = typeof body.zone === 'string' ? body.zone.trim() : ''
  if (!zone) return fail('Elegí una zona.')
  if (zone.length > 80) return fail('La zona es demasiado larga.')
  const effectiveFrom = typeof body.effectiveFrom === 'string' ? body.effectiveFrom : ''
  if (!isDate(effectiveFrom)) return fail('La fecha de vigencia no es válida.')
  const perTrip = readMoney(body.perTrip, 'El monto por viaje')
  if (perTrip.error) return perTrip
  const perKm = readOptionalMoney(body.perKm)
  if (perKm.error) return perKm
  return {
    rate: {
      zone,
      effectiveFrom,
      perTrip: perTrip.value,
      perKm: perKm.value,
    },
  }
}

function readMoney(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail(`${label} tiene que ser un número mayor o igual a 0.`)
  }
  if (value > 100000000) return fail(`${label} es demasiado alto.`)
  return { value: roundMoney(value) }
}

function readOptionalMoney(value) {
  if (value === undefined || value === null || value === '') return { value: null }
  const money = readMoney(value, 'El monto por km')
  if (money.error) return money
  return { value: money.value }
}

function isRate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (typeof value.zone !== 'string' || !value.zone.trim()) return false
  if (!isDate(value.effectiveFrom)) return false
  if (typeof value.perTrip !== 'number' || !Number.isFinite(value.perTrip) || value.perTrip < 0) return false
  if (value.perKm != null && (typeof value.perKm !== 'number' || !Number.isFinite(value.perKm) || value.perKm < 0)) {
    return false
  }
  return true
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function rateId(zone, effectiveFrom) {
  const hash = createHash('sha256').update(`${zone}\n${effectiveFrom}`).digest('hex').slice(0, 16)
  return `TR-${hash}`
}

function byZoneDate(left, right) {
  const byZone = left.zone.localeCompare(right.zone, 'es')
  if (byZone !== 0) return byZone
  return right.effectiveFrom.localeCompare(left.effectiveFrom)
}

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

function fail(error, status = 400) {
  return { error, status }
}

async function send(res, task) {
  try {
    await task()
  } catch (error) {
    const req = res.req
    console.error(req?.method, req?.originalUrl ?? req?.url, error)
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo completar la operación.' })
  }
}
