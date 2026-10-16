import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  text: string
  actionLabel: string
  onAction: () => void
  onClose: () => void
}

export function NotificationToast({ text, actionLabel, onAction, onClose }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(timer)
  }, [onClose])

  function activate() {
    onAction()
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-x-4 top-16 rounded-lg border border-border bg-surface p-4 shadow-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-96"
      style={{ zIndex: 'var(--z-toast)' }}
      aria-live="polite"
    >
      <div className="relative">
        <button type="button" className="w-full text-left" onClick={activate}>
          <p className="pr-10 text-sm font-medium text-text">{text}</p>
          <span className="mt-3 block w-full text-center text-sm font-semibold text-accent">
            {actionLabel}
          </span>
        </button>
        <button
          type="button"
          className="absolute right-0 top-0 grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-text"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
