import { Router } from 'express'
import { listLiveDrivers, updateDriverLocation } from './orders.js'
import { forgetUsers } from './locations.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'

const MIN_POST_MS = 20_000
const lastPostAt = new Map()

export const driversRouter = Router()
driversRouter.use(requireAuth)

driversRouter.post('/location', requireRole('chofer'), async (req, res) => {
  const point = readPoint(req.body)
  if (point.error) {
    res.status(point.status).json({ message: point.error })
    return
  }
  const now = Date.now()
  const previous = lastPostAt.get(req.user.id) ?? 0
  if (now - previous < MIN_POST_MS) {
    res.status(204).end()
    return
  }
  lastPostAt.set(req.user.id, now)
  try {
    const result = await updateDriverLocation(req.user, point.value)
    if (result.error) {
      res.status(result.status).json({ message: result.error })
      return
    }
    res.status(204).end()
  } catch {
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo guardar la ubicación.' })
  }
})

driversRouter.delete('/location', requireRole('chofer'), async (req, res) => {
  try {
    await locked(() => forgetUsers([req.user.id]))
    res.status(204).end()
  } catch {
    if (!res.headersSent) res.status(500).json({ message: 'No se pudo borrar la ubicación.' })
  }
})

driversRouter.get('/locations', requireRole('encargado_deposito', 'admin'), async (_req, res) => {
  try {
    res.json(await listLiveDrivers())
  } catch {
    if (!res.headersSent) res.status(500).json({ message: 'No se pudieron leer las ubicaciones.' })
  }
})

function readPoint(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'La ubicación no es válida.', status: 400 }
  }
  const lat = body.lat
  const lng = body.lng
  const timestamp = body.timestamp
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { error: 'La latitud no es válida.', status: 400 }
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { error: 'La longitud no es válida.', status: 400 }
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return { error: 'La marca de tiempo no es válida.', status: 400 }
  }
  let accuracy = null
  if (Object.prototype.hasOwnProperty.call(body, 'accuracy') && body.accuracy !== null) {
    if (typeof body.accuracy !== 'number' || !Number.isFinite(body.accuracy) || body.accuracy < 0) {
      return { error: 'La precisión no es válida.', status: 400 }
    }
    accuracy = body.accuracy
  }
  return { value: { lat, lng, accuracy, timestamp } }
}
