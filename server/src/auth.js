import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth } from './middleware.js'
import { authenticate, createUser, toPublicUser } from './users.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_EXPIRES = '8h'

export const authRouter = Router()

function sign(user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES,
  })
  return { token, user: toPublicUser(user) }
}

authRouter.post('/register', async (req, res) => {
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
  if (result.error === 'exists') {
    res.status(409).json({ message: 'Ya hay una cuenta con ese email.' })
    return
  }
  res.status(201).json(sign(result.user))
})

authRouter.post('/login', async (req, res) => {
  const body = req.body ?? {}
  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const user = await authenticate(email, password)
  if (!user) {
    res.status(401).json({ message: 'Email o contraseña incorrectos.' })
    return
  }
  res.json(sign(user))
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})
