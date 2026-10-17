import { menuPaths } from '../lib/access'
import type { Role } from '../lib/authStore'

export const NAV = [
  { to: '/', label: 'Panel Operativo', end: true, icon: 'panel' },
  { to: '/mis-entregas', label: 'Mis entregas', icon: 'truck' },
  { to: '/mis-viajes', label: 'Mis viajes', icon: 'route' },
  { to: '/nuevo-pedido', label: 'Nuevo Pedido', icon: 'plus' },
  { to: '/preparacion', label: 'Mi preparación', icon: 'box' },
  { to: '/pedidos', label: 'Pedidos y Preparación', icon: 'box' },
  { to: '/pendientes', label: 'Pendientes de Entregas', icon: 'pin' },
  { to: '/despacho', label: 'Despacho', icon: 'truck' },
  { to: '/retiros', label: 'Retiros', icon: 'store' },
  { to: '/seguimiento', label: 'Seguimiento', icon: 'search' },
  { to: '/rutas', label: 'Planificador de Rutas', icon: 'route' },
  { to: '/choferes', label: 'Choferes en ruta', icon: 'map' },
  { to: '/taller', label: 'Mi taller', icon: 'box' },
  { to: '/post-venta/nuevo', label: 'Nuevo reclamo', icon: 'plus' },
  { to: '/post-venta', label: 'Post Venta', end: true, icon: 'refresh' },
  { to: '/usuarios', label: 'Usuarios', icon: 'users' },
  { to: '/datos-maestros', label: 'Datos maestros', icon: 'settings' },
  { to: '/tarifas', label: 'Tarifas de viaje', icon: 'settings' },
  { to: '/bandeja', label: 'Bandeja', icon: 'inbox' },
  { to: '/reportes', label: 'Reportes', icon: 'chart' },
] as const

export type NavItem = (typeof NAV)[number]
export type GroupId = 'operacion' | 'seguimiento' | 'post-venta' | 'admin'
export type NavIconName =
  | NavItem['icon']
  | 'menu'
  | 'bell'
  | 'x'
  | 'chevron-down'
  | 'sidebar-collapse'
  | 'filter'
  | 'board'
  | 'list'

type NavSectionDef = { label?: string; paths: readonly string[] }

const GROUP_DEFS: { id: GroupId; title: string; icon: NavIconName; sections: NavSectionDef[] }[] = [
  {
    id: 'operacion',
    title: 'Operación',
    icon: 'panel',
    sections: [
      { paths: ['/', '/preparacion', '/nuevo-pedido', '/pedidos', '/pendientes', '/despacho', '/retiros'] },
    ],
  },
  {
    id: 'seguimiento',
    title: 'Seguimiento',
    icon: 'search',
    sections: [
      { label: 'Pedidos', paths: ['/seguimiento'] },
      { label: 'Rutas', paths: ['/rutas', '/choferes'] },
    ],
  },
  {
    id: 'post-venta',
    title: 'Post Venta',
    icon: 'refresh',
    sections: [{ paths: ['/taller', '/post-venta/nuevo', '/post-venta'] }],
  },
  {
    id: 'admin',
    title: 'Administración',
    icon: 'settings',
    sections: [
      { paths: ['/usuarios', '/bandeja'] },
      { paths: ['/datos-maestros', '/tarifas'] },
      { paths: ['/reportes'] },
    ],
  },
]

export const GROUPS: {
  id: GroupId
  title: string
  icon: NavIconName
  sections: NavSectionDef[]
  paths: readonly string[]
}[] = GROUP_DEFS.map((group) => ({
  ...group,
  paths: group.sections.flatMap((section) => section.paths),
}))

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

export type AppTab = { id: string; label: string; icon: NavIconName; to: string }

export function tabsFor(role: Role): AppTab[] {
  const { standalone, groups } = visibleNav(role)
  if (role === 'gerencia') {
    const item = itemByPath('/reportes')
    return item ? [{ id: item.to, label: item.label, icon: item.icon, to: item.to }] : []
  }
  if (role === 'tecnico') {
    return ['/taller', '/post-venta'].flatMap((path) => {
      const item = itemByPath(path)
      return item ? [{ id: item.to, label: item.label, icon: item.icon, to: item.to }] : []
    })
  }
  if (role === 'chofer') {
    return standalone.map((item) => ({
      id: item.to,
      label: item.label,
      icon: item.icon,
      to: item.to,
    }))
  }
  return groups.map((group) => {
    const def = GROUPS.find((entry) => entry.id === group.id)
    return {
      id: group.id,
      label: group.title,
      icon: def?.icon ?? 'panel',
      to: group.items[0].to,
    }
  })
}

export type SidebarSection = { label?: string; items: NavItem[] }

export function sidebarFor(role: Role, pathname: string): SidebarSection[] | null {
  if (role === 'chofer' || role === 'gerencia' || role === 'tecnico') return null
  const { groups } = visibleNav(role)
  const groupId = activeGroupId(pathname, groups)
  const group = groups.find((entry) => entry.id === groupId)
  if (!group || group.items.length <= 1) return null
  const def = GROUPS.find((entry) => entry.id === group.id)
  if (!def) return null
  const allowed = new Set(group.items.map((item) => item.to))
  const sections = def.sections
    .map((section) => ({
      label: section.label,
      items: section.paths.flatMap((path) => {
        const item = itemByPath(path)
        return item && allowed.has(item.to) ? [item] : []
      }),
    }))
    .filter((section) => section.items.length > 0)
  return sections.length > 0 ? sections : null
}

export function activeTabId(role: Role, pathname: string): string | null {
  if (role === 'chofer' || role === 'gerencia' || role === 'tecnico') {
    const tab = tabsFor(role).find((entry) => pathMatches(pathname, entry.to))
    return tab?.id ?? null
  }
  return activeGroupId(pathname, visibleNav(role).groups)
}

export function homePathForRole(role: Role) {
  const { standalone, groups } = visibleNav(role)
  const paths = [...standalone.map((i) => i.to), ...groups.flatMap((g) => g.items.map((i) => i.to))]
  if (role === 'chofer' && paths.includes('/mis-entregas')) return '/mis-entregas'
  if (role === 'deposito') return '/preparacion'
  if (role === 'gerencia') return '/reportes'
  if (role === 'tecnico') return '/taller'
  return '/'
}

export type Breadcrumb = { label: string; to?: string }

export function breadcrumbsFor(pathname: string, role: Role, crumb?: string): Breadcrumb[] {
  const home = homePathForRole(role)
  if (pathname === home) return []
  const crumbs: Breadcrumb[] = [{ label: 'Inicio', to: home }]
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
