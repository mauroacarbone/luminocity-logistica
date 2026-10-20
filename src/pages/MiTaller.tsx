import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChoiceGroup } from '../components/ChoiceGroup'
import { RepairFollowUp } from '../components/RepairFollowUp'
import { RepairIntake } from '../components/RepairIntake'
import { Badge, Button, Drawer, Field, Input, LoadState, Page, PageHeader, Select, Textarea } from '../components/ui'
import type { Claim, ClaimRepair, RepairStep } from '../data/claims'
import { error } from '../lib/alerts'
import { businessToday } from '../lib/schedule'
import { useAuth } from '../state/AuthContext'
import { useClaims } from '../state/ClaimsContext'

type Desk = 'por-levantar' | 'mias' | 'esperando' | 'reparacion' | 'listas' | 'cerradas'

const STEP_LABEL: Record<RepairStep, string> = {
  'por-levantar': 'Por levantar',
  diagnostico: 'Diagnóstico',
  'presupuesto-enviado': 'Presupuesto enviado',
  'presupuesto-vencido': 'Presupuesto vencido',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  'en-reparacion': 'En reparación',
  listo: 'Lista',
  entregado: 'Entregado',
}

function money(amount: number) {
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(amount)}`
}

function day(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

function shortDay(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}`
}

function finishText(repair: ClaimRepair) {
  const finish = repair.finish
  if (!finish) return ''
  const whoWhen = [finish.by?.name, shortDay(finish.at)].filter(Boolean).join(', ')
  if (repair.coverage === 'cobro' && typeof finish.cost === 'number') {
    return `Cierre: ${finish.note} · Costo ${money(finish.cost)} · ${whoWhen}`
  }
  return `Cierre: ${finish.note} · ${whoWhen}`
}

function readCost(raw: string) {
  const value = Number(raw.trim().replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 0.001) return null
  return cents / 100
}

function stamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}

function deskOf(claim: Claim, userId: string): Desk | null {
  const repair = claim.repair
  if (!repair) return null
  if (repair.step === 'por-levantar') {
    if (!repair.technician) return 'por-levantar'
    return repair.technician.id === userId ? 'mias' : null
  }
  if (repair.step === 'presupuesto-enviado' || repair.step === 'presupuesto-vencido') return 'esperando'
  if (repair.step === 'aceptado' || repair.step === 'en-reparacion') return 'reparacion'
  if (repair.step === 'listo') return 'listas'
  if (repair.step === 'entregado' || repair.step === 'rechazado') return 'cerradas'
  if (repair.technician?.id === userId) return 'mias'
  return null
}

function sortRepairs(list: Claim[]) {
  return [...list].sort((left, right) => {
    const leftExpired = left.repair?.step === 'presupuesto-vencido' ? 0 : 1
    const rightExpired = right.repair?.step === 'presupuesto-vencido' ? 0 : 1
    if (leftExpired !== rightExpired) return leftExpired - rightExpired
    const leftDay = left.repair?.intakeAt ?? ''
    const rightDay = right.repair?.intakeAt ?? ''
    return leftDay.localeCompare(rightDay) || left.id.localeCompare(right.id, 'es')
  })
}

