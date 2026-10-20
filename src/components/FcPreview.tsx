import type { FcParsedItem } from '../lib/ordersApi'
import { Button } from './ui'
import { Modal } from './ui/Modal'

export function FcPreview({
  factura,
  cliente,
  items,
  warnings,
  clientNotice,
  invoiceNotice,
  sheetNotice,
  error,
  hasManual,
  pending,
  onClose,
  onApply,
}: {
  factura: string | null
  cliente: string | null
  items: FcParsedItem[]
  warnings: string[]
  clientNotice: string
  invoiceNotice: string
  sheetNotice: string
  error: string
  hasManual: boolean
  pending: '' | 'replace' | 'merge'
  onClose: () => void
  onApply: (mode: 'replace' | 'merge') => void
}) {
  const canLoad = items.length > 0 && !sheetNotice
  const busy = pending !== ''
  return (
    <Modal
      onClose={() => {
        if (!busy) onClose()
      }}
      closeOnEscape={!busy}
      labelledBy="fc-preview-title"
      className="grid place-items-center bg-overlay p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-lg bg-surface p-5 shadow-md">
        <div>
          <h2 id="fc-preview-title" className="text-xl font-semibold text-text">
            Artículos de la FC
          </h2>
          <p className="mt-1 text-sm text-text">Factura {factura ?? 'sin número'}</p>
          <p className="text-sm text-text">Cliente {cliente ?? 'no leído'}</p>
        </div>
        {clientNotice ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-text">{clientNotice}</p>
        ) : null}
        {invoiceNotice ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-text">{invoiceNotice}</p>
        ) : null}
        {sheetNotice ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-text">{sheetNotice}</p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted">No hay artículos para cargar.</p>
        ) : (
          <div className="min-h-0 overflow-auto">
            <table className="w-full min-w-[36rem] text-left text-sm text-text">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-2 font-medium">Código</th>
                  <th className="px-2 py-2 font-medium">Cód. interno</th>
                  <th className="px-2 py-2 font-medium">Descripción</th>
                  <th className="px-2 py-2 font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.it}-${item.code}`} className="border-b border-border">
                    <td className="px-2 py-2 align-top">{item.code}</td>
                    <td className="px-2 py-2 align-top tabular-nums">{item.internalCode}</td>
                    <td className="px-2 py-2 align-top">{item.description}</td>
                    <td className="px-2 py-2 align-top tabular-nums">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-text">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          {canLoad && hasManual ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={busy}
              loading={pending === 'replace'}
              onClick={() => onApply('replace')}
            >
              Reemplazar artículos
            </Button>
          ) : null}
          {canLoad ? (
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={busy}
              loading={pending === (hasManual ? 'merge' : 'replace')}
              onClick={() => onApply(hasManual ? 'merge' : 'replace')}
            >
              {hasManual ? 'Agregar a los existentes' : 'Cargar artículos'}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
