import { useId, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'
import { Modal } from './Modal'

type DrawerProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'min(520px, 100vw)',
}: DrawerProps) {
  const titleId = useId()
  if (!open) return null

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="bg-overlay">
      <div
        className="flex h-full items-end justify-center sm:items-stretch sm:justify-end"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          className={cx(
            'drawer-panel relative flex max-h-[90dvh] w-full flex-col rounded-t-[10px] border border-border bg-surface',
            'sm:h-full sm:max-h-none sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l',
          )}
          style={{ width }}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-text">
                {title}
              </h2>
              {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            </div>
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label="Cerrar"
              icon={<span aria-hidden="true">×</span>}
              onClick={onClose}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
          {footer ? (
            <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-surface px-4 py-3">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
