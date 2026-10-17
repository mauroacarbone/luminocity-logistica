import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverPosition } from '../../layout/usePopoverPosition'
import { Button } from './Button'

export type MenuItem = {
  id: string
  label: string
  disabled?: boolean
  onSelect?: () => void
  items?: MenuItem[]
}

type MenuProps = {
  label: string
  items: MenuItem[]
  icon?: ReactNode
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 479px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 479px)')
    function onChange() {
      setNarrow(query.matches)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function Menu({ label, items, icon, disabled, open: openProp, onOpenChange }: MenuProps) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = openProp ?? innerOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )
  const [subId, setSubId] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const focusOnOpen = useRef(false)
  const menuId = useId()
  const narrow = useNarrow()
  const { top, left, menuRef } = usePopoverPosition(buttonRef, open && !narrow, 'end')
  const parent = items.find((item) => item.id === subId)
  const visible = parent?.items ?? items

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
      setSubId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, menuRef, setOpen])

  useLayoutEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open, subId, menuRef])

  function close(focusButton = true) {
    setOpen(false)
    setSubId(null)
    if (focusButton) buttonRef.current?.focus()
  }

  function openMenu() {
    if (disabled) return
    focusOnOpen.current = true
    setActive(0)
    setSubId(null)
    setOpen(true)
  }

  function choose(item: MenuItem) {
    if (item.disabled) return
    if (item.items?.length) {
      focusOnOpen.current = true
      setSubId(item.id)
      setActive(0)
      return
    }
    item.onSelect?.()
  }

  function move(next: number) {
    const count = visible.length + (parent ? 1 : 0)
    if (count === 0) return
    const index = (next + count) % count
    setActive(index)
    menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${index}"]`)?.focus()
  }

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const last = visible.length - 1 + (parent ? 1 : 0)
    if (event.key === 'Escape') {
      event.preventDefault()
      if (parent && !narrow) {
        setSubId(null)
        buttonRef.current?.focus()
        return
      }
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(active + 1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(active - 1)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      move(0)
    }
    if (event.key === 'End') {
      event.preventDefault()
      move(last)
    }
    if (event.key === 'ArrowLeft' && parent) {
      event.preventDefault()
      focusOnOpen.current = true
      setSubId(null)
      setActive(Math.max(0, items.findIndex((item) => item.id === parent.id)))
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      close()
    }
  }

  const itemClass = narrow
    ? 'flex min-h-12 w-full items-center rounded-md px-3 text-left text-base text-text hover:bg-surface-2 disabled:opacity-50'
    : 'flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-text hover:bg-surface-2 disabled:opacity-50'

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        leftIcon={icon}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        {label}
      </Button>
      {open
        ? createPortal(
            <>
              {narrow ? (
                <button
                  type="button"
                  className="fixed inset-0 bg-overlay"
                  style={{ zIndex: 'var(--z-dropdown)' }}
                  aria-label="Cerrar menú"
                  onClick={() => close(false)}
                />
              ) : null}
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label={parent ? parent.label : label}
                className={
                  narrow
                    ? 'fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-xl border border-border bg-surface p-2 pb-4 shadow-md'
                    : 'fixed min-w-64 rounded-xl border border-border bg-surface p-1 shadow-md'
                }
                style={narrow ? { zIndex: 'var(--z-dropdown)' } : { top, left, zIndex: 'var(--z-dropdown)' }}
                onKeyDown={onMenuKeyDown}
              >
                {parent ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-menu-index={0}
                    className={itemClass}
                    onClick={() => {
                      focusOnOpen.current = true
                      setSubId(null)
                    }}
                  >
                    {parent.label}
                  </button>
                ) : null}
                {visible.map((item, index) => {
                  const menuIndex = index + (parent ? 1 : 0)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      data-menu-index={menuIndex}
                      disabled={item.disabled}
                      aria-haspopup={item.items?.length ? 'menu' : undefined}
                      aria-expanded={item.items?.length ? subId === item.id : undefined}
                      className={itemClass}
                      onClick={() => choose(item)}
                      onKeyDown={(event) => {
                        if ((event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') && item.items?.length) {
                          event.preventDefault()
                          event.stopPropagation()
                          choose(item)
                        }
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
