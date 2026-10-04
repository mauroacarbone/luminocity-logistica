import { Router } from 'express'
import { requireAuth, requireRole } from './middleware.js'
import {
  ROLES,
  canManageUser,
  createUser,
  findUserById,
  listUsers,
  setUserActive,
  setUserCarrierName,
  setUserPhone,
  setUserRole,
  setUserSellerName,
  toPublicUser,
} from './users.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const usersRouter = Router()
usersRouter.use(requireAuth)

function forbid(res, actor, target, changes) {
  const permission = canManageUser(actor, target, changes)
  if (permission.ok) return false
  res.status(permission.status).json({ message: permission.message })
  return true
}

async function targetOf(req, res) {
  const target = await findUserById(req.params.id)
  if (!target) {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return null
  }
  return target
}

usersRouter.get('/', requireRole('admin', 'encargado_deposito'), async (_req, res) => {
  res.json(await listUsers())
})

usersRouter.post('/', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const body = req.body ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role

  if (!name) {
    res.status(400).json({ message: 'Ingresá el nombre.' })
    return
  }
  if (name.length > 80) {
    res.status(400).json({ message: 'El nombre es demasiado largo.' })
    return
  }
  if (!EMAIL.test(email)) {
    res.status(400).json({ message: 'Ingresá un email válido.' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ message: 'Usá al menos 8 caracteres.' })
    return
  }
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    res.status(400).json({ message: 'El rol no es válido.' })
    return
  }
  if (forbid(res, req.user, null, { role })) return

  let sellerName = ''
  if (role === 'vendedor' && body.sellerName != null) {
    if (typeof body.sellerName !== 'string') {
      res.status(400).json({ message: 'El vendedor no es válido.' })
      return
    }
    sellerName = body.sellerName.trim()
    if (sellerName.length > 80) {
      res.status(400).json({ message: 'El vendedor es demasiado largo.' })
      return
    }
  }

  let carrierName = ''
  if (role === 'chofer' && body.carrierName != null) {
    if (typeof body.carrierName !== 'string') {
      res.status(400).json({ message: 'El transportista no es válido.' })
      return
    }
    carrierName = body.carrierName.trim()
    if (carrierName.length > 80) {
      res.status(400).json({ message: 'El transportista es demasiado largo.' })
      return
    }
  }

  const result = await createUser({
    name,
    email,
    password,
    role,
    sellerName,
    carrierName,
    allowDuplicateName: true,
  })
  if (result.error === 'email') {
    res.status(409).json({ message: 'Ya existe un usuario con ese email' })
    return
  }
  res.status(201).json(toPublicUser(result.user))
})

usersRouter.patch('/:id/role', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const role = req.body?.role
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    res.status(400).json({ message: 'El rol no es válido.' })
    return
  }
  const target = await targetOf(req, res)
  if (!target) return
  if (forbid(res, req.user, target, { role })) return
  const result = await setUserRole(req.params.id, role)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'last-admin') {
    res.status(409).json({ message: 'Tiene que quedar al menos un administrador activo' })
    return
  }
  res.json(toPublicUser(result.user))
})

usersRouter.patch('/:id/active', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const active = req.body?.active
  if (typeof active !== 'boolean') {
    res.status(400).json({ message: 'El estado no es válido.' })
    return
  }
  const target = await targetOf(req, res)
  if (!target) return
  if (forbid(res, req.user, target, { active })) return
  const result = await setUserActive(req.params.id, active, req.user.id)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'self') {
    res.status(409).json({ message: 'No podés desactivar tu propio usuario' })
    return
  }
  if (result.error === 'last-admin') {
    res.status(409).json({ message: 'Tiene que quedar al menos un administrador activo' })
    return
  }
  res.json(toPublicUser(result.user))
})

usersRouter.patch('/:id', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const body = req.body ?? {}
  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone')
  const hasSeller = Object.prototype.hasOwnProperty.call(body, 'sellerName')
  const hasCarrier = Object.prototype.hasOwnProperty.call(body, 'carrierName')
  if (!hasPhone && !hasSeller && !hasCarrier) {
    res.status(400).json({ message: 'No hay cambios para guardar.' })
    return
  }
  const target = await targetOf(req, res)
  if (!target) return
  if (forbid(res, req.user, target, {})) return

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
