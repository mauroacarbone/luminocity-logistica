import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { DISPATCH_LABEL } from '../data/catalog'
import type { Order } from '../data/orders'
import { placeLine } from '../lib/place'

function packagesLabel(order: Order) {
  return order.packages != null ? String(order.packages) : 'a definir'
}

export function QrCoverDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('printing-cover')
    }
  }, [onClose])

  function printCover() {
    document.body.classList.add('printing-cover')
    const done = () => document.body.classList.remove('printing-cover')
    window.addEventListener('afterprint', done, { once: true })
    window.print()
  }

  const detail = placeLine(order)
  const rows = [
    { label: 'Cliente', value: order.client },
    ...(order.address || detail
      ? [
          {
            label: 'Dirección',
            value: (
              <>
                {order.address}
                {detail && (
                  <span className={order.address ? 'mt-1 block font-normal' : undefined}>{detail}</span>
                )}
              </>
            ),
          },
        ]
      : []),
    ...(order.invoices && order.invoices.length > 0
      ? [{ label: 'Facturas', value: order.invoices.join(', ') }]
      : []),
    { label: 'Bultos', value: packagesLabel(order) },
    { label: 'Zona', value: order.zone || '—' },
    ...(order.dispatchType
      ? [{ label: 'Despacho', value: DISPATCH_LABEL[order.dispatchType] }]
      : []),
    { label: 'Transportista', value: order.transporter || '—' },
  ]

  return createPortal(
    <>
      <button
        type="button"
        className="no-print fixed inset-0 z-40 cursor-default bg-black/40"
        aria-label="Cerrar carátula"
        onClick={onClose}
      />
      <div className="cover-print-frame pointer-events-none fixed inset-0 z-40 grid place-items-center p-4">
        <article
          id="cover-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cover-title"
          className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
        >
          <p className="text-sm font-semibold tracking-wide text-lumi-muted">Luminocity</p>
          <h2 id="cover-title" className="mt-1 text-2xl font-semibold">
            Carátula
          </h2>
          <div className="mt-4 flex justify-center">
            <QRCodeSVG
              value={order.id}
              size={240}
              level="M"
              marginSize={4}
              bgColor="#ffffff"
              fgColor="#000000"
              title={`QR del pedido ${order.id}`}
            />
          </div>
          <p className="mt-3 text-center text-sm text-lumi-muted">Pedido</p>
          <p className="text-center text-2xl font-semibold tracking-wide">{order.id}</p>
          <dl className="mt-4 flex flex-col gap-1 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="flex gap-2">
                <dt className="w-28 shrink-0 text-lumi-muted">{row.label}</dt>
                <dd className="min-w-0 font-medium break-words">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="no-print mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-sm text-lumi-muted hover:bg-[#f7f4ea]"
              onClick={onClose}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink"
              onClick={printCover}
            >
              Imprimir
            </button>
          </div>
        </article>
      </div>
    </>,
    document.body,
  )
}
