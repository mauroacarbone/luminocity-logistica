import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { menuPaths } from '../lib/access'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'

const NAV = [
  { to: '/', label: 'Panel Operativo', end: true, icon: 'panel' },
  { to: '/mis-entregas', label: 'Mis entregas', icon: 'truck' },
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
  { to: '/bandeja', label: 'Bandeja', icon: 'inbox' },
] as const

type NavItem = (typeof NAV)[number]
type GroupId = 'operacion' | 'seguimiento' | 'post-venta' | 'admin'

const GROUPS: { id: GroupId; title: string; paths: readonly string[] }[] = [
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
    paths: ['/usuarios', '/datos-maestros', '/bandeja'],
  },
]

const STANDALONE = new Set<string>(['/mis-entregas'])
const OPEN_KEY = 'luminocity.sidebarGroups'

type OpenMap = Partial<Record<GroupId, boolean>>

function loadOpenMap(): OpenMap {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const next: OpenMap = {}
    for (const group of GROUPS) {
      const value = (parsed as Record<string, unknown>)[group.id]
      if (typeof value === 'boolean') next[group.id] = value
    }
    return next
  } catch {
    return {}
  }
}

function saveOpenMap(map: OpenMap) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

function itemByPath(path: string) {
  return NAV.find((item) => item.to === path)
}

function pathMatches(pathname: string, to: string, end?: boolean) {
  if (end || to === '/') return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

function activeGroupId(pathname: string, visible: { id: GroupId; items: NavItem[] }[]): GroupId | null {
  for (const group of visible) {
    if (group.items.some((item) => pathMatches(pathname, item.to, 'end' in item ? item.end : false))) {
      return group.id
    }
  }
  return null
}

function Icon({ name }: { name: NavItem['icon'] }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'panel' && (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" {...common} />
          <rect x="14" y="3" width="7" height="7" rx="1.5" {...common} />
          <rect x="3" y="14" width="7" height="7" rx="1.5" {...common} />
          <rect x="14" y="14" width="7" height="7" rx="1.5" {...common} />
        </>
      )}
      {name === 'plus' && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" {...common} />
          <path d="M12 8v8M8 12h8" {...common} />
        </>
      )}
      {name === 'box' && (
        <path d="M3 8l9-4 9 4-9 4-9-4zM3 8v8l9 4 9-4V8M12 12v8" {...common} />
      )}
      {name === 'truck' && (
        <path
          d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 1 0 0.01 0M17 18a1.5 1.5 0 1 0 0.01 0"
          {...common}
        />
      )}
      {name === 'store' && <path d="M4 9l1.5-5h13L20 9M4 9v10h16V9M9 19v-6h6v6" {...common} />}
      {name === 'search' && (
        <>
          <circle cx="11" cy="11" r="6" {...common} />
          <path d="M16 16l4 4" {...common} />
        </>
      )}
      {name === 'route' && <path d="M5 19V6M5 6l4 3 5-4 5 3M9 19h10" {...common} />}
      {name === 'map' && (
        <>
          <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" {...common} />
          <path d="M9 3v15M15 6v15" {...common} />
        </>
      )}
      {name === 'pin' && (
        <path
          d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10zM12 11.5a1.5 1.5 0 1 0 0.01 0"
          {...common}
        />
      )}
      {name === 'refresh' && <path d="M20 12a8 8 0 1 1-2.3-5.6M20 5v5h-5" {...common} />}
      {name === 'inbox' && <path d="M4 6h16v12H4zM4 13h4l1.5 2h5L16 13h4" {...common} />}
      {name === 'users' && (
        <>
          <circle cx="9" cy="8" r="2.2" {...common} />
          <path d="M4.5 18a4.5 4.5 0 0 1 9 0M16 11a2 2 0 1 0 0-4M16.5 18a4 4 0 0 0-2-3.4" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" {...common} />
          <circle cx="8" cy="7" r="1.6" {...common} />
          <circle cx="15" cy="12" r="1.6" {...common} />
          <circle cx="10" cy="17" r="1.6" {...common} />
        </>
      )}
    </svg>
  )
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={'end' in item ? item.end : false}
      className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
      onClick={() => onNavigate?.()}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  )
}

type SidebarProps = {
  onClose?: () => void
  onNavigate?: () => void
}

export function Sidebar({ onClose, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'
  const allowed = new Set(user ? menuPaths(user.role) : [])

  const standalone = NAV.filter((item) => STANDALONE.has(item.to) && allowed.has(item.to))
  const groups = GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.paths.flatMap((path) => {
      const item = itemByPath(path)
      return item && allowed.has(item.to) ? [item] : []
    }),
  })).filter((group) => group.items.length > 0)

  const currentGroup = activeGroupId(location.pathname, groups)
  const [openMap, setOpenMap] = useState<OpenMap>(() => loadOpenMap())

  function rememberedOpen(id: GroupId, map: OpenMap) {
    if (map[id] === undefined) return true
    return map[id] === true
  }

  function isOpen(id: GroupId) {
    if (id === currentGroup) return true
    return rememberedOpen(id, openMap)
  }

  function toggleGroup(id: GroupId) {
    if (id === currentGroup) return
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !rememberedOpen(id, prev) }
      saveOpenMap(next)
      return next
    })
  }

  return (
    <aside className="sidebar" id="app-sidebar">
      <div className="brand">
        <img
          className="brand-logo"
          src="/logo-luminocity.png"
          alt="Luminocity"
          width={28}
          height={28}
        />
        <span className="brand-name">Luminocity</span>
        {onClose ? (
          <button
            type="button"
            className="sidebar-close"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <nav className="nav" aria-label="Secciones">
        {standalone.map((item) => (
          <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        {groups.map((group) => {
          const open = isOpen(group.id)
          return (
            <div key={group.id} className={open ? 'nav-group open' : 'nav-group'}>
              <button
                type="button"
                className="nav-group-title"
                aria-expanded={open}
                onClick={() => toggleGroup(group.id)}
              >
                <span>{group.title}</span>
                <svg className="nav-group-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M8 10l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {open ? (
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user">
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="user-text">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user ? ROLE_LABEL[user.role] : ''}</span>
          </span>
        </div>
        <button type="button" className="logout" onClick={logout}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M4 12h11M8 8l-4 4 4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Salir
        </button>
      </div>
    </aside>
  )
}
