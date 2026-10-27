import type { Order, OrderStatus } from '../data/orders'
import type { Role, Session } from './authStore'
import { statusChoices as choicesFromTable } from './orderFlow'

const MENU: Record<Role, readonly string[]> = {
  vendedor: [
    '/',
    '/nuevo-pedido',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/pendientes',
    '/post-venta/nuevo',
    '/post-venta',
  ],
  deposito: [
    '/',
    '/preparacion',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/pendientes',
    '/post-venta/nuevo',
    '/post-venta',
  ],
  tecnico: ['/taller', '/post-venta'],
  encargado_deposito: [
    '/',
    '/preparacion',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta/nuevo',
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
    '/preparacion',
    '/despacho',
    '/retiros',
    '/seguimiento',
    '/choferes',
    '/rutas',
    '/pendientes',
    '/post-venta/nuevo',
    '/post-venta',
    '/datos-maestros',
    '/tarifas',
    '/bandeja',
    '/usuarios',
    '/reportes',
  ],
}

export function menuPaths(role: Role, trialDriver = false) {
  const paths = MENU[role]
  if (!trialDriver || paths.includes('/mis-entregas')) return paths
  return [...paths, '/mis-entregas']
}

export function canOpen(role: Role, path: string, trialDriver = false) {
  if (path === '/nuevo-pedido' && role === 'encargado_deposito') return true
  if (path === '/mis-viajes' && (role === 'encargado_deposito' || role === 'admin')) return true
  if (path === '/mis-entregas' && trialDriver) return true
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
  return role === 'admin'
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
