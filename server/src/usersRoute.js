import { Router } from 'express'
import { requireAuth, requireRole } from './middleware.js'
import {
  ROLES,
  listUsers,
  setUserCarrierName,
  setUserPhone,
  setUserRole,
  setUserSellerName,
  toPublicUser,
} from './users.js'

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
  if (result.error === 'last-admin') {
    res.status(403).json({ message: 'No podés quitar el rol al último administrador.' })
    return
  }
  res.json(toPublicUser(result.user))
})

usersRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const body = req.body ?? {}
  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone')
  const hasSeller = Object.prototype.hasOwnProperty.call(body, 'sellerName')
  const hasCarrier = Object.prototype.hasOwnProperty.call(body, 'carrierName')
  if (!hasPhone && !hasSeller && !hasCarrier) {
    res.status(400).json({ message: 'No hay cambios para guardar.' })
    return
  }

  let phone = ''
  if (hasPhone) {
    const raw = body.phone
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El celular no es válido.' })
      return
    }
    phone = typeof raw === 'string' ? raw.trim() : ''
    if (phone.length > 40) {
      res.status(400).json({ message: 'El celular es demasiado largo.' })
      return
    }
  }

  let sellerName = ''
  if (hasSeller) {
    const raw = body.sellerName
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El vendedor no es válido.' })
      return
    }
    sellerName = typeof raw === 'string' ? raw.trim() : ''
    if (sellerName.length > 80) {
      res.status(400).json({ message: 'El vendedor es demasiado largo.' })
      return
    }
  }

  let carrierName = ''
  if (hasCarrier) {
    const raw = body.carrierName
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El transportista no es válido.' })
      return
    }
    carrierName = typeof raw === 'string' ? raw.trim() : ''
    if (carrierName.length > 80) {
      res.status(400).json({ message: 'El transportista es demasiado largo.' })
      return
    }
  }

  let result
  if (hasPhone) {
    result = await setUserPhone(req.params.id, phone)
    if (result.error === 'missing') {
      res.status(404).json({ message: 'No existe ese usuario.' })
      return
    }
  }
  if (hasSeller) {
    result = await setUserSellerName(req.params.id, sellerName)
    if (result.error === 'missing') {
      res.status(404).json({ message: 'No existe ese usuario.' })
      return
    }
  }
  if (hasCarrier) {
    result = await setUserCarrierName(req.params.id, carrierName)
    if (result.error === 'missing') {
      res.status(404).json({ message: 'No existe ese usuario.' })
      return
    }
  }
  res.json(toPublicUser(result.user))
})
