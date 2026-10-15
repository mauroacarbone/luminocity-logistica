import { menuPaths } from '../lib/access'
import type { Role } from '../lib/authStore'

export const NAV = [
  { to: '/', label: 'Panel Operativo', end: true, icon: 'panel' },
  { to: '/mis-entregas', label: 'Mis entregas', icon: 'truck' },
  { to: '/mis-viajes', label: 'Mis viajes', icon: 'route' },
  { to: '/nuevo-pedido', label: 'Nuevo Pedido', icon: 'plus' },
  { to: '/pedidos', label: 'Pedidos y Preparación', icon: 'box' },
  { to: '/pendientes', label: 'Pendientes de Entregas', icon: 'pin' },
  { to: '/despacho', label: 'Despacho', icon: 'truck' },
  { to: '/retiros', label: 'Retiros', icon: 'store' },
  { to: '/seguimiento', label: 'Seguimiento', icon: 'search' },
  { to: '/rutas', label: 'Planificador de Rutas', icon: 'route' },
  { to: '/choferes', label: 'Choferes en ruta', icon: 'map' },
  { to: '/post-venta', label: 'Post Venta', icon: 'refresh' },
  { to: '/usuarios', label: 'Usuarios', icon: 'users' },
  { to: '/datos-maestros', label: 'Datos maestros', icon: 'settings' },
  { to: '/tarifas', label: 'Tarifas de viaje', icon: 'settings' },
  { to: '/bandeja', label: 'Bandeja', icon: 'inbox' },
] as const

export type NavItem = (typeof NAV)[number]
export type GroupId = 'operacion' | 'seguimiento' | 'post-venta' | 'admin'
export type NavIconName = NavItem['icon']

export const GROUPS: { id: GroupId; title: string; paths: readonly string[] }[] = [
  {
    id: 'operacion',
    title: 'Operación',
    paths: ['/', '/nuevo-pedido', '/pedidos', '/pendientes', '/despacho', '/retiros'],
  },
  {
    id: 'seguimiento',
    title: 'Seguimiento',
    paths: ['/seguimiento', '/rutas', '/choferes'],
  },
  {
    id: 'post-venta',
    title: 'Post Venta',
    paths: ['/post-venta'],
  },
  {
    id: 'admin',
    title: 'Administración',
    paths: ['/usuarios', '/datos-maestros', '/tarifas', '/bandeja'],
  },
]

export const STANDALONE = new Set<string>(['/mis-entregas', '/mis-viajes'])

export function itemByPath(path: string) {
  return NAV.find((item) => item.to === path)
}

export function pathMatches(pathname: string, to: string, end?: boolean) {
  if (end || to === '/') return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

export type VisibleGroup = { id: GroupId; title: string; items: NavItem[] }

export function visibleNav(role: Role): { standalone: NavItem[]; groups: VisibleGroup[] } {
  const allowed = new Set(menuPaths(role))
  const standalone = NAV.filter((item) => STANDALONE.has(item.to) && allowed.has(item.to))
  const groups = GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.paths.flatMap((path) => {
      const item = itemByPath(path)
      return item && allowed.has(item.to) ? [item] : []
    }),
  })).filter((group) => group.items.length > 0)
  return { standalone, groups }
}

export function activeGroupId(pathname: string, groups: VisibleGroup[]): GroupId | null {
  for (const group of groups) {
    if (group.items.some((item) => pathMatches(pathname, item.to, 'end' in item ? item.end : false))) {
      return group.id
    }
  }
  return null
}

export function activeItem(pathname: string, items: readonly NavItem[]): NavItem | null {
  return (
    items.find((item) => pathMatches(pathname, item.to, 'end' in item ? item.end : false)) ?? null
  )
}

export function homePathForRole(role: Role) {
  const { standalone, groups } = visibleNav(role)
  const paths = [...standalone.map((i) => i.to), ...groups.flatMap((g) => g.items.map((i) => i.to))]
  if (role === 'chofer' && paths.includes('/mis-entregas')) return '/mis-entregas'
  return '/'
}

export type Breadcrumb = { label: string; to?: string }

export function breadcrumbsFor(pathname: string, role: Role, crumb?: string): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'Inicio', to: homePathForRole(role) }]
  const item = NAV.filter((entry) => pathMatches(pathname, entry.to, 'end' in entry ? entry.end : false)).sort(
    (left, right) => right.to.length - left.to.length,
  )[0]
  if (!item) {
    if (crumb) crumbs.push({ label: crumb })
    return crumbs
  }
  if (!STANDALONE.has(item.to)) {
    const group = GROUPS.find((entry) => entry.paths.includes(item.to))
    if (group) crumbs.push({ label: group.title })
  }
  if (pathname !== item.to) {
    crumbs.push({ label: item.label, to: item.to })
    crumbs.push({ label: crumb ?? 'Detalle' })
    return crumbs
  }
  crumbs.push({ label: item.label })
  return crumbs
}
