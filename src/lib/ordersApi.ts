import type { Order } from '../data/orders'
import { loadToken } from './authStore'

export type OrderDraft = Omit<Order, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'> & {
  items?: ManualItemInput[]
}

export type ApiSuccess = { ok: true; data: unknown }
export type SlotFull = {
  driver: string
  deliveryDate: string
  timeWindow: string
  count: number
}
export type ApiFailure = {
  ok: false
  status: number
  message: string
  code?: string
  slot?: SlotFull
  field?: 'code' | 'description' | 'quantity'
}
export type ApiResult = ApiSuccess | ApiFailure

const TEXT_FIELDS = [
  'zone',
  'amount',
  'timeWindow',
  'transporter',
  'notes',
  'attachmentName',
  'attachmentDataUrl',
  'receiverName',
  'receiverDni',
  'betweenStreet1',
  'betweenStreet2',
  'floor',
  'unit',
  'doorbell',
] as const

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function codeFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('code' in data)) return undefined
  const code = data.code
  return typeof code === 'string' && code.trim() ? code : undefined
}

function fieldFrom(data: unknown) {
  if (!data || typeof data !== 'object' || !('field' in data)) return undefined
  const field = data.field
  if (field === 'code' || field === 'description' || field === 'quantity') return field
  return undefined
}

function slotFrom(data: unknown): SlotFull | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  if (record.code !== 'FRANJA_LLENA') return undefined
  if (typeof record.driver !== 'string' || !record.driver.trim()) return undefined
  if (typeof record.deliveryDate !== 'string' || typeof record.timeWindow !== 'string') return undefined
  if (typeof record.count !== 'number') return undefined
  return {
    driver: record.driver,
    deliveryDate: record.deliveryDate,
    timeWindow: record.timeWindow,
    count: record.count,
  }
}

function fallbackFor(status: number, fallback: string) {
  if (status === 401) return 'Tenés que iniciar sesión.'
  if (status === 403) return 'No tenés permiso para esto.'
  if (status === 404) return 'No existe ese pedido.'
  if (status === 413) return 'El pedido es demasiado grande. Probá un adjunto más chico.'
  return fallback
}

async function request(path: string, method: string, body: unknown, fallback: string): Promise<ApiResult> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401, message: 'Tenés que iniciar sesión.' }

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' }
  }

  if (response.status === 204) return { ok: true, data: null }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: messageFrom(data, fallbackFor(response.status, fallback)),
      code: codeFrom(data),
      slot: slotFrom(data),
      field: fieldFrom(data),
    }
  }
  return { ok: true, data }
}

export function listOrders() {
  return request('/api/orders', 'GET', undefined, 'No se pudieron cargar los pedidos.')
}

export function getOrder(id: string) {
  return request(
    `/api/orders/${encodeURIComponent(id)}`,
    'GET',
    undefined,
    'No se pudo cargar el pedido.',
  )
}

export function createOrder(body: Record<string, unknown>) {
  return request('/api/orders', 'POST', body, 'No se pudo crear el pedido.')
}

export function patchOrder(id: string, body: Record<string, unknown>) {
  return request(`/api/orders/${encodeURIComponent(id)}`, 'PATCH', body, 'No se pudo guardar el pedido.')
}

export function transitionOrder(id: string, body: Record<string, unknown>) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/transition`,
    'POST',
    body,
    'No se pudo cambiar el estado del pedido.',
  )
}

export function takeOrder(id: string) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/take`,
    'POST',
    {},
    'No se pudo tomar el pedido.',
  )
}

export function releaseOrder(id: string) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/release`,
    'POST',
    {},
    'No se pudo liberar el pedido.',
  )
}

export type ManualItemInput = {
  code: string
  description?: string
  quantity: number
  internalCode?: string
}

export function addOrderItem(id: string, body: ManualItemInput) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/items`,
    'POST',
    body,
    'No se pudo agregar el artículo.',
  )
}

