import jwt from 'jsonwebtoken'
import { findUserById, isActive, toPublicUser } from './users.js'

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) {
    res.status(401).json({ message: 'Tenés que iniciar sesión.' })
    return
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const id = typeof payload === 'object' && payload && typeof payload.sub === 'string' ? payload.sub : ''
    const user = await findUserById(id)
    if (!user) {
      res.status(401).json({ message: 'La sesión no es válida.' })
      return
    }
    if (!isActive(user)) {
      res.status(401).json({
        message: 'Tu usuario está desactivado. Hablá con el encargado.',
        code: 'USER_INACTIVE',
      })
      return
    }
    const version = user.tokenVersion ?? 0
    const claim = typeof payload === 'object' && payload && typeof payload.ver === 'number' ? payload.ver : null
    if (claim !== version) {
      res.status(401).json({
        message: 'Tu sesión venció. Volvé a entrar.',
        code: 'SESSION_REVOKED',
      })
      return
    }
    req.user = toPublicUser(user)
    next()
  } catch {
    res.status(401).json({ message: 'La sesión venció o no es válida.' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'No tenés permiso para esto.' })
      return
    }
    next()
  }
}
