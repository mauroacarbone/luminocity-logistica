import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { NavIcon } from './NavIcon'
import { pathMatches, type NavItem } from './nav'
import { usePopoverPosition } from './usePopoverPosition'

type NavMenuProps = {
  id: string
  items: NavItem[]
  open: boolean
  onClose: () => void
  onNavigate?: () => void
  onArrowNeighbor?: (dir: -1 | 1) => void
  focusIndex?: number | null
  triggerRef: RefObject<HTMLElement | null>
}

export function NavMenu({
  id,
  items,
  open,
  onClose,
  onNavigate,
  onArrowNeighbor,
  focusIndex = null,
  triggerRef,
}: NavMenuProps) {
  const location = useLocation()
  const { top, left, menuRef } = usePopoverPosition(triggerRef, open, 'start')
  const focusDone = useRef(false)

  useEffect(() => {
    if (!open) {
      focusDone.current = false
      return
    }
    const menu = menuRef.current
    if (!menu || focusIndex === null) return
    const links = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const target =
      focusIndex < 0
        ? links[links.length - 1]
        : links[Math.min(focusIndex, links.length - 1)]
    target?.focus()
    focusDone.current = true
  }, [open, focusIndex, menuRef])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const menu = menuRef.current
      const target = event.target as Node | null
      if (!menu || !target) return
      if (menu.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose, menuRef, triggerRef])

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
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
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

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      role="menu"
      className="topnav-menu"
      style={{ top, left }}
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
    </div>,
    document.body,
  )
}
