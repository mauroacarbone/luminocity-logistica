import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import { authorizationsRouter } from './authorizations.js'
import { authRouter } from './auth.js'
import { ensureSchema } from './db/store.js'
import { driversRouter } from './drivers.js'
import { notificationsRouter } from './notifications.js'
import { ordersRouter } from './orders.js'
import { usersRouter } from './usersRoute.js'
import { ensureDemoUser } from './users.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en server/.env')
  process.exit(1)
}

const app = express()
const jsonLarge = express.json({ limit: '10mb' })
const jsonLocation = express.json({ limit: '2kb' })
// El front llama a /api por el proxy de Vite, así que no hace falta CORS.
// Adjuntos del pedido van en el JSON (data URL, tope 2 MB de archivo).
// 10mb alcanza para el base64 y el resto de los campos.
// La ubicación del chofer es chica: 2kb.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/drivers/location') {
    jsonLocation(req, res, next)
    return
  }
  jsonLarge(req, res, next)
})
app.use((error, req, res, next) => {
  if (error && (error.type === 'entity.too.large' || error.status === 413)) {
    const message =
      req.path === '/api/drivers/location'
        ? 'La ubicación es demasiado grande.'
        : 'El pedido es demasiado grande. Probá un adjunto más chico.'
    res.status(413).json({ message })
    return
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'No se pudo leer la solicitud.' })
    return
  }
  next(error)
})
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/authorizations', authorizationsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/drivers', driversRouter)

try {
  await ensureSchema()
} catch (error) {
  console.error('No se pudo preparar Postgres. Revisá DATABASE_URL.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

await ensureDemoUser()

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`)
})
