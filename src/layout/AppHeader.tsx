import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NotificationBell } from '../components/NotificationBell'
import { BRAND } from '../config/brand'
import { useAuth } from '../state/AuthContext'
import { SearchTrigger } from './CommandPalette'
import { NavIcon } from './NavIcon'
import { UserMenu } from './UserMenu'
import { activeTabId, homePathForRole, tabsFor } from './nav'

type AppHeaderProps = {
  menuOpen: boolean
  sidebarCollapsed: boolean
  compact: boolean
  menuButtonRef: RefObject<HTMLButtonElement | null>
  onToggleNav: () => void
  onOpenSearch: () => void
}

export function AppHeader({
  menuOpen,
  sidebarCollapsed,
  compact,
  menuButtonRef,
  onToggleNav,
  onOpenSearch,
}: AppHeaderProps) {
  const { user } = useAuth()
  const location = useLocation()
  const tabs = user ? tabsFor(user.role) : []
  const activeId = user ? activeTabId(user.role, location.pathname) : null
  const area = tabs.find((tab) => tab.id === activeId)?.label ?? 'Operación'
  const home = user ? homePathForRole(user.role) : '/'
  const hideSearch = user?.role === 'gerencia' || user?.role === 'tecnico'
  const gerencia = user?.role === 'gerencia'
  const activeRef = useRef<HTMLAnchorElement>(null)
  const [userOpen, setUserOpen] = useState(false)
  const expanded = compact ? menuOpen : !sidebarCollapsed

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [activeId, location.pathname])

  return (
    <header className="app-header no-print">
      <div className="app-header-top">
        <div className="app-header-start">
          <button
            ref={menuButtonRef}
            type="button"
            className="app-menu-btn"
            aria-label="Abrir menú"
            aria-expanded={expanded}
            aria-controls={compact ? 'app-mobile-nav' : 'app-sidebar'}
            onClick={onToggleNav}
          >
            <NavIcon name="menu" />
          </button>
          <Link className="app-brand" to={home}>
            <img className="app-logo" src={BRAND.logoUrl} alt="" width={32} height={32} />
            <span className="app-crumbs">
              <span className="app-crumb-root">{BRAND.name}</span>
              <span className="app-crumb-sep" aria-hidden="true">
                /
              </span>
              <span className="app-crumb-area">{area}</span>
            </span>
          </Link>
        </div>
        {hideSearch ? null : (
          <div className="app-header-search">
            <SearchTrigger onOpen={onOpenSearch} />
          </div>
        )}
        <div className="app-header-end">
          {user && !gerencia ? <NotificationBell /> : null}
          <UserMenu open={userOpen} onOpenChange={setUserOpen} />
        </div>
      </div>
      <nav className="app-tabs" aria-label="Áreas">
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <Link
              key={tab.id}
              ref={active ? activeRef : undefined}
              to={tab.to}
              className={active ? 'app-tab is-active' : 'app-tab'}
              aria-current={active ? 'page' : undefined}
            >
              <NavIcon name={tab.icon} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
