import type { NavIconName } from './nav'

export function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {(name === 'panel' || name === 'board') && (
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
      {name === 'menu' && <path d="M4 7h16M4 12h16M4 17h16" {...common} />}
      {name === 'bell' && <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 18a2 2 0 0 0 4 0" {...common} />}
      {name === 'x' && <path d="M6 6l12 12M18 6L6 18" {...common} />}
      {name === 'chevron-down' && <path d="M6 9l6 6 6-6" {...common} />}
      {name === 'sidebar-collapse' && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" {...common} />
          <path d="M9 4v16M13 9l-3 3 3 3" {...common} />
        </>
      )}
      {name === 'filter' && <path d="M4 6h16l-6 7v5l-4-2v-3L4 6z" {...common} />}
      {name === 'chart' && (
        <>
          <path d="M4 19V5M4 19h16" {...common} />
          <path d="M8 16v-5M12 16V8M16 16v-3" {...common} />
        </>
      )}
      {name === 'list' && (
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...common} />
      )}
    </svg>
  )
}
