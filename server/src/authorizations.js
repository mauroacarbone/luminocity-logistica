import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { normalizeName } from './access.js'
import { locked } from './lock.js'
import { requireAuth, requireRole } from './middleware.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const authorizationsFile = path.join(dataDir, 'authorizations.json')

export const authorizationsRouter = Router()
authorizationsRouter.use(requireAuth)

authorizationsRouter.get('/', async (req, res) => {
  if (!['vendedor', 'encargado_deposito', 'admin'].includes(req.user.role)) {
    res.status(403).json({ message: 'No tenés permiso para ver autorizaciones.' })
    return
  }
  const list = await readAuthorizations()
  const visible =
    req.user.role === 'vendedor' ? list.filter((item) => item.requestedBy === req.user.id) : list
  res.json(byNewest(visible))
})

authorizationsRouter.post('/', requireRole('vendedor'), async (req, res) => {
  const result = await requestAuthorization(req.user, req.body?.seller)
  if (result.error) {
    res.status(result.status).json({ message: result.error })
    return
  }
  res.status(201).json(result.authorization)
})

authorizationsRouter.patch('/:id', requireRole('encargado_deposito', 'admin'), async (req, res) => {
  const result = await resolveAuthorization(req.params.id, req.body?.status, req.user.id)
  if (result.error) {
    res.status(result.status).json({ message: result.error })
    return
  }
  res.json(result.authorization)
})

function byNewest(list) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function readAuthorizations() {
  try {
    const raw = await readFile(authorizationsFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeAuthorizations(list) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(authorizationsFile, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
}

function requestAuthorization(user, seller) {
  return locked(async () => {
    if (typeof seller !== 'string' || !seller.trim()) {
      return { error: 'Indicá el vendedor.', status: 400 }
    }
    const name = seller.trim()
    if (normalizeName(name) === normalizeName(user.name)) {
      return { error: 'No hace falta autorización para cargar a tu nombre.', status: 400 }
    }
    const list = await readAuthorizations()
    const open = list.find(
      (item) =>
        item.requestedBy === user.id &&
        normalizeName(item.seller) === normalizeName(name) &&
        (item.status === 'pendiente' || item.status === 'aprobada'),
    )
    if (open) {
      return { error: 'Ya hay una autorización pendiente o aprobada para ese vendedor.', status: 400 }
    }
    const authorization = {
      id: randomUUID(),
      requestedBy: user.id,
      seller: name,
      status: 'pendiente',
      createdAt: new Date().toISOString(),
    }
    list.push(authorization)
    await writeAuthorizations(list)
    return { authorization }
  })
}

function resolveAuthorization(id, status, userId) {
  return locked(async () => {
    if (status !== 'aprobada' && status !== 'rechazada') {
      return { error: 'Indicá si aprobás o rechazás la autorización.', status: 400 }
    }
    const list = await readAuthorizations()
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) return { error: 'No existe esa autorización.', status: 404 }
    if (list[index].status !== 'pendiente') {
      return { error: 'Esa autorización ya fue resuelta.', status: 400 }
    }
    const authorization = {
      ...list[index],
      status,
      resolvedBy: userId,
      resolvedAt: new Date().toISOString(),
    }
    list[index] = authorization
    await writeAuthorizations(list)
    return { authorization }
  })
}

/** Se llama dentro del lock de pedidos. Marca usada la aprobación más vieja. */
export async function takeAuthorization(userId, seller, orderId) {
  const list = await readAuthorizations()
  const index = list.findIndex(
    (item) =>
      item.requestedBy === userId &&
      item.status === 'aprobada' &&
      normalizeName(item.seller) === normalizeName(seller),
  )
  if (index < 0) return null
  const authorization = {
    ...list[index],
    status: 'usada',
    usedAt: new Date().toISOString(),
    orderId,
  }
  list[index] = authorization
  await writeAuthorizations(list)
  return authorization
}
