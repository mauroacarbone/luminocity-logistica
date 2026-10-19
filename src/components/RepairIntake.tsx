import { useState } from 'react'
import type { ClaimRepair } from '../data/claims'
import { error } from '../lib/alerts'
import { useClaims } from '../state/ClaimsContext'
import { Button, Field, Input, Textarea } from './ui'

export function RepairIntake({
  claimId,
  repair,
  canEdit,
}: {
  claimId: string
  repair: ClaimRepair
  canEdit: boolean
}) {
  const { updateRepair } = useClaims()
  const [editing, setEditing] = useState(false)
  const [condition, setCondition] = useState('')
  const [accessories, setAccessories] = useState('')
  const [conditionError, setConditionError] = useState('')
  const [accessoriesError, setAccessoriesError] = useState('')
  const [busy, setBusy] = useState(false)

  function open() {
    setCondition(repair.intake?.condition ?? '')
    setAccessories(repair.intake?.accessories ?? '')
    setConditionError('')
    setAccessoriesError('')
    setEditing(true)
  }

  async function save() {
    const nextCondition = condition.trim()
    const nextAccessories = accessories.trim()
    const nextConditionError =
      nextCondition.length < 5 || nextCondition.length > 500 ? 'Contá en qué estado llega el producto.' : ''
    const nextAccessoriesError =
      nextAccessories.length > 200 ? 'Los accesorios pueden tener hasta 200 caracteres.' : ''
    setConditionError(nextConditionError)
    setAccessoriesError(nextAccessoriesError)
    if (nextConditionError || nextAccessoriesError) return
    setBusy(true)
    const result = await updateRepair(claimId, {
      intakeCondition: nextCondition,
      intakeAccessories: nextAccessories,
    })
    setBusy(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mt-1 grid gap-2 text-sm">
        <Field label="Estado en que ingresa" required error={conditionError}>
          <Textarea
            rows={3}
            value={condition}
            onChange={(event) => {
              setCondition(event.target.value)
              setConditionError('')
            }}
          />
        </Field>
        <Field label="Accesorios que deja" error={accessoriesError}>
          <Input
            size="lg"
            value={accessories}
            onChange={(event) => {
              setAccessories(event.target.value)
              setAccessoriesError('')
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => void save()}>
            Guardar
          </Button>
          <Button variant="ghost" size="lg" disabled={busy} onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 flex flex-wrap items-start justify-between gap-2 text-sm">
      <div>
        {repair.intake?.condition ? (
          <>
            <p>Ingresó: {repair.intake.condition}</p>
            {repair.intake.accessories ? <p>Accesorios: {repair.intake.accessories}</p> : null}
          </>
        ) : (
          <p>Sin estado de ingreso registrado</p>
        )}
      </div>
      {canEdit ? (
        <Button variant="ghost" size="lg" onClick={open}>
          Editar
        </Button>
      ) : null}
    </div>
  )
}
