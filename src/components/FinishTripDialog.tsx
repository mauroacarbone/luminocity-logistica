import { useState } from 'react'
import type { Order } from '../data/orders'
import type { RouteSheet } from '../lib/routeSheetsApi'
import { Button, Field, Modal, Select, Textarea } from './ui'

const REASONS = ['No estaba el cliente', 'Dirección incorrecta', 'Rechazado', 'Sin tiempo', 'Otro'] as const

function pendingFinishStops(sheet: RouteSheet, orders: Order[]) {
  return sheet.orderIds
    .map((id) => orders.find((order) => order.id === id))
    .filter((order): order is Order => Boolean(order && order.status === 'en-viaje'))
}

export function FinishTripDialog({
  sheet,
  orders,
  busy,
  onClose,
  onConfirm,
}: {
  sheet: RouteSheet
  orders: Order[]
  busy: boolean
  onClose: () => void
  onConfirm: (reasons?: Record<string, { reason: string; note?: string }>) => void
}) {
  const pending = pendingFinishStops(sheet, orders)
  const [reasons, setReasons] = useState<Record<string, { reason: string; note: string }>>({})
  const ready =
    pending.length === 0 ||
    pending.every((order) => {
      const item = reasons[order.id]
      if (!item?.reason) return false
      if (item.reason === 'Otro') return item.note.trim().length > 0
      return true
    })

  function setReason(id: string, patch: Partial<{ reason: string; note: string }>) {
    setReasons((current) => ({
      ...current,
      [id]: { reason: current[id]?.reason ?? '', note: current[id]?.note ?? '', ...patch },
    }))
  }

  return (
    <Modal
      labelledBy="finish-trip-title"
      closeOnEscape={!busy}
      className="grid place-items-center bg-overlay p-4"
      onClose={onClose}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-md border border-border bg-surface p-5">
        <h2 id="finish-trip-title" className="text-xl font-semibold">
          Finalizar viaje
        </h2>
        <p className="mt-2 text-sm">
          {pending.length > 0
            ? 'Las paradas pendientes quedan sin entregar y vuelven a asignado. Indicá el motivo de cada una.'
            : 'Las paradas pendientes quedan sin entregar y vuelven a asignado para reprogramarlas.'}
        </p>
        {pending.length > 0 ? (
          <div className="mt-4 flex flex-col gap-4">
            {pending.map((order) => {
              const item = reasons[order.id]
              return (
                <div key={order.id}>
                  <p className="text-sm font-semibold">
                    {order.id} — {order.client}
                  </p>
                  <Field label="Motivo" required className="mt-2">
                    <Select
                      size="lg"
                      value={item?.reason ?? ''}
                      onChange={(event) => setReason(order.id, { reason: event.target.value })}
                    >
                      <option value="">Elegí un motivo</option>
                      {REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {item?.reason === 'Otro' ? (
                    <Field label="Detalle" required className="mt-2">
                      <Textarea
                        value={item.note}
                        maxLength={200}
                        onChange={(event) => setReason(order.id, { note: event.target.value })}
                      />
                    </Field>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!ready}
            onClick={() => {
              if (pending.length === 0) {
                onConfirm()
                return
              }
              const payload: Record<string, { reason: string; note?: string }> = {}
              for (const order of pending) {
                const item = reasons[order.id]
                if (!item?.reason) return
                payload[order.id] =
                  item.reason === 'Otro' ? { reason: 'Otro', note: item.note.trim() } : { reason: item.reason }
              }
              onConfirm(payload)
            }}
          >
            Finalizar viaje
          </Button>
          <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
