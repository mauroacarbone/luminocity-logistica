import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

const EDGE = 8
const GAP = 6

function place(
  trigger: HTMLElement,
  menu: HTMLElement,
  align: 'start' | 'end',
): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect()
  const width = menu.offsetWidth || 240
  let left = align === 'end' ? rect.right - width : rect.left
  if (left < EDGE) left = EDGE
  if (left + width > window.innerWidth - EDGE) {
    left = window.innerWidth - EDGE - width
  }
  left = Math.max(EDGE, left)
  const height = menu.offsetHeight
  let top = rect.bottom + GAP
  const bottomLimit = window.innerHeight - EDGE
  if (top + height > bottomLimit) {
    const above = rect.top - GAP - height
    top = above >= EDGE ? above : Math.max(EDGE, bottomLimit - height)
  }
  return { top, left }
}

/** Posición fixed del menú bajo el disparador; se recalcula al abrir, resize y scroll. */
export function usePopoverPosition(
  triggerRef: RefObject<HTMLElement | null>,
  open: boolean,
  align: 'start' | 'end',
) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open) return

    function update() {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      setPos(place(trigger, menu, align))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, align, triggerRef])

  return { top: pos.top, left: pos.left, menuRef }
}
