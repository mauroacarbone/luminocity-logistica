import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { authRouter } from './auth.js'
import { ensureDemoUser } from './users.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en server/.env')
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json())
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'No se pudo leer la solicitud.' })
    return
  }
  next(error)
})
app.use('/api/auth', authRouter)

await ensureDemoUser()

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`Auth escuchando en http://localhost:${port}`)
})
