import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ServerDown, Spinner } from '../components/LoadState'
import { Button } from '../components/ui'
import { focusables } from '../lib/focus'
import { useOrders } from '../state/OrdersContext'
import { useAuth } from '../state/AuthContext'
import { AppHeader } from './AppHeader'
import { CommandPalette } from './CommandPalette'
import { isEditableTarget, shouldIgnorePaletteShortcut } from './commandHotkeys'
import { sidebarFor } from './nav'
import { Sidebar } from './Sidebar'

const SIDEBAR_KEY = 'luminocity.sidebar'

const MENU_MQ = '(max-width: 1023px)'

function ImportReport({ text }: { text: string }) {
  const [head, ...rest] = text.split('\n')
  return (
    <div className="orders-note error" role="alert">
      <p>{head}</p>
      {rest.length > 0 && (
        <ul>
          {rest.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { loading, error, legacyCount, importing, importError, importLegacy, reload } = useOrders()
  const location = useLocation()
  const showImport = !loading && !error && legacyCount > 0
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(location.pathname)
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MENU_MQ).matches : false,
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
    } catch {
      return false
    }
  })
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const paletteOpenerRef = useRef<HTMLElement | null>(null)

  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    if (menuOpen) setMenuOpen(false)
  }

  useEffect(() => {
    // 32e: clave obsoleta
    try {
      localStorage.removeItem('luminocity.sidebarGroups')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia(MENU_MQ)
    function sync() {
      setCompact(media.matches)
      if (!media.matches) setMenuOpen(false)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    queueMicrotask(() => menuButtonRef.current?.focus())
  }

  function toggleNav() {
    if (compact) {
      setMenuOpen((open) => !open)
      return
    }
    setSidebarCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  function openPalette() {
    if (shouldIgnorePaletteShortcut(menuOpen)) return
    paletteOpenerRef.current = document.activeElement as HTMLElement | null
    setPaletteOpen(true)
  }

  function closePalette() {
    setPaletteOpen(false)
    queueMicrotask(() => paletteOpenerRef.current?.focus())
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        if (shouldIgnorePaletteShortcut(menuOpen)) return
        event.preventDefault()
        if (paletteOpen) {
          setPaletteOpen(false)
          queueMicrotask(() => paletteOpenerRef.current?.focus())
          return
        }
        paletteOpenerRef.current = document.activeElement as HTMLElement | null
        setPaletteOpen(true)
        return
      }
      if (event.key === '/' && !mod) {
        if (shouldIgnorePaletteShortcut(menuOpen) || paletteOpen) return
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        paletteOpenerRef.current = document.activeElement as HTMLElement | null
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, paletteOpen])

  useEffect(() => {
    if (!menuOpen || !compact) return
    const drawer = drawerRef.current
    if (!drawer) return
    focusables(drawer)[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
      }
      if (event.key !== 'Tab') return
      const root = drawerRef.current
      if (!root) return
      const items = focusables(root)
      if (items.length === 0) return
      const current = document.activeElement as HTMLElement | null
      const index = current ? items.indexOf(current) : -1
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          items[items.length - 1]?.focus()
        }
        return
      }
      if (index === items.length - 1 || index === -1) {
        event.preventDefault()
        items[0]?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, compact])

  const drawerClosed = compact && !menuOpen
  const drawerDialog = compact && menuOpen
  const sections = user ? sidebarFor(user.role, location.pathname) : null
  const showDock = !compact && sections != null

  return (
    <div className={menuOpen ? 'app menu-open' : 'app'}>
      <AppHeader
        menuOpen={menuOpen}
        sidebarCollapsed={sidebarCollapsed}
        compact={compact}
        menuButtonRef={menuButtonRef}
        onToggleNav={toggleNav}
        onOpenSearch={openPalette}
      />

      {compact ? (
        <>
          <div
            className={menuOpen ? 'mobile-nav-backdrop is-open' : 'mobile-nav-backdrop'}
            aria-hidden={!menuOpen}
            onClick={closeMenu}
          />

          <div
            ref={drawerRef}
            className={menuOpen ? 'mobile-nav-shell is-open' : 'mobile-nav-shell'}
            inert={drawerClosed ? true : undefined}
            {...(drawerDialog
              ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menú' }
              : {})}
          >
            <Sidebar mode="drawer" sections={sections} onClose={closeMenu} onNavigate={closeMenu} />
          </div>
        </>
      ) : null}

      <div className={showDock ? 'app-body has-sidebar' : 'app-body'}>
        {showDock ? (
          <Sidebar
            mode="dock"
            sections={sections}
            collapsed={sidebarCollapsed}
            onCollapse={toggleNav}
          />
        ) : null}
      <main className="main">
        {loading && <Spinner label="Cargando pedidos…" />}
        {error && <ServerDown message={error} onRetry={reload} />}
        {showImport && (
          <div className="orders-import no-print">
            <p>Hay pedidos guardados solo en este navegador.</p>
            <Button type="button" variant="secondary" size="lg" onClick={() => void importLegacy()} disabled={importing} loading={importing}>
              Importar pedidos guardados en este navegador
            </Button>
            {importError && <ImportReport text={importError} />}
          </div>
        )}
        {!showImport && importError && <ImportReport text={importError} />}
        {!loading && !error && <Outlet />}
      </main>
      </div>

      {paletteOpen ? <CommandPalette open onClose={closePalette} /> : null}
    </div>
  )
}
