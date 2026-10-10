import { useEffect, type KeyboardEvent, type MouseEvent } from 'react'

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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activate()
  }

  function onCloseClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onClose()
  }

  return (
    <div
      className="fixed inset-x-4 top-16 z-40 cursor-pointer rounded-2xl border border-lumi-line bg-white p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-96"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-lumi-ink">{text}</p>
        <button
          type="button"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-lumi-muted hover:bg-[#f7f4ea] hover:text-lumi-ink"
          aria-label="Cerrar"
          onClick={onCloseClick}
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
      <span className="mt-3 block w-full rounded-xl bg-lumi-yellow px-3 py-2 text-center text-sm font-semibold text-lumi-yellow-ink">
        {actionLabel}
      </span>
    </div>
  )
}
