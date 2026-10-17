import { isPickup } from '../data/catalog'
import type { Order } from '../data/orders'
import type { Role } from './authStore'
import type { PickingLine } from './pickingSheet'

export const TAKE_STALE_MS = 4 * 60 * 60 * 1000

// TODO CRM: cuando esté la API key, la FC/nota de pedido y sus artículos vienen del CRM y este PDF deja de ser obligatorio
export function requiresInvoicePdf(order: { dispatchType?: string } | null | undefined) {
  return isPickup(order)
}

export type TakeState = 'libre' | 'en-preparacion' | 'vencida'

export function takenByName(order: Order) {
  const name = order.preparation?.takenBy?.name?.trim()
  return name || ''
}

export function takeState(order: Order, now = Date.now()): TakeState {
  const id = order.preparation?.takenBy?.id
  if (!id) return 'libre'
  const takenAt = order.preparation?.takenAt
  const start = takenAt ? Date.parse(takenAt) : Number.NaN
  if (!Number.isFinite(start) || now - start > TAKE_STALE_MS) return 'vencida'
  return 'en-preparacion'
}

export function prepDuration(order: Order, now = Date.now()) {
  const sessions = order.preparation?.sessions ?? []
  let sum = 0
  let any = false
  for (const session of sessions) {
    const start = Date.parse(session.start)
    if (!Number.isFinite(start)) continue
    const end = session.end ? Date.parse(session.end) : now
    if (!Number.isFinite(end) || end < start) continue
    sum += end - start
    any = true
  }
  return any ? sum : null
}

export function lineIsPicked(line: PickingLine) {
  return line.status === 'preparado' || (typeof line.pickedQty === 'number' && line.pickedQty >= line.quantity && line.quantity > 0)
}

export function checklistOf(lines: PickingLine[], orderId: string) {
  const rows = lines.filter((line) => line.orderId === orderId)
  const done = rows.filter((line) => lineIsPicked(line)).length
  return { rows, done, total: rows.length }
}

export function canTickChecklist(role: Role | undefined, order: Order, userId: string | undefined) {
  if (!role || !userId) return false
  if (order.status !== 'pendiente' && order.status !== 'preparado') return false
  if (role === 'encargado_deposito' || role === 'admin') return true
  if (role !== 'deposito') return false
  if (order.status === 'pendiente') return true
  return order.preparedBy?.id === userId
}

export function formatPrepMs(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const hours = Math.floor(totalMin / 60)
  const minutes = String(totalMin % 60).padStart(2, '0')
  return `${hours} h ${minutes} min`
}
