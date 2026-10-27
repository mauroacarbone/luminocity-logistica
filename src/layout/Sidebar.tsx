import { Link, NavLink, useLocation } from 'react-router-dom'
import { BRAND } from '../config/brand'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { NavIcon } from './NavIcon'
import { activeTabId, tabsFor, type AppTab, type NavItem, type SidebarSection } from './nav'

function SideLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={item.to}
      end={'end' in item ? item.end : false}
      title={item.label}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => (isActive ? 'app-side-link is-active' : 'app-side-link')}
      onClick={() => onNavigate?.()}
    >
      <NavIcon name={item.icon} />
      {collapsed ? null : <span>{item.label}</span>}
    </NavLink>
  )
}

function AreaLink({ tab, onNavigate }: { tab: AppTab; onNavigate?: () => void }) {
  const location = useLocation()
  const { user } = useAuth()
  const active = user ? activeTabId(user.role, location.pathname, user.trialDriver === true) === tab.id : false
  return (
    <Link
      to={tab.to}
      title={tab.label}
      className={active ? 'app-side-link is-active' : 'app-side-link'}
      onClick={() => onNavigate?.()}
    >
      <NavIcon name={tab.icon} />
      <span>{tab.label}</span>
    </Link>
  )
}

type SidebarProps = {
  mode: 'dock' | 'drawer'
  sections: SidebarSection[] | null
  collapsed?: boolean
  onCollapse?: () => void
  onClose?: () => void
  onNavigate?: () => void
}

export function Sidebar({ mode, sections, collapsed, onCollapse, onClose, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth()
  const tabs = user ? tabsFor(user.role, user.trialDriver === true) : []
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'
  const dock = mode === 'dock'

  return (
    <aside
      id={dock ? 'app-sidebar' : 'app-mobile-nav'}
      className={
        dock
          ? collapsed
            ? 'app-sidebar is-collapsed'
            : 'app-sidebar'
          : 'app-drawer'
      }
    >
      {mode === 'drawer' ? (
        <div className="app-drawer-brand">
          <img src={BRAND.logoUrl} alt="" width={28} height={28} />
          <span>{BRAND.name}</span>
          {onClose ? (
            <button type="button" className="app-icon-btn" aria-label="Cerrar menú" onClick={onClose}>
              <NavIcon name="x" />
            </button>
          ) : null}
        </div>
      ) : null}

      <nav className="app-side-nav" aria-label={dock ? 'Páginas' : 'Menú'}>
        {mode === 'drawer' ? (
          <div className="app-side-section">
            <p className="app-side-label">Áreas</p>
            {tabs.map((tab) => (
              <AreaLink key={tab.id} tab={tab} onNavigate={onNavigate} />
            ))}
          </div>
        ) : null}
        {sections?.map((section, index) => (
          <div key={section.label ?? index} className="app-side-section">
            {section.label && !collapsed ? <p className="app-side-label">{section.label}</p> : null}
            {section.items.map((item) => (
              <SideLink key={item.to} item={item} collapsed={dock && collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {dock ? (
        <button
          type="button"
          className="app-side-collapse"
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          onClick={onCollapse}
        >
          <NavIcon name="sidebar-collapse" />
          {collapsed ? null : <span>Contraer barra lateral</span>}
        </button>
      ) : (
        <div className="app-drawer-footer">
          <div className="app-drawer-user">
            <span className="app-avatar" aria-hidden="true">
              {initial}
            </span>
            <span>
              <span className="app-drawer-name">{user?.name}</span>
              <span className="app-drawer-role">{user ? ROLE_LABEL[user.role] : ''}</span>
            </span>
          </div>
          <button type="button" className="app-side-link" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}
    </aside>
  )
}
