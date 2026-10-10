import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'

export function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const focusOnOpen = useRef(false)
  const menuId = useId()
  const initial = user?.name.trim().charAt(0).toUpperCase() || 'L'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  function openAndFocusItem() {
    focusOnOpen.current = true
    setOpen(true)
  }

  function closeAndFocusButton() {
    setOpen(false)
    queueMicrotask(() => buttonRef.current?.focus())
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
      setOpen(false)
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndFocusButton()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
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
        onClick={() => setOpen((v) => !v)}
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
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="topnav-menu topnav-user-menu"
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
              setOpen(false)
              logout()
            }}
          >
            Salir
          </button>
        </div>
      ) : null}
    </div>
  )
}
