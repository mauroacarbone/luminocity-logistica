import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { usePopoverPosition } from './usePopoverPosition'

type UserMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserMenu({ open, onOpenChange }: UserMenuProps) {
  const { user, logout } = useAuth()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const focusOnOpen = useRef(false)
  const menuId = useId()
  const { top, left, menuRef } = usePopoverPosition(buttonRef, open, 'end')
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onOpenChange, menuRef])

  useLayoutEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open, menuRef])

  function openAndFocusItem() {
    focusOnOpen.current = true
    onOpenChange(true)
  }

  function closeAndFocusButton() {
    buttonRef.current?.focus()
    onOpenChange(false)
  }

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAndFocusItem()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocusItem()
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      onOpenChange(false)
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndFocusButton()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      onOpenChange(false)
      buttonRef.current?.focus()
    }
  }

  if (!user) return null

  return (
    <div className="topnav-user">
      <button
        ref={buttonRef}
        type="button"
        className="topnav-user-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${user.name}, ${ROLE_LABEL[user.role]}`}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="topnav-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="topnav-user-meta">
          <span className="topnav-user-name">{user.name}</span>
          <span className="topnav-user-role">{ROLE_LABEL[user.role]}</span>
        </span>
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
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="topnav-menu topnav-user-menu"
              style={{ top, left }}
              onKeyDown={onMenuKeyDown}
            >
              <div className="topnav-user-heading" aria-hidden="true">
                <span className="topnav-user-name">{user.name}</span>
                <span className="topnav-user-role">{ROLE_LABEL[user.role]}</span>
              </div>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="topnav-menuitem is-danger"
                onClick={() => {
                  onOpenChange(false)
                  logout()
                }}
              >
                Salir
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
