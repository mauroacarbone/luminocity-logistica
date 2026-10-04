import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { requireAuth } from './middleware.js'
import { authenticate, createUser, toPublicUser } from './users.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_EXPIRES = '8h'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ message: 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.' })
  },
})

export const authRouter = Router()

function sign(user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES,
  })
  return { token, user: toPublicUser(user) }
}

authRouter.post('/register', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      message: 'El registro no está disponible. Pedile al administrador que cree tu usuario.',
    })
    return
  }
  const body = req.body ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!name) {
    res.status(400).json({ message: 'Ingresá tu nombre.' })
    return
  }
  if (!EMAIL.test(email)) {
    res.status(400).json({ message: 'Ingresá un email válido.' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'Usá al menos 6 caracteres.' })
    return
  }

  const result = await createUser({ name, email, password, role: 'vendedor' })
  if (result.error === 'email') {
    res.status(409).json({ message: 'Ya hay una cuenta con ese email.', field: 'email' })
    return
  }
  if (result.error === 'name') {
    res.status(409).json({ message: 'Ya hay una cuenta con ese nombre.', field: 'name' })
    return
  }
  res.status(201).json(sign(result.user))
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const body = req.body ?? {}
  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const found = await authenticate(email, password)
  if (found.error === 'inactive') {
    res.status(403).json({ message: 'Tu usuario está desactivado. Hablá con el encargado.' })
    return
  }
  if (!found.user) {
    res.status(401).json({ message: 'Email o contraseña incorrectos.' })
    return
  }
  res.json(sign(found.user))
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})
