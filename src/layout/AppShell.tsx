import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ServerDown, Spinner } from '../components/LoadState'
import { NotificationBell } from '../components/NotificationBell'
import { BRAND } from '../config/brand'
import { focusables } from '../lib/focus'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { CommandPalette, SearchTrigger } from './CommandPalette'
import { isEditableTarget, shouldIgnorePaletteShortcut } from './commandHotkeys'
import { MobileNav } from './MobileNav'
import { TopNav } from './TopNav'

const MENU_MQ = '(max-width: 1024px)'

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

  return (
    <div className={menuOpen ? 'app menu-open' : 'app'}>
      {compact ? (
        <header className="topbar no-print">
          <button
            ref={menuButtonRef}
            type="button"
            className="topbar-menu-btn"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            aria-controls="app-mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="topbar-brand">
            <img src={BRAND.logoUrl} alt="" width={28} height={28} />
            <span>{BRAND.name}</span>
          </div>
          <SearchTrigger onOpen={openPalette} compact />
          {user ? <NotificationBell /> : <span className="topbar-spacer" />}
        </header>
      ) : (
        <TopNav onOpenSearch={openPalette} />
      )}

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
            <MobileNav onClose={closeMenu} onNavigate={closeMenu} />
          </div>
        </>
      ) : null}

      <main className="main">
        {loading && <Spinner label="Cargando pedidos…" />}
        {error && <ServerDown message={error} onRetry={reload} />}
        {showImport && (
          <div className="orders-import no-print">
            <p>Hay pedidos guardados solo en este navegador.</p>
            <button type="button" className="btn-primary" onClick={() => void importLegacy()} disabled={importing}>
              Importar pedidos guardados en este navegador
            </button>
            {importError && <ImportReport text={importError} />}
          </div>
        )}
        {!showImport && importError && <ImportReport text={importError} />}
        {!loading && !error && <Outlet />}
      </main>

      {paletteOpen ? <CommandPalette open onClose={closePalette} /> : null}
    </div>
  )
}
