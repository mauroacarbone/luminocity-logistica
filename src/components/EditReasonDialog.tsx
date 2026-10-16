import { useState, type FormEvent } from 'react'
import { Button } from './ui'
import { Modal } from './ui/Modal'

export function EditReasonDialog({
  prepared,
  error,
  onClose,
  onConfirm,
}: {
  prepared: boolean
  error: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next = reason.trim()
    if (!next) {
      setLocalError('Ingresá el motivo.')
      return
    }
    onConfirm(next)
  }

  return (
    <Modal onClose={onClose} labelledBy="edit-reason-title" className="grid place-items-center bg-overlay p-4">
      <form noValidate className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-md" onSubmit={onSubmit}>
        <h2 id="edit-reason-title" className="text-xl font-semibold">Motivo de la edición</h2>
        <p className="mt-1 text-sm text-muted">Contá por qué cambia el pedido.</p>
        {prepared && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-text">
            El pedido ya está preparado. El cambio queda esperando confirmación del encargado.
          </p>
        )}
        <label className="mt-4 block text-sm font-medium">
          Motivo
          <textarea
            autoFocus
            value={reason}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2"
            onChange={(event) => {
              setReason(event.target.value)
              setLocalError('')
            }}
          />
        </label>
        {(localError || error) && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {localError || error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="primary" size="lg">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
