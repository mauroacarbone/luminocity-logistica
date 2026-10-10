import { NavLink } from 'react-router-dom'
import { BRAND } from '../config/brand'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { NavIcon } from './NavIcon'
import { type NavItem, visibleNav } from './nav'

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={'end' in item ? item.end : false}
      className={({ isActive }) => (isActive ? 'mobile-nav-link is-active' : 'mobile-nav-link')}
      onClick={() => onNavigate?.()}
    >
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  )
}

type MobileNavProps = {
  onClose?: () => void
  onNavigate?: () => void
}

export function MobileNav({ onClose, onNavigate }: MobileNavProps) {
  const { user, logout } = useAuth()
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'
  const { standalone, groups } = user
    ? visibleNav(user.role)
    : { standalone: [], groups: [] }

  return (
    <aside className="mobile-nav" id="app-mobile-nav">
      <div className="mobile-nav-brand">
        <img
          className="mobile-nav-logo"
          src={BRAND.logoUrl}
          alt={BRAND.name}
          width={28}
          height={28}
        />
        <span className="mobile-nav-brand-name">{BRAND.name}</span>
        {onClose ? (
          <button
            type="button"
            className="mobile-nav-close"
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

      <nav className="mobile-nav-list" aria-label="Secciones">
        {standalone.map((item) => (
          <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}

        {groups.map((group) => (
          <div key={group.id} className="mobile-nav-group">
            <h2 className="mobile-nav-group-title">{group.title}</h2>
            <div className="mobile-nav-group-items">
              {group.items.map((item) => (
                <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mobile-nav-footer">
        <div className="mobile-nav-user">
          <span className="mobile-nav-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="mobile-nav-user-text">
            <span className="mobile-nav-user-name">{user?.name}</span>
            <span className="mobile-nav-user-role">{user ? ROLE_LABEL[user.role] : ''}</span>
          </span>
        </div>
        <button type="button" className="mobile-nav-logout" onClick={logout}>
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
