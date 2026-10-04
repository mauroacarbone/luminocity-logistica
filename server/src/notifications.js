import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { normalizeName } from './access.js'
import { readCollection, writeCollection } from './db/store.js'
import { locked } from './lock.js'
import { requireAuth } from './middleware.js'
import { readUsersList } from './users.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

const WHATSAPP_INBOX = 'encargados'

notificationsRouter.get('/', async (req, res) => {
  const list = await locked(() => readNotifications())
  const shared = canSendWhatsapp(req.user)
  const mine = list.filter(
    (item) => item.to === req.user.id || (shared && item.channel === 'whatsapp' && item.to === WHATSAPP_INBOX),
  )
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

notificationsRouter.patch('/:id/sent', async (req, res) => {
  const result = await markSent(req.params.id, req.user)
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
  return readCollection('notifications')
}

async function writeNotifications(list) {
  await writeCollection('notifications', list)
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

function markSent(id, user) {
  return locked(async () => {
    if (!canSendWhatsapp(user)) {
      return { error: 'No tenés permiso para enviar este aviso.', status: 403 }
    }
    const list = await readNotifications()
    const index = list.findIndex(
      (item) => item.id === id && (item.to === user.id || item.to === WHATSAPP_INBOX),
    )
    if (index < 0) return { error: 'No existe ese aviso.', status: 404 }
    const current = list[index]
    if (current.channel !== 'whatsapp' || current.status !== 'pendiente') {
      return { error: 'Ese aviso ya no está pendiente.', status: 400 }
    }
    const notification = { ...current, status: 'enviado' }
    list[index] = notification
    await writeNotifications(list)
    return { notification }
  })
}

function buildNote({ to, text, orderId, channel, status, phone }) {
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
  if (typeof phone === 'string' && phone.trim()) note.phone = phone.trim()
  return note
}

async function pushNotifications(items) {
  if (items.length === 0) return
  const list = await readNotifications()
  list.push(...items)
  await writeNotifications(list)
}

function canSendWhatsapp(user) {
  return user.role === 'encargado_deposito' || user.role === 'admin'
}

/** Se llama dentro del lock de pedidos. */
export async function notifyEncargados({ text, orderId, whatsapp, phone }) {
  const encargados = (await readUsersList()).filter((user) => user.role === 'encargado_deposito')
  const items = encargados.map((user) => buildNote({ to: user.id, text, orderId, channel: 'app' }))
  if (whatsapp) items.push(whatsappNote({ text, orderId, phone }))
  await pushNotifications(items)
}

/** Se llama dentro del lock de pedidos. */
export async function notifyUser(userId, { text, orderId }) {
  await pushNotifications([buildNote({ to: userId, text, orderId, channel: 'app' })])
}

/** Se llama dentro del lock de pedidos. Avisa al vendedor del pedido. */
export async function notifySeller(order, editor, text) {
  const target = sellerUser(await readUsersList(), order)
  if (!target || target.id === editor.id) return
  await pushNotifications([
    buildNote({ to: target.id, text, orderId: order.id, channel: 'app' }),
  ])
}

function sellerUser(users, order) {
  const bySeller = users.find(
    (user) =>
      user.role === 'vendedor' && normalizeName(user.sellerName) === normalizeName(order.seller),
  )
  return bySeller ?? users.find((user) => user.id === order.createdBy && user.role === 'vendedor')
}

function whatsappNote({ text, orderId, phone }) {
  return buildNote({
    to: WHATSAPP_INBOX,
    text,
    orderId,
    channel: 'whatsapp',
    status: 'pendiente',
    phone,
  })
}

/** Se llama dentro del lock de pedidos. Aviso in-app al vendedor y un WhatsApp para los encargados. */
export async function notifyDelivered(order) {
  const seller = sellerUser(await readUsersList(), order)
  if (!seller) return
  const phone = typeof seller.phone === 'string' ? seller.phone.trim() : ''
  const text = `Tu pedido ${order.id} fue entregado.`
  await pushNotifications([
    buildNote({ to: seller.id, text, orderId: order.id, channel: 'app' }),
    whatsappNote({ text, orderId: order.id, phone }),
  ])
}
