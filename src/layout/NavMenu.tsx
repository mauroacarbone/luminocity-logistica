import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NavIcon } from './NavIcon'
import { pathMatches, type NavItem } from './nav'

type NavMenuProps = {
  id: string
  items: NavItem[]
  open: boolean
  onClose: () => void
  onNavigate?: () => void
  onArrowNeighbor?: (dir: -1 | 1) => void
  focusIndex?: number | null
}

export function NavMenu({
  id,
  items,
  open,
  onClose,
  onNavigate,
  onArrowNeighbor,
  focusIndex = null,
}: NavMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return
    const links = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const target =
      focusIndex === null
        ? null
        : focusIndex < 0
          ? links[links.length - 1]
          : links[Math.min(focusIndex, links.length - 1)]
    target?.focus()
  }, [open, focusIndex])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const menu = menuRef.current
      const target = event.target as Node | null
      if (!menu || !target) return
      if (menu.contains(target)) return
      const trigger = document.querySelector(`[aria-controls="${id}"]`)
      if (trigger?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose, id])

  if (!open) return null

  function focusAt(index: number) {
    const menu = menuRef.current
    if (!menu) return
    const links = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    if (links.length === 0) return
    const next = ((index % links.length) + links.length) % links.length
    links[next]?.focus()
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const menu = menuRef.current
    if (!menu) return
    const links = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const current = document.activeElement as HTMLElement | null
    const index = current ? links.indexOf(current) : -1

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      const trigger = document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)
      trigger?.focus()
      return
    }
    if (event.key === 'Tab') {
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAt(index + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusAt(index <= 0 ? links.length - 1 : index - 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusAt(links.length - 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onArrowNeighbor?.(-1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onArrowNeighbor?.(1)
    }
  }

  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      className="topnav-menu"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const active = pathMatches(location.pathname, item.to, 'end' in item ? item.end : false)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : false}
            role="menuitem"
            tabIndex={-1}
            className={active ? 'topnav-menuitem is-active' : 'topnav-menuitem'}
            onClick={() => {
              onNavigate?.()
              onClose()
            }}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </div>
  )
}
