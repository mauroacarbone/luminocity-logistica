import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { NotificationBell } from '../components/NotificationBell'
import { BRAND } from '../config/brand'
import { useAuth } from '../state/AuthContext'
import { SearchTrigger } from './CommandPalette'
import { NavMenu } from './NavMenu'
import { UserMenu } from './UserMenu'
import {
  activeGroupId,
  homePathForRole,
  pathMatches,
  visibleNav,
  type GroupId,
  type NavItem,
} from './nav'

type TopNavProps = {
  onOpenSearch?: () => void
}

type OpenMenuId = GroupId | 'user'

type MenuTrigger = {
  id: GroupId
  title: string
  items: NavItem[]
  menuDomId: string
}

export function TopNav({ onOpenSearch }: TopNavProps) {
  const { user } = useAuth()
  const location = useLocation()
  const baseId = useId()
  const [openId, setOpenId] = useState<OpenMenuId | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const [menuPath, setMenuPath] = useState(location.pathname)
  const triggerRefs = useRef<Partial<Record<GroupId, HTMLButtonElement | null>>>({})

  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    if (openId !== null) setOpenId(null)
    if (focusIndex !== null) setFocusIndex(null)
  }

  const nav = useMemo(() => (user ? visibleNav(user.role) : { standalone: [], groups: [] }), [user])
  const currentGroup = activeGroupId(location.pathname, nav.groups)
  const homeTo = user ? homePathForRole(user.role) : '/'

  const dropdownGroups = nav.groups.filter((g) => g.items.length > 1)
  const triggers: MenuTrigger[] = dropdownGroups.map((g) => ({
    id: g.id,
    title: g.title,
    items: g.items,
    menuDomId: `${baseId}-${g.id}`,
  }))

  function openMenu(id: OpenMenuId, index: number | null = null) {
    setOpenId(id)
    setFocusIndex(index)
  }

  function closeMenu() {
    setOpenId(null)
    setFocusIndex(null)
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, id: GroupId) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu(id, 0)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(id, -1)
      return
    }
    if (event.key === 'Escape' && openId === id) {
      event.preventDefault()
      closeMenu()
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const dir = event.key === 'ArrowLeft' ? -1 : 1
      const index = triggers.findIndex((t) => t.id === id)
      if (index < 0 || triggers.length === 0) return
      event.preventDefault()
      const next = triggers[(index + dir + triggers.length) % triggers.length]
      if (openId && openId !== 'user') {
        openMenu(next.id, 0)
        queueMicrotask(() => triggerRefs.current[next.id]?.focus())
      } else {
        triggerRefs.current[next.id]?.focus()
      }
    }
  }

  function moveNeighbor(from: GroupId, dir: -1 | 1) {
    const index = triggers.findIndex((t) => t.id === from)
    if (index < 0 || triggers.length === 0) return
    const next = triggers[(index + dir + triggers.length) % triggers.length]
    openMenu(next.id, 0)
    queueMicrotask(() => triggerRefs.current[next.id]?.focus())
  }

  function onUserOpenChange(next: boolean) {
    if (next) openMenu('user')
    else closeMenu()
  }

  function renderDirectLink(item: NavItem) {
    const active = pathMatches(location.pathname, item.to, 'end' in item ? item.end : false)
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={'end' in item ? item.end : false}
        className={active ? 'topnav-link is-active' : 'topnav-link'}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </NavLink>
    )
  }

  return (
    <header className="topnav no-print">
      <div className="topnav-inner">
        <Link to={homeTo} className="topnav-brand">
          <img className="topnav-logo" src={BRAND.logoUrl} alt="" width={28} height={28} />
          <span className="topnav-brand-name">{BRAND.name}</span>
        </Link>

        <nav className="topnav-sections" aria-label="Secciones">
          {nav.standalone.map((item) => renderDirectLink(item))}

          {nav.groups.map((group) => {
            if (group.items.length === 1) {
              return renderDirectLink(group.items[0])
            }

            const menuDomId = `${baseId}-${group.id}`
            const open = openId === group.id
            const groupActive = currentGroup === group.id

            return (
              <div key={group.id} className="topnav-dropdown">
                <button
                  ref={(el) => {
                    triggerRefs.current[group.id] = el
                  }}
                  type="button"
                  className={groupActive ? 'topnav-trigger is-active' : 'topnav-trigger'}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-controls={menuDomId}
                  onClick={() => {
                    if (open) closeMenu()
                    else openMenu(group.id, null)
                  }}
                  onKeyDown={(event) => onTriggerKeyDown(event, group.id)}
                >
                  <span>{group.title}</span>
                  <svg className="topnav-chevron" viewBox="0 0 24 24" aria-hidden="true">
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
                <NavMenu
                  id={menuDomId}
                  items={group.items}
                  open={open}
                  focusIndex={open ? focusIndex : null}
                  onClose={closeMenu}
                  onArrowNeighbor={(dir) => moveNeighbor(group.id, dir)}
                />
              </div>
            )
          })}
        </nav>

        <div className="topnav-right">
          {onOpenSearch ? <SearchTrigger onOpen={onOpenSearch} /> : null}
          {user ? <NotificationBell /> : null}
          <UserMenu open={openId === 'user'} onOpenChange={onUserOpenChange} />
        </div>
      </div>
    </header>
  )
}
