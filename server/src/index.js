import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import { authorizationsRouter } from './authorizations.js'
import { authRouter } from './auth.js'
import { checkDatabase, ensureSchema } from './db/store.js'
import { driversRouter } from './drivers.js'
import { denyGerencia, denyTecnico, requireAuth } from './middleware.js'
import { notificationsRouter } from './notifications.js'
import { alignOwnDriverCarrier, ordersRouter } from './orders.js'
import { claimsRouter } from './claims.js'
import { pickingRouter } from './picking.js'
import { releaseClosedSheetOrders, routeSheetsRouter } from './routeSheets.js'
import { reportsRouter } from './reports.js'
import { tripRatesRouter } from './tripRates.js'
import { usersRouter } from './usersRoute.js'
import { ensureDemoUser } from './users.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.join(root, '..')
dotenv.config({ path: path.join(root, '.env') })

const production = process.env.NODE_ENV === 'production'
const jwtSecret = String(process.env.JWT_SECRET ?? '').trim()

if (!jwtSecret) {
  console.error(
    production ? 'Falta JWT_SECRET. En producción es obligatorio.' : 'Falta JWT_SECRET en server/.env',
  )
  process.exit(1)
}

if (production && jwtSecret.length < 32) {
  console.error('JWT_SECRET tiene que tener 32 caracteres o más.')
  process.exit(1)
}

if (production && !String(process.env.DATABASE_URL ?? '').trim()) {
  console.error('Falta DATABASE_URL. En producción es obligatorio.')
  process.exit(1)
}

const app = express()
// Render termina HTTPS y manda la IP en X-Forwarded-For.
app.set('trust proxy', 1)
const jsonLarge = express.json({ limit: '10mb' })
const jsonPicking = express.json({ limit: '2mb' })
const jsonClaims = express.json({ limit: '12mb' })
const jsonLocation = express.json({ limit: '2kb' })
// El front llama a /api por el proxy de Vite, así que no hace falta CORS.
// Adjuntos del pedido van en el JSON (data URL, tope 2 MB de archivo).
// 10mb alcanza para el base64 y el resto de los campos.
// El picking importa muchas filas: tope 2 MB.
// Los reclamos llevan fotos en data URL: tope 12 MB.
// La ubicación del chofer es chica: 2kb.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/drivers/location') {
    jsonLocation(req, res, next)
    return
  }
  const lowerPath = String(req.path ?? '').toLowerCase()
  if (lowerPath === '/api/picking' || lowerPath.startsWith('/api/picking/')) {
    jsonPicking(req, res, next)
    return
  }
  if (lowerPath === '/api/claims' || lowerPath.startsWith('/api/claims/')) {
    jsonClaims(req, res, next)
    return
  }
  jsonLarge(req, res, next)
})
app.use((error, req, res, next) => {
  if (error && (error.type === 'entity.too.large' || error.status === 413)) {
    const lowerPath = String(req.path ?? '').toLowerCase()
    const message =
      req.path === '/api/drivers/location'
        ? 'La ubicación es demasiado grande.'
        : lowerPath === '/api/picking' || lowerPath.startsWith('/api/picking/')
          ? 'La importación es demasiado grande. Partí el archivo.'
          : lowerPath === '/api/claims' || lowerPath.startsWith('/api/claims/')
            ? 'El reclamo es demasiado grande. Probá con menos fotos o archivos más livianos.'
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
app.get('/api/health', async (_req, res) => {
  try {
    await checkDatabase()
    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('No se pudo verificar la base', error)
    res.status(503).json({ ok: false })
  }
})
function closeGerencia(router, { tecnico = false } = {}) {
  const gate = express.Router()
  gate.use(requireAuth, denyGerencia)
  if (!tecnico) gate.use(denyTecnico)
  gate.use(router)
  return gate
}

function closeTecnico(router) {
  const gate = express.Router()
  gate.use(requireAuth, denyTecnico)
  gate.use(router)
  return gate
}

app.use('/api/auth', authRouter)
app.use('/api/users', closeGerencia(usersRouter))
app.use('/api/authorizations', closeGerencia(authorizationsRouter))
app.use('/api/notifications', closeGerencia(notificationsRouter, { tecnico: true }))
app.use('/api/orders', closeGerencia(ordersRouter))
app.use('/api/picking', closeGerencia(pickingRouter))
app.use('/api/claims', closeGerencia(claimsRouter, { tecnico: true }))
app.use('/api/route-sheets', closeGerencia(routeSheetsRouter))
app.use('/api/trip-rates', closeGerencia(tripRatesRouter))
app.use('/api/drivers', closeGerencia(driversRouter))
app.use('/api/reports', closeTecnico(reportsRouter))
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'No existe esa ruta de la API' })
})

if (production) {
  const distDir = path.join(repoRoot, 'dist')
  const indexHtml = path.join(distDir, 'index.html')
  try {
    await access(indexHtml)
  } catch {
    console.error('Falta el build del front (dist/index.html). Corré npm run build en la raíz.')
    process.exit(1)
  }
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    res.sendFile(indexHtml)
  })
}

try {
  await ensureSchema()
} catch (error) {
  console.error('No se pudo preparar Postgres. Revisá DATABASE_URL.')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

await ensureDemoUser()
await releaseClosedSheetOrders()
await alignOwnDriverCarrier()

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`)
})
