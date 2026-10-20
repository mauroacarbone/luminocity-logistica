import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { focusables } from '../../lib/focus'
import { cx } from './cx'

type ModalProps = {
  onClose: () => void
  children: ReactNode
  /** Clases del recuadro, además de la capa fija. El aspecto lo define cada diálogo. */
  className?: string
  labelledBy?: string
  label?: string
  closeOnEscape?: boolean
}

export function Modal({
  onClose,
  children,
  className,
  labelledBy,
  label,
  closeOnEscape = true,
}: ModalProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const [previousFocus] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscapeRef.current = closeOnEscape
  })

  useEffect(() => {
    const previous = previousFocus
    const root = rootRef.current
    if (root) {
      const active = document.activeElement
      const inside = active instanceof Node && root.contains(active) && active !== root
      if (!inside) {
        const field = root.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
        )
        const next = field ?? focusables(root)[0] ?? root
        next.focus({ preventScroll: true })
      }
    }

    function onFocusIn(event: FocusEvent) {
      const dialog = rootRef.current
      if (!dialog) return
      const target = event.target
      if (target instanceof Element && target.closest('.swal2-container')) return
      if (target instanceof Node && dialog.contains(target)) return
      const items = focusables(dialog)
      ;(items[0] ?? dialog).focus({ preventScroll: true })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelector('.swal2-container .swal2-popup:not(.swal2-toast)')) return
      const dialog = rootRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        if (!closeOnEscapeRef.current) return
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables(dialog)
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
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

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [previousFocus])

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      className={cx('modal-root fixed inset-0 z-modal', className)}
    >
      {children}
    </div>,
    document.body,
  )
}