export function addOrderItemsBatch(
  id: string,
  body: { mode: 'replace' | 'merge'; items: ManualItemInput[] },
) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/items/batch`,
    'POST',
    body,
    'No se pudieron cargar los artículos.',
  )
}

export function updateOrderItem(id: string, itemId: string, body: Partial<ManualItemInput>) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
    'PATCH',
    body,
    'No se pudo editar el artículo.',
  )
}

export function deleteOrderItem(id: string, itemId: string) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
    'DELETE',
    undefined,
    'No se pudo quitar el artículo.',
  )
}

export function sendPickupNotice(id: string) {
  return request(
    `/api/orders/${encodeURIComponent(id)}/pickup-notice`,
    'POST',
    {},
    'No se pudo registrar el aviso de retiro.',
  )
}

export function reviewOrderEdit(
  id: string,
  editId: string,
  status: 'aplicada' | 'rechazada',
  override = false,
) {
  const body: Record<string, unknown> = { status }
  if (override) body.override = true
  return request(
    `/api/orders/${encodeURIComponent(id)}/edits/${encodeURIComponent(editId)}`,
    'PATCH',
    body,
    'No se pudo resolver la edición.',
  )
}

export function deleteOrder(id: string) {
  return request(`/api/orders/${encodeURIComponent(id)}`, 'DELETE', undefined, 'No se pudo cancelar el pedido.')
}

function text(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const PICKUP_SKIP_TEXT = new Set(['zone', 'floor', 'unit', 'doorbell', 'betweenStreet1', 'betweenStreet2'])

export function orderBody(order: OrderDraft, mode: 'create' | 'patch', previous?: Order) {
  const pickup = order.dispatchType === 'retiro'
  const body: Record<string, unknown> = {
    client: order.client.trim(),
    seller: text(order.seller) ?? '',
    phone: text(order.phone) ?? '',
    loadedAt: order.loadedAt,
    deliveryDate: order.deliveryDate,
  }
  if (pickup) {
    const address = text(order.address)
    if (address) body.address = address
  } else {
    body.address = text(order.address) ?? ''
    body.propertyType = text(order.propertyType) ?? ''
  }
  if (mode === 'create') body.status = order.status

  for (const key of TEXT_FIELDS) {
    if (pickup && PICKUP_SKIP_TEXT.has(key)) continue
    const value = text(order[key])
    if (value) body[key] = value
    else if (mode === 'patch') body[key] = null
  }

  if (order.invoices && order.invoices.length > 0) body.invoices = order.invoices
  else if (mode === 'patch') body.invoices = null

  if (typeof order.collectOnDelivery === 'boolean') body.collectOnDelivery = order.collectOnDelivery
  else if (mode === 'patch') body.collectOnDelivery = null

  if (typeof order.requiresPickup === 'boolean') body.requiresPickup = order.requiresPickup
  else if (mode === 'patch') body.requiresPickup = null

  if (mode === 'create') {
    if (order.dispatchType) body.dispatchType = order.dispatchType
  } else if (order.dispatchType !== previous?.dispatchType) {
    body.dispatchType = order.dispatchType ?? null
  }

  if (mode === 'create') {
    if (order.priority) body.priority = order.priority
  } else if (order.priority !== previous?.priority) {
    body.priority = order.priority ?? 'normal'
  }

  if (typeof order.packages === 'number') body.packages = order.packages
  else if (mode === 'patch') body.packages = null

  if (mode === 'create' && order.items && order.items.length > 0) body.items = order.items

  return body
}

export function withoutNewAttachment(
  body: Record<string, unknown>,
  mode: 'create' | 'patch',
  previous?: Order,
) {
  const next = { ...body }
  if (previous?.attachmentDataUrl && previous.attachmentDataUrl !== body.attachmentDataUrl) {
    next.attachmentName = previous.attachmentName ?? null
    next.attachmentDataUrl = previous.attachmentDataUrl
    return next
  }
  if (mode === 'patch') {
    next.attachmentName = null
    next.attachmentDataUrl = null
    return next
  }
  delete next.attachmentName
  delete next.attachmentDataUrl
  return next
}
