import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND } from '../config/brand'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { NavIcon } from './NavIcon'
import {
  GROUPS,
  activeGroupId,
  type GroupId,
  type NavItem,
  visibleNav,
} from './nav'

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

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={'end' in item ? item.end : false}
      className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
      onClick={() => onNavigate?.()}
    >
      <NavIcon name={item.icon} />
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
  const { standalone, groups } = user
    ? visibleNav(user.role)
    : { standalone: [], groups: [] }

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
          src={BRAND.logoUrl}
          alt={BRAND.name}
          width={28}
          height={28}
        />
        <span className="brand-name">{BRAND.name}</span>
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
