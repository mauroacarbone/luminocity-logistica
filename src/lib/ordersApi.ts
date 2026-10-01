import type { Order } from '../data/orders'
import { loadToken } from './authStore'

export type OrderDraft = Omit<Order, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

export type ApiSuccess = { ok: true; data: unknown }
export type ApiFailure = { ok: false; status: number; message: string }
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
] as const

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
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
    return { ok: false, status: response.status, message: messageFrom(data, fallbackFor(response.status, fallback)) }
  }
  return { ok: true, data }
}

export function listOrders() {
  return request('/api/orders', 'GET', undefined, 'No se pudieron cargar los pedidos.')
}

export function createOrder(body: Record<string, unknown>) {
  return request('/api/orders', 'POST', body, 'No se pudo crear el pedido.')
}

export function patchOrder(id: string, body: Record<string, unknown>) {
  return request(`/api/orders/${encodeURIComponent(id)}`, 'PATCH', body, 'No se pudo guardar el pedido.')
}

export function deleteOrder(id: string) {
  return request(`/api/orders/${encodeURIComponent(id)}`, 'DELETE', undefined, 'No se pudo cancelar el pedido.')
}

function text(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function orderBody(order: OrderDraft, mode: 'create' | 'patch') {
  const body: Record<string, unknown> = {
    client: order.client.trim(),
    seller: text(order.seller) ?? '',
    phone: text(order.phone) ?? '',
    address: text(order.address) ?? '',
    propertyType: text(order.propertyType) ?? '',
    loadedAt: order.loadedAt,
    deliveryDate: order.deliveryDate,
    status: order.status,
  }

  for (const key of TEXT_FIELDS) {
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

  if (order.dispatchType) body.dispatchType = order.dispatchType
  else if (mode === 'patch') body.dispatchType = null

  if (typeof order.packages === 'number') body.packages = order.packages
  else if (mode === 'patch') body.packages = null

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
