import jwt from 'jsonwebtoken'
import { findUserById, toPublicUser } from './users.js'

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) {
    res.status(401).json({ message: 'Tenés que iniciar sesión.' })
    return
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] })
    const id = typeof payload.sub === 'string' ? payload.sub : ''
    const user = await findUserById(id)
    if (!user) {
      res.status(401).json({ message: 'La sesión no es válida.' })
      return
    }
    req.user = toPublicUser(user)
    next()
  } catch {
    res.status(401).json({ message: 'La sesión venció o no es válida.' })
  }
}

/** Listo para el Brief 15. Todavía ninguna ruta lo usa. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'No tenés permiso para esto.' })
      return
    }
    next()
  }
}