export function MiTaller() {
  const { user } = useAuth()
  const { claims, loading, error: loadError, refresh, takeRepair, updateRepair, moveRepair } = useClaims()
  const [params] = useSearchParams()
  const asked = params.get('reclamo')
  const [desk, setDesk] = useState<Desk>('por-levantar')
  const [openId, setOpenId] = useState<string | null>(asked)
  const [seen, setSeen] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [coverage, setCoverage] = useState<'garantia' | 'cobro'>('garantia')
  const [amount, setAmount] = useState('')
  const [etaDate, setEtaDate] = useState('')
  const [product, setProduct] = useState('')
  const [phoneKind, setPhoneKind] = useState<'' | 'movil' | 'fijo'>('')
  const [closing, setClosing] = useState(false)
  const [finalNote, setFinalNote] = useState('')
  const [finalCost, setFinalCost] = useState('')
  const [closeError, setCloseError] = useState('')
  const [costError, setCostError] = useState('')
  const [busy, setBusy] = useState(false)

  const mine = user?.id ?? ''
  const repairs = claims.filter((claim) => claim.repair)
  const selected = repairs.find((claim) => claim.id === (openId ?? '')) ?? null
  if (selected && selected.id !== seen) {
    setSeen(selected.id)
    setDiagnosis(selected.repair?.diagnosis ?? '')
    setCoverage(selected.repair?.coverage ?? 'garantia')
    setAmount(selected.repair?.quote.amount != null ? String(selected.repair.quote.amount) : '')
    setEtaDate(selected.repair?.quote.etaDate ?? '')
    setProduct(selected.repair?.product ?? '')
    setPhoneKind(selected.phoneKind ?? '')
    setClosing(false)
    setFinalNote('')
    setFinalCost('')
    setCloseError('')
    setCostError('')
  }

  const buckets = {
    'por-levantar': sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'por-levantar')),
    mias: sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'mias')),
    esperando: sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'esperando')),
    reparacion: sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'reparacion')),
    listas: sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'listas')),
    cerradas: sortRepairs(repairs.filter((claim) => deskOf(claim, mine) === 'cerradas')),
  }
  const visible = buckets[desk]

  async function run(task: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    const result = await task()
    setBusy(false)
    if (!result.ok) await error(result.message ?? 'No se pudo guardar.')
  }

  async function saveDiagnosis() {
    if (!selected) return
    const parsed = amount.trim() ? Number(amount.replace(',', '.')) : undefined
    if (parsed !== undefined && !Number.isFinite(parsed)) {
      await error('El importe tiene que ser mayor a 0.')
      return
    }
    await run(() =>
      updateRepair(selected.id, {
        diagnosis,
        coverage,
        product,
        amount: parsed,
        etaDate: etaDate || undefined,
        phoneKind: phoneKind || undefined,
      }),
    )
  }

  function primary() {
    const repair = selected?.repair
    if (!selected || !repair) return null
    if (repair.step === 'por-levantar') {
      return (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void run(() => takeRepair(selected.id))}>
          Levantar
        </Button>
      )
    }
    if (repair.step === 'diagnostico') {
      const ready = repair.coverage === 'cobro' && repair.diagnosis.trim() && repair.quote.amount != null && repair.quote.etaDate
      if (repair.coverage === 'garantia' && repair.diagnosis.trim()) {
        return (
          <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void run(() => moveRepair(selected.id, 'en-reparacion'))}>
            Pasar a reparación
          </Button>
        )
      }
      if (ready) return null
      return (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void saveDiagnosis()}>
          Guardar diagnóstico
        </Button>
      )
    }
    if (repair.step === 'aceptado') {
      return (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void run(() => moveRepair(selected.id, 'en-reparacion'))}>
          Pasar a reparación
        </Button>
      )
    }
    if (repair.step === 'en-reparacion') {
      if (closing) {
        return (
          <>
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void confirmClose()}>
              Confirmar lista
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setClosing(false)}>
              Cancelar
            </Button>
          </>
        )
      }
      return (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={openClose}>
          Marcar lista
        </Button>
      )
    }
    if (repair.step === 'listo') {
      return (
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={() => void run(() => moveRepair(selected.id, 'entregado'))}>
          Entregar
        </Button>
      )
    }
    return null
  }

  function openClose() {
    const amount = selected?.repair?.quote.amount
    setFinalNote('')
    setFinalCost(amount != null ? String(amount) : '')
    setCloseError('')
    setCostError('')
    setClosing(true)
  }

  async function confirmClose() {
    if (!selected?.repair) return
    const note = finalNote.trim()
    const noteError = note.length < 5 || note.length > 500 ? 'Contá qué se hizo en la reparación.' : ''
    const cobro = selected.repair.coverage === 'cobro'
    const cost = cobro ? readCost(finalCost) : null
    const nextCostError = cobro && cost == null ? 'Cargá el costo final de la reparación.' : ''
    setCloseError(noteError)
    setCostError(nextCostError)
    if (noteError || nextCostError || (cobro && cost == null)) return
    setBusy(true)
    const result = await moveRepair(selected.id, 'listo', {
      finalNote: note,
      ...(cobro && cost != null ? { finalCost: cost } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    setClosing(false)
  }

  if (!user) return null
  if (loading && claims.length === 0) {
    return (
      <Page>
        <LoadState status="loading" />
      </Page>
    )
  }
  if (loadError && claims.length === 0) {
    return (
      <Page>
        <LoadState status="error" error={loadError} onRetry={() => void refresh()} />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title="Mi taller" subtitle="Reparaciones del servicio técnico" />
      <div className="mt-4 overflow-x-auto">
        <ChoiceGroup
          label="Reparaciones"
          value={desk}
          onChange={setDesk}
          options={[
            { value: 'por-levantar', label: 'Por levantar', count: buckets['por-levantar'].length },
            { value: 'mias', label: 'Mías', count: buckets.mias.length },
            { value: 'esperando', label: 'Esperando respuesta', count: buckets.esperando.length },
            { value: 'reparacion', label: 'En reparación', count: buckets.reparacion.length },
            { value: 'listas', label: 'Listas', count: buckets.listas.length },
            { value: 'cerradas', label: 'Cerradas', count: buckets.cerradas.length },
          ]}
        />
      </div>
      {visible.length === 0 ? (
        <LoadState className="mt-4" status="empty" emptyTitle="No hay reparaciones en esta lista." />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {visible.map((claim) => {
            const repair = claim.repair
            if (!repair) return null
            const expired = repair.step === 'presupuesto-vencido'
            return (
              <article key={claim.id} className="rounded-xl border border-border bg-surface p-4">
                <button type="button" className="block min-h-11 w-full text-left" onClick={() => setOpenId(claim.id)}>
                  <p className="font-semibold">
                    {claim.invoices[0] || 'Sin factura / nota de pedido'} · {claim.client}
                  </p>
                  <p className="mt-1 text-sm text-subtle">
                    Ingreso {day(repair.intakeAt)} · {repair.product}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={repair.coverage === 'garantia' ? 'success' : 'info'}>
                      {repair.coverage === 'garantia' ? 'Garantía' : 'Cobro'}
                    </Badge>
                    {expired ? <Badge tone="warning">Presupuesto vencido</Badge> : null}
                    <span className="text-sm">{STEP_LABEL[repair.step]}</span>
                  </div>
                  {repair.coverage === 'cobro' && repair.quote.amount != null && (
                    <p className="mt-2 text-sm">
                      {money(repair.quote.amount)}
                      {repair.quote.etaDate ? ` · entrega aprox. ${day(repair.quote.etaDate)}` : ''}
                    </p>
                  )}
                  {repair.step === 'presupuesto-enviado' && repair.quote.expiresAt && (
                    <p className="text-xs text-subtle">Vence el {stamp(repair.quote.expiresAt)}</p>
                  )}
                  {repair.technician && <p className="mt-1 text-sm text-subtle">{repair.technician.name}</p>}
                  {(repair.step === 'listo' || repair.step === 'entregado' || desk === 'cerradas') && finishText(repair) ? (
                    <p className="mt-2 text-sm">{finishText(repair)}</p>
                  ) : null}
                </button>
                {desk === 'por-levantar' && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="mt-3"
                    disabled={busy}
                    onClick={() => void run(() => takeRepair(claim.id))}
                  >
                    Levantar
                  </Button>
                )}
              </article>
            )
          })}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        mobileFull
        title={selected ? `${selected.id} · ${selected.client}` : ''}
        subtitle={selected?.repair ? STEP_LABEL[selected.repair.step] : undefined}
        onClose={() => setOpenId(null)}
        footer={primary()}
      >
        {selected?.repair && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-subtle">
              {selected.invoices[0] || 'Sin factura / nota de pedido'} · Ingreso {day(selected.repair.intakeAt)} · Recibió{' '}
              {selected.repair.receivedBy.name}
            </p>
            <RepairIntake
              key={selected.id}
              claimId={selected.id}
              repair={selected.repair}
              canEdit={user.role === 'encargado_deposito' || user.role === 'admin'}
            />
            <p className="text-sm">{selected.description}</p>
            <Field label="Producto">
              <Input size="lg" value={product} onChange={(event) => setProduct(event.target.value)} />
            </Field>
            <Field label="Cobertura">
              <Select size="lg" value={coverage} onChange={(event) => setCoverage(event.target.value as 'garantia' | 'cobro')}>
                <option value="garantia">Garantía</option>
                <option value="cobro">Cobro</option>
              </Select>
            </Field>
            <Field label="Diagnóstico">
              <Textarea rows={4} value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
            </Field>
            {coverage === 'cobro' && (
              <>
                <Field label="Importe">
                  <Input size="lg" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
                <Field label="Fecha aproximada de entrega">
                  <Input size="lg" type="date" value={etaDate} min={businessToday()} onChange={(event) => setEtaDate(event.target.value)} />
                </Field>
              </>
            )}
            <Field label="Teléfono del cliente">
              <Select size="lg" value={phoneKind} onChange={(event) => setPhoneKind(event.target.value as '' | 'movil' | 'fijo')}>
                <option value="">Detectar</option>
                <option value="movil">Celular</option>
                <option value="fijo">Teléfono fijo</option>
              </Select>
            </Field>
            {selected.repair.step === 'diagnostico' && (
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => void saveDiagnosis()}>
                Guardar diagnóstico
              </Button>
            )}
            {(selected.repair.step === 'listo' ||
              selected.repair.step === 'entregado' ||
              desk === 'cerradas') &&
            finishText(selected.repair) ? (
              <p className="text-sm">{finishText(selected.repair)}</p>
            ) : null}
            {closing && selected.repair.step === 'en-reparacion' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold">Cierre de la reparación</p>
                <Field label="Comentario final" required error={closeError}>
                  <Textarea
                    rows={4}
                    value={finalNote}
                    onChange={(event) => {
                      setFinalNote(event.target.value)
                      setCloseError('')
                    }}
                  />
                </Field>
                {selected.repair.coverage === 'cobro' && (
                  <Field label="Costo" required error={costError}>
                    <Input
                      size="lg"
                      inputMode="decimal"
                      value={finalCost}
                      onChange={(event) => {
                        setFinalCost(event.target.value)
                        setCostError('')
                      }}
                    />
                  </Field>
                )}
              </div>
            )}
            <RepairFollowUp
              claim={{ ...selected, phoneKind: phoneKind || selected.phoneKind }}
              user={user}
              primaryKind={
                selected.repair.step === 'presupuesto-vencido'
                  ? 'reenvio'
                  : selected.repair.step === 'diagnostico' && selected.repair.coverage === 'cobro'
                    ? 'presupuesto'
                    : undefined
              }
            />
            <div>
              <p className="text-sm font-semibold">Historial</p>
              {selected.events.map((event, index) => (
                <p key={`${event.at}-${index}`} className="mt-1 text-sm text-subtle">
                  {event.note || STEP_LABEL[event.status as RepairStep] || event.status}
                  {event.by?.userName ? ` · ${event.by.userName}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  )
}
