import type { Order, OrderStatus } from '../data/orders'
import type { Role, Session } from './authStore'
import { statusChoices as choicesFromTable } from './orderFlow'

const MENU: Record<Role, readonly string[]> = {
  vendedor: [
    '/',
    '/nuevo-pedido',
    '/pedidos',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/pendientes',
    '/post-venta',
  ],
  deposito: ['/', '/pedidos', '/despacho', '/retiros', '/seguimiento', '/pendientes'],
  encargado_deposito: [
    '/',
    '/pedidos',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta',
    '/bandeja',
    '/usuarios',
    '/tarifas',
    '/reportes',
  ],
  chofer: ['/mis-entregas', '/mis-viajes'],
  gerencia: ['/reportes'],
  admin: [
    '/',
    '/nuevo-pedido',
    '/pedidos',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta',
    '/datos-maestros',
    '/tarifas',
    '/bandeja',
    '/usuarios',
    '/reportes',
  ],
}

export function menuPaths(role: Role) {
  return MENU[role]
}

export function canOpen(role: Role, path: string) {
  if (path === '/nuevo-pedido' && role === 'encargado_deposito') return true
  if (path === '/mis-viajes' && (role === 'encargado_deposito' || role === 'admin')) return true
  return MENU[role].includes(path)
}

export function normalizeName(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
}

export function namesMatch(left: string | undefined, right: string | undefined) {
  const a = normalizeName(left)
  const b = normalizeName(right)
  return a.length > 0 && a === b
}

export function ownsOrder(user: Session, order: Order) {
  return order.createdBy === user.id || namesMatch(order.seller, user.sellerName)
}

export function canPrepare(role: Role) {
  return role === 'deposito' || role === 'encargado_deposito' || role === 'admin'
}

export function canCancelOrder(role: Role) {
  return role === 'encargado_deposito' || role === 'admin'
}

export function canEditOrder(user: Session, order: Order) {
  if (order.status === 'entregado') return false
  if (user.role === 'admin' || user.role === 'encargado_deposito') return true
  if (user.role !== 'vendedor' || !ownsOrder(user, order)) return false
  return order.status === 'pendiente' || order.status === 'preparado'
}

export function canConfirmDelivery(role: Role) {
  return role === 'chofer' || role === 'admin'
}

export function canAssignDispatch(role: Role) {
  return role === 'encargado_deposito' || role === 'admin'
}

export function canReview(role: Role) {
  return role === 'encargado_deposito' || role === 'admin'
}

export function canExportPanel(role: Role) {
  return role === 'encargado_deposito' || role === 'admin'
}

export function statusChoices(role: Role, order: Pick<Order, 'status' | 'dispatchType'>): OrderStatus[] {
  return choicesFromTable(role, order)
}
