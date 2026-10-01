import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import { authRouter } from './auth.js'
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
// El front llama a /api por el proxy de Vite, así que no hace falta CORS.
// Adjuntos del pedido van en el JSON (data URL, tope 2 MB de archivo).
// 10mb alcanza para el base64 y el resto de los campos.
app.use(express.json({ limit: '10mb' }))
app.use((error, _req, res, next) => {
  if (error && (error.type === 'entity.too.large' || error.status === 413)) {
    res.status(413).json({
      message: 'El pedido es demasiado grande. Probá un adjunto más chico.',
    })
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
app.use('/api/orders', ordersRouter)

await ensureDemoUser()

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`)
})
