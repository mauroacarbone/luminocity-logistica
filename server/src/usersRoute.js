import { Router } from 'express'
import { sign } from './auth.js'
import { requireAuth, requireRole } from './middleware.js'
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  ROLES,
  canManageUser,
  createUser,
  listUsers,
  setUserActive,
  setUserPassword,
  setUserRole,
  toPublicUser,
  updateUserDetails,
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

usersRouter.get('/', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const users = await listUsers()
  if (req.user.role === 'encargado_deposito') {
    res.json(users.filter((user) => user.role !== 'admin'))
    return
  }
  res.json(users)
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
  if (password.length < PASSWORD_MIN) {
    res.status(400).json({ message: `Usá al menos ${PASSWORD_MIN} caracteres.` })
    return
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    res.status(400).json({ message: 'La contraseña es demasiado larga' })
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
  })
  if (result.error === 'email') {
    res.status(409).json({ message: 'Ya existe un usuario con ese email' })
    return
  }
  if (result.error === 'name') {
    res.status(409).json({ message: 'Ya existe un usuario con ese nombre' })
    return
  }
  if (result.error === 'driver-name') {
    res.status(409).json({ message: 'Ya existe un chofer con ese nombre' })
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
  const result = await setUserRole(req.params.id, role, req.user)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'forbidden') {
    res.status(result.status).json({ message: result.message })
    return
  }
  if (result.error === 'last-admin') {
    res.status(409).json({ message: 'Tiene que quedar al menos un administrador activo' })
    return
  }
  if (result.error === 'driver-name') {
    res.status(409).json({ message: 'Ya existe un chofer con ese nombre' })
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
  const result = await setUserActive(req.params.id, active, req.user)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'forbidden') {
    res.status(result.status).json({ message: result.message })
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
  if (result.error === 'driver-name') {
    res.status(409).json({ message: 'Ya existe un chofer con ese nombre' })
    return
  }
  res.json(toPublicUser(result.user))
})

usersRouter.patch('/:id/password', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const password = req.body?.password
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    res.status(400).json({ message: `Usá al menos ${PASSWORD_MIN} caracteres.` })
    return
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    res.status(400).json({ message: 'La contraseña es demasiado larga' })
    return
  }
  const result = await setUserPassword(req.params.id, password, req.user)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'forbidden') {
    res.status(result.status).json({ message: result.message })
    return
  }
  const body = toPublicUser(result.user)
  if (req.user.id === result.user.id) {
    res.json({ ...body, token: sign(result.user).token })
    return
  }
  res.json(body)
})

usersRouter.patch('/:id', requireRole('admin', 'encargado_deposito'), async (req, res) => {
  const body = req.body ?? {}
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name')
  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email')
  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone')
  const hasSeller = Object.prototype.hasOwnProperty.call(body, 'sellerName')
  const hasCarrier = Object.prototype.hasOwnProperty.call(body, 'carrierName')
  if (!hasName && !hasEmail && !hasPhone && !hasSeller && !hasCarrier) {
    res.status(400).json({ message: 'No hay cambios para guardar.' })
    return
  }
  const fields = {}
  if (hasName) {
    if (typeof body.name !== 'string') {
      res.status(400).json({ message: 'El nombre no es válido.' })
      return
    }
    const name = body.name.trim()
    if (!name) {
      res.status(400).json({ message: 'Ingresá el nombre.' })
      return
    }
    if (name.length > 80) {
      res.status(400).json({ message: 'El nombre es demasiado largo.' })
      return
    }
    fields.name = name
  }
  if (hasEmail) {
    if (typeof body.email !== 'string' || !EMAIL.test(body.email.trim())) {
      res.status(400).json({ message: 'Ingresá un email válido.' })
      return
    }
    fields.email = body.email.trim()
  }
  if (hasPhone) {
    const raw = body.phone
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El celular no es válido.' })
      return
    }
    const phone = typeof raw === 'string' ? raw.trim() : ''
    if (phone.length > 40) {
      res.status(400).json({ message: 'El celular es demasiado largo.' })
      return
    }
    fields.phone = phone
  }
  if (hasSeller) {
    const raw = body.sellerName
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El vendedor no es válido.' })
      return
    }
    const sellerName = typeof raw === 'string' ? raw.trim() : ''
    if (sellerName.length > 80) {
      res.status(400).json({ message: 'El vendedor es demasiado largo.' })
      return
    }
    fields.sellerName = sellerName
  }
  if (hasCarrier) {
    const raw = body.carrierName
    if (raw !== null && typeof raw !== 'string') {
      res.status(400).json({ message: 'El transportista no es válido.' })
      return
    }
    const carrierName = typeof raw === 'string' ? raw.trim() : ''
    if (carrierName.length > 80) {
      res.status(400).json({ message: 'El transportista es demasiado largo.' })
      return
    }
    fields.carrierName = carrierName
  }

  const result = await updateUserDetails(req.params.id, fields, req.user)
  if (result.error === 'missing') {
    res.status(404).json({ message: 'No existe ese usuario.' })
    return
  }
  if (result.error === 'forbidden') {
    res.status(result.status).json({ message: result.message })
    return
  }
  if (result.error === 'email') {
    res.status(409).json({ message: 'Ya existe un usuario con ese email' })
    return
  }
  if (result.error === 'name') {
    res.status(409).json({ message: 'Ya existe un usuario con ese nombre' })
    return
  }
  if (result.error === 'driver-name') {
    res.status(409).json({ message: 'Ya existe un chofer con ese nombre' })
    return
  }
  res.json(toPublicUser(result.user))
})
