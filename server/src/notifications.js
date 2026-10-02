import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import { normalizeName } from './access.js'
import { locked } from './lock.js'
import { requireAuth } from './middleware.js'
import { readUsersList } from './users.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const notificationsFile = path.join(dataDir, 'notifications.json')

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', async (req, res) => {
  const list = await locked(() => readNotifications())
  const mine = list.filter((item) => item.to === req.user.id)
  res.json(byNewest(mine))
})

notificationsRouter.patch('/:id/read', async (req, res) => {
  const result = await markRead(req.params.id, req.user.id)
  if (result.error) {
    res.status(result.status).json({ message: result.error })
    return
  }
  res.json(result.notification)
})

function byNewest(list) {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function readNotifications() {
  try {
    const raw = await readFile(notificationsFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

async function writeNotifications(list) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(notificationsFile, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
}

function markRead(id, userId) {
  return locked(async () => {
    const list = await readNotifications()
    const index = list.findIndex((item) => item.id === id && item.to === userId)
    if (index < 0) return { error: 'No existe ese aviso.', status: 404 }
    const notification = { ...list[index], read: true }
    list[index] = notification
    await writeNotifications(list)
    return { notification }
  })
}

function buildNote({ to, text, orderId, channel, status }) {
  const note = {
    id: randomUUID(),
    to,
    text,
    orderId,
    read: false,
    createdAt: new Date().toISOString(),
    channel,
  }
  if (status) note.status = status
  return note
}

async function pushNotifications(items) {
  if (items.length === 0) return
  const list = await readNotifications()
  list.push(...items)
  await writeNotifications(list)
}

/** Se llama dentro del lock de pedidos. */
export async function notifyEncargados({ text, orderId, whatsapp }) {
  const encargados = (await readUsersList()).filter((user) => user.role === 'encargado_deposito')
  const items = []
  for (const user of encargados) {
    items.push(buildNote({ to: user.id, text, orderId, channel: 'app' }))
    if (whatsapp && typeof user.phone === 'string' && user.phone.trim()) {
      items.push(
        buildNote({
          to: user.id,
          text,
          orderId,
          channel: 'whatsapp',
          status: 'pendiente',
        }),
      )
    }
  }
  await pushNotifications(items)
}

/** Se llama dentro del lock de pedidos. */
export async function notifyUser(userId, { text, orderId }) {
  await pushNotifications([buildNote({ to: userId, text, orderId, channel: 'app' })])
}

/** Se llama dentro del lock de pedidos. Avisa al vendedor del pedido. */
export async function notifySeller(order, editor, text) {
  const users = await readUsersList()
  const bySeller = users.find(
    (user) =>
      user.role === 'vendedor' && normalizeName(user.sellerName) === normalizeName(order.seller),
  )
  const target =
    bySeller ?? users.find((user) => user.id === order.createdBy && user.role === 'vendedor')
  if (!target || target.id === editor.id) return
  await pushNotifications([
    buildNote({ to: target.id, text, orderId: order.id, channel: 'app' }),
  ])
}
