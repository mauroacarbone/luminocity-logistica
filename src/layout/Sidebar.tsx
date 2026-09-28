import { NavLink } from 'react-router-dom'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'

const NAV = [
  { to: '/', label: 'Panel Operativo', end: true, icon: 'panel' },
  { to: '/nuevo-pedido', label: 'Nuevo Pedido', icon: 'plus' },
  { to: '/pedidos', label: 'Pedidos y Preparación', icon: 'box' },
  { to: '/despacho', label: 'Despacho', icon: 'truck' },
  { to: '/rutas', label: 'Planificador de Rutas', icon: 'route' },
  { to: '/pendientes', label: 'Pendientes de Entregas', icon: 'pin' },
  { to: '/post-venta', label: 'Post Venta', icon: 'refresh' },
  { to: '/datos-maestros', label: 'Datos maestros', icon: 'settings' },
] as const

function Icon({ name }: { name: (typeof NAV)[number]['icon'] }) {
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
        <path
          d="M3 8l9-4 9 4-9 4-9-4zM3 8v8l9 4 9-4V8M12 12v8"
          {...common}
        />
      )}
      {name === 'truck' && (
        <path
          d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 1 0 0.01 0M17 18a1.5 1.5 0 1 0 0.01 0"
          {...common}
        />
      )}
      {name === 'route' && (
        <path d="M5 19V6M5 6l4 3 5-4 5 3M9 19h10" {...common} />
      )}
      {name === 'pin' && (
        <path
          d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10zM12 11.5a1.5 1.5 0 1 0 0.01 0"
          {...common}
        />
      )}
      {name === 'refresh' && (
        <path d="M20 12a8 8 0 1 1-2.3-5.6M20 5v5h-5" {...common} />
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

export function Sidebar() {
  const { user, logout } = useAuth()
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">L</span>
        <span className="brand-name">Luminocity</span>
      </div>

      <nav className="nav" aria-label="Secciones">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            className={({ isActive }) =>
              isActive ? 'nav-link active' : 'nav-link'
            }
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
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
