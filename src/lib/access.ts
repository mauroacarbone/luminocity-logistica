import type { Order, OrderStatus } from '../data/orders'
import type { Role, Session } from './authStore'
import { statusChoices as choicesFromTable } from './orderFlow'

const MENU: Record<Role, readonly string[]> = {
  vendedor: ['/', '/nuevo-pedido', '/pedidos', '/despacho', '/seguimiento', '/post-venta'],
  deposito: ['/', '/pedidos', '/despacho', '/seguimiento', '/pendientes'],
  encargado_deposito: [
    '/',
    '/pedidos',
    '/despacho',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta',
    '/bandeja',
    '/usuarios',
  ],
  chofer: ['/mis-entregas'],
  admin: [
    '/',
    '/nuevo-pedido',
    '/pedidos',
    '/despacho',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta',
    '/datos-maestros',
    '/bandeja',
    '/usuarios',
  ],
}

export function menuPaths(role: Role) {
  return MENU[role]
}

export function canOpen(role: Role, path: string) {
  if (path === '/nuevo-pedido' && role === 'encargado_deposito') return true
  return MENU[role].includes(path)
}

export function namesMatch(left: string | undefined, right: string | undefined) {
  const a = left?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
  const b = right?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
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

export function statusChoices(role: Role, order: Pick<Order, 'status' | 'dispatchType'>): OrderStatus[] {
  return choicesFromTable(role, order)
}
