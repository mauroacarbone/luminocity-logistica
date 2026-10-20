import { useEffect, useState } from 'react'
import type { Order } from '../data/orders'
import { confirm } from '../lib/alerts'
import type { Role } from '../lib/authStore'
import {
  canEditItems,
  canTickChecklist,
  lineIsPicked,
  linesForOrderPrep,
  pickedStatus,
} from '../lib/preparation'
import type { PickingLine } from '../lib/pickingSheet'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'
import { Badge, Button, Field, Input } from './ui'

function counted(line: PickingLine) {
  if (typeof line.pickedQty === 'number' && Number.isFinite(line.pickedQty)) {
    return Math.min(line.quantity, Math.max(0, line.pickedQty))
  }
  return line.status === 'preparado' ? line.quantity : 0
}

function useNow() {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [])
  return now
}

type ItemErrors = {
  code?: string
  description?: string
  quantity?: string
}

type ItemForm = {
  itemId: string
  code: string
  description: string
  quantity: number
}

const EMPTY_FORM: ItemForm = { itemId: '', code: '', description: '', quantity: 1 }

function localItemErrors(form: ItemForm): ItemErrors {
  const errors: ItemErrors = {}
  const code = form.code.trim()
  const description = form.description.trim()
  if (!code || code.length > 60) errors.code = 'Cargá el código del artículo.'
  if (description.length > 200) errors.description = 'La descripción puede tener hasta 200 caracteres.'
  if (!Number.isInteger(form.quantity) || form.quantity < 1) {
    errors.quantity = 'La cantidad tiene que ser un entero mayor a 0.'
  }
  return errors
}

export function PrepChecklist({
  order,
  userId,
  role,
  countLocked = false,
  awaitingTake = false,
}: {
  order: Order
  userId?: string
  role?: Role
  countLocked?: boolean
  awaitingTake?: boolean
}) {
  const { lines, patchLine } = usePicking()
  const { orders, refresh, addOrderItem, updateOrderItem, deleteOrderItem } = useOrders()
  const rows = linesForOrderPrep(lines, order, orders)
  const done = rows.filter((line) => lineIsPicked(line)).length
  const total = rows.length
  const now = useNow()
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<ItemForm | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ItemErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const editable = canTickChecklist(role, order, userId) && !countLocked
  const canAdd = canEditItems(role, order, userId, now)

  async function setQty(line: PickingLine, qty: number) {
    if (!editable || busyId) return
    const next = Math.min(line.quantity, Math.max(0, qty))
    if (next === counted(line) && pickedStatus(next, line.quantity) === (line.status ?? 'pendiente')) return
    setBusyId(line.id)
    setMessage('')
    const result = await patchLine(line.id, {
      pickedQty: next,
      status: pickedStatus(next, line.quantity),
    })
    setBusyId('')
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    await refresh({ silent: true })
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setFormError('')
    setMessage('')
  }

  function openEdit(line: PickingLine) {
    const code = line.code ?? ''
    setForm({
      itemId: line.id,
      code,
      description: line.product === code ? '' : line.product,
      quantity: line.quantity,
    })
    setFieldErrors({})
    setFormError('')
    setMessage('')
  }

  async function submitItem() {
    if (!form || saving) return
    const errors = localItemErrors(form)
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return
    const code = form.code.trim()
    const description = form.description.trim()
    setSaving(true)
    const result = form.itemId
      ? await updateOrderItem(order.id, form.itemId, {
          code,
          description,
          quantity: form.quantity,
        })
      : await addOrderItem(order.id, {
          code,
          quantity: form.quantity,
          ...(description ? { description } : {}),
        })
    setSaving(false)
    if (result.status !== 'saved') {
      const text = result.status === 'not-saved' ? result.message : 'No se pudo guardar el artículo.'
      if (result.status === 'not-saved' && result.field) {
        setFieldErrors({ [result.field]: text })
        return
      }
      setFormError(text)
      return
    }
    setForm(null)
    setFieldErrors({})
  }

  async function removeItem(line: PickingLine) {
    const code = line.code || line.product
    const accepted = await confirm('Quitar artículo', `¿Quitar ${code} del pedido?`)
    if (!accepted) return
    setBusyId(line.id)
    setMessage('')
    const result = await deleteOrderItem(order.id, line.id)
    setBusyId('')
    if (result.status !== 'saved') {
      setMessage(result.status === 'not-saved' ? result.message : 'No se pudo quitar el artículo.')
    }
  }

  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      {total === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Sin artículos cargados</p>
        </div>
      ) : (
        <>
          {awaitingTake ? null : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-text">
                {done} de {total} artículos
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {countLocked && !awaitingTake ? <p className="text-sm text-muted">Tomalo para empezar a contar</p> : null}
          <ul className="flex flex-col gap-2">
            {rows.map((line) => {
              const qty = counted(line)
              return (
                <li key={line.id} className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {line.code ? <p className="text-sm text-muted tabular-nums">Cód. {line.code}</p> : null}
                    {line.source === 'manual' ? <Badge tone="neutral">Manual</Badge> : null}
                  </div>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center text-left font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    disabled={!editable || busyId === line.id}
                    onClick={() => void setQty(line, line.quantity)}
                  >
                    {line.product}
                  </button>
                  <p className="text-sm tabular-nums text-text">
                    {qty} de {line.quantity}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="size-11 shrink-0"
                      aria-label={`Menos uno de ${line.product}`}
                      disabled={!editable || busyId === line.id || qty <= 0}
                      onClick={() => void setQty(line, qty - 1)}
                    >
                      −
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="size-11 shrink-0"
                      aria-label={`Más uno de ${line.product}`}
                      disabled={!editable || busyId === line.id || qty >= line.quantity}
                      onClick={() => void setQty(line, qty + 1)}
                    >
                      +
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      disabled={!editable || busyId === line.id || qty >= line.quantity}
                      onClick={() => void setQty(line, line.quantity)}
                    >
                      Completo
                    </Button>
                  </div>
                  {line.source === 'manual' && canAdd ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="ghost" size="lg" disabled={busyId === line.id} onClick={() => openEdit(line)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        disabled={busyId === line.id}
                        onClick={() => void removeItem(line)}
                      >
                        Quitar
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {form ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-3 py-3">
          <Field label="Código" required error={fieldErrors.code}>
            <Input
              value={form.code}
              autoComplete="off"
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
          </Field>
          <Field label="Descripción (opcional)" error={fieldErrors.description}>
            <Input
              value={form.description}
              autoComplete="off"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Cantidad</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="size-11 shrink-0"
                aria-label="Menos uno"
                disabled={form.quantity <= 1}
                onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })}
              >
                −
              </Button>
              <span className="min-w-8 text-center text-base tabular-nums text-text">{form.quantity}</span>
              <Button
                variant="secondary"
                size="lg"
                className="size-11 shrink-0"
                aria-label="Más uno"
                onClick={() => setForm({ ...form, quantity: form.quantity + 1 })}
              >
                +
              </Button>
            </div>
            {fieldErrors.quantity ? (
              <p className="text-xs text-danger" role="alert">
                {fieldErrors.quantity}
              </p>
            ) : null}
          </div>
          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="lg" disabled={saving} onClick={() => void submitItem()}>
              Agregar
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={saving}
              onClick={() => {
                setForm(null)
                setFieldErrors({})
                setFormError('')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : canAdd && !awaitingTake ? (
        <Button variant="secondary" size="lg" onClick={openCreate}>
          Agregar artículo
        </Button>
      ) : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </div>
  )
}
