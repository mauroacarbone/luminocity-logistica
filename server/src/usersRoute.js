import { Router } from 'express'
import { requireAuth, requireRole } from './middleware.js'
import { ROLES, listUsers, setUserPhone, setUserRole, toPublicUser } from './users.js'

export const usersRouter = Router()
usersRouter.use(requireAuth)

usersRouter.get('/', requireRole('admin', 'encargado_deposito'), async (_req, res) => {
  res.json(await listUsers())
})

usersRouter.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const role = req.body?.role
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    res.status(400).json({ message: 'El rol no es válido.' })
    return
  }
  const result = await setUserRole(req.params.id, role)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  res.json(toPublicUser(result.user))
})

usersRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const raw = req.body?.phone
  if (raw !== null && typeof raw !== 'string') {
    res.status(400).json({ message: 'El celular no es válido.' })
    return
  }
  const phone = typeof raw === 'string' ? raw.trim() : ''
  if (phone.length > 40) {
    res.status(400).json({ message: 'El celular es demasiado largo.' })
    return
  }
  const result = await setUserPhone(req.params.id, phone)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  res.json(toPublicUser(result.user))
})
