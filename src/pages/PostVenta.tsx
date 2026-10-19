import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Button, Card, Field, FilterBar, Input, KpiCard, LoadState, Page, PageHeader, Select, Textarea } from '../components/ui'
import { withExtras } from '../data/catalog'
import {
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_ORDER,
  isOpenClaim,
  type Claim,
  type ClaimStatus,
} from '../data/claims'
import { attachmentKind, openAttachment } from '../lib/attachment'
import { confirm, error } from '../lib/alerts'
import { businessToday } from '../lib/schedule'
import { useAuth } from '../state/AuthContext'
import { RepairFollowUp } from '../components/RepairFollowUp'
import { RepairIntake } from '../components/RepairIntake'
import { useCatalog } from '../state/CatalogContext'
import { useClaims } from '../state/ClaimsContext'

const CLAIM_PROGRESS = CLAIM_STATUS_ORDER.filter(
  (status): status is Exclude<ClaimStatus, 'cancelado'> => status !== 'cancelado',
)

type Tab = 'reclamos' | 'finalizados' | 'cancelados' | 'dashboard'
type Period = '7' | '30' | 'mes' | 'todos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'reclamos', label: 'Reclamos' },
  { id: 'finalizados', label: 'Finalizados' },
  { id: 'cancelados', label: 'Cancelados' },
  { id: 'dashboard', label: 'Dashboard' },
]

const PERIODS: { id: Period; label: string }[] = [
  { id: '7', label: 'Últimos 7 días' },
  { id: '30', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'todos', label: 'Todos' },
]

const STATUS_BADGE: Record<ClaimStatus, string> = {
  nuevo: 'bg-surface-muted text-text',
  recepcion: 'bg-info-soft text-info',
  'pendiente-retiro': 'bg-orange-soft text-orange',
  'enviado-proveedor': 'bg-purple-soft text-purple',
  reparacion: 'bg-accent-soft text-text',
  entregado: 'bg-success-soft text-success',
  cancelado: 'bg-danger-soft text-danger-deep',
}

function repairCloseText(repair: NonNullable<Claim['repair']>) {
  const finish = repair.finish
  if (!finish) return ''
  const date = new Date(finish.at)
  const when = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit',
        month: '2-digit',
      }).format(date)
  const whoWhen = [finish.by?.name, when].filter(Boolean).join(', ')
  if (repair.coverage === 'cobro' && typeof finish.cost === 'number') {
    const cost = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(finish.cost)
    return `Cierre: ${finish.note} · Costo $ ${cost} · ${whoWhen}`
  }
  return `Cierre: ${finish.note} · ${whoWhen}`
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${day}/${month}/${date.getFullYear()}, ${time}`
}

function inPeriod(iso: string, period: Period) {
  if (period === 'todos') return true
  const date = new Date(iso)
  const now = new Date()
  if (period === 'mes') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  }
  const start = new Date(now)
  start.setDate(start.getDate() - Number(period))
  start.setHours(0, 0, 0, 0)
  return date >= start
}

function matchesQuery(claim: Claim, needle: string) {
  if (!needle) return true
  const blob = [
    claim.id,
    claim.client,
    claim.seller,
    claim.motive,
    claim.description,
    ...claim.invoices,
    ...claim.products.map((product) => product.name),
  ]
    .join(' ')
    .toLowerCase()
  return blob.includes(needle)
}

function downloadClaims(claims: Claim[]) {
  const rows = claims.map((claim) => ({
    Reclamo: claim.id,
    Cliente: claim.client,
    Facturas: claim.invoices.join(', '),
    Teléfono: claim.phone,
    Email: claim.email,
    Vendedor: claim.seller,
    Motivo: claim.motive,
    Descripción: claim.description,
    Productos: claim.products.map((product) => `${product.name} x${product.quantity}`).join(', '),
    Estado: CLAIM_STATUS_LABEL[claim.status],
    Fecha: formatWhen(claim.createdAt),
    Fotos: claim.photos?.length ?? claim.photoNames.length,
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Reclamos')
  XLSX.writeFile(book, 'reclamos-luminocity.xlsx')
}

function fileLabel(kind: 'photo' | 'file', name: string, dataUrl: string) {
  if (kind === 'photo') return 'Ver foto'
  const type = attachmentKind(name, dataUrl)
  return type === 'word' || type === 'other' ? 'Descargar' : 'Ver adjunto'
}

function ClaimAttachments({ claim }: { claim: Claim }) {
  const { ensureClaimFiles } = useClaims()
  const [loadingKey, setLoadingKey] = useState('')

  const photoEntries =
    claim.photos && claim.photos.length > 0
      ? claim.photos.map((photo, index) => ({ index, name: photo.name, dataUrl: photo.dataUrl }))
      : claim.hasPhotos
        ? (claim.photoNames.length > 0 ? claim.photoNames : ['']).map((name, index) => ({
            index,
            name: name || 'Foto',
            dataUrl: '',
          }))
        : []
  const showAttachment = Boolean(claim.attachment?.dataUrl || claim.hasAttachment)
  if (photoEntries.length === 0 && !showAttachment) return null

  async function openPhoto(index: number, name: string, dataUrl: string) {
    if (dataUrl) {
      openAttachment(name, dataUrl)
      return
    }
    const key = `photo-${index}`
    setLoadingKey(key)
    const result = await ensureClaimFiles(claim.id)
    setLoadingKey('')
    if (!result.ok) {
      await error(result.message)
      return
    }
    const photo = result.claim.photos?.[index]
    if (!photo?.dataUrl) {
      await error('No se encontró la foto.')
      return
    }
    openAttachment(photo.name, photo.dataUrl)
  }

  async function openFile() {
    if (claim.attachment?.dataUrl) {
      openAttachment(claim.attachment.name, claim.attachment.dataUrl)
      return
    }
    setLoadingKey('file')
    const result = await ensureClaimFiles(claim.id)
    setLoadingKey('')
    if (!result.ok) {
      await error(result.message)
      return
    }
    const file = result.claim.attachment
    if (!file?.dataUrl) {
      await error('No se encontró el adjunto.')
      return
    }
    openAttachment(file.name, file.dataUrl)
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      {photoEntries.map((photo) => {
        const key = `photo-${photo.index}`
        const busy = loadingKey === key
        const label = busy
          ? 'Cargando…'
          : photo.dataUrl
            ? fileLabel('photo', photo.name, photo.dataUrl)
            : 'Ver foto'
        return (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            className="self-start"
            title={`${label} ${photo.name}`}
            disabled={busy || Boolean(loadingKey)}
            onClick={() => void openPhoto(photo.index, photo.name, photo.dataUrl)}
          >
            {label}
            {photo.name && photo.name !== 'Foto' ? ` · ${photo.name}` : ''}
          </Button>
        )
      })}
      {showAttachment && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          title={
            loadingKey === 'file'
              ? 'Cargando…'
              : claim.attachment?.dataUrl
                ? fileLabel('file', claim.attachment.name, claim.attachment.dataUrl)
                : 'Ver adjunto'
          }
          disabled={Boolean(loadingKey)}
          onClick={() => void openFile()}
        >
          {loadingKey === 'file'
            ? 'Cargando…'
            : claim.attachment?.dataUrl
              ? fileLabel('file', claim.attachment.name, claim.attachment.dataUrl)
              : 'Ver adjunto'}
        </Button>
      )}
    </div>
  )
}

function claimStepState(
  index: number,
  currentIndex: number,
  finished: boolean,
): 'done' | 'current' | 'todo' {
  if (finished || index < currentIndex) return 'done'
  if (index === currentIndex) return 'current'
  return 'todo'
}

function ClaimStepper({ status }: { status: Exclude<ClaimStatus, 'cancelado'> }) {
  const currentIndex = CLAIM_PROGRESS.indexOf(status)
  const finished = status === 'entregado'
  const currentLabel = CLAIM_STATUS_LABEL[status]
  const stepNumber = currentIndex + 1

  return (
    <div className="mt-3">
      <div className="hidden sm:block">
        <div className="order-stepper order-stepper-full" aria-label={`Estado: ${currentLabel}`}>
          <ol className="order-stepper-track">
            {CLAIM_PROGRESS.map((step, index) => {
              const state = claimStepState(index, currentIndex, finished)
              return (
                <li
                  key={step}
                  className={`order-step order-step-${state}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {index > 0 && <span className="order-step-line" aria-hidden="true" />}
                  <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
                  <span className="order-step-label">{CLAIM_STATUS_LABEL[step]}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <div className="sm:hidden">
        <div className="order-stepper order-stepper-compact" aria-label={`Estado: ${currentLabel}`}>
          <ol className="order-stepper-track">
            {CLAIM_PROGRESS.map((step, index) => {
              const state = claimStepState(index, currentIndex, finished)
              return (
                <li
                  key={step}
                  className={`order-step order-step-${state}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
                </li>
              )
            })}
          </ol>
          <span className="order-stepper-now">
            Paso {stepNumber} de 6 · {currentLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

function ClaimCard({ claim, highlight }: { claim: Claim; highlight: boolean }) {
  const { setStatus, addNote } = useClaims()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [openStatus, setOpenStatus] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const invoice = claim.invoices[0]
  const readOnly = user?.role === 'tecnico'
  const notes = claim.events.filter((event) => event.note)
  const trail = claim.events.filter((event) => !event.note)
  const previous = trail.length > 1 ? trail[trail.length - 2] : null
  const latest = trail[trail.length - 1]
  const progressIndex =
    claim.status === 'cancelado' ? -1 : CLAIM_PROGRESS.indexOf(claim.status)
  const nextStatus =
    progressIndex >= 0 && progressIndex < CLAIM_PROGRESS.length - 1
      ? CLAIM_PROGRESS[progressIndex + 1]
      : null
  const prevStatus = progressIndex > 0 ? CLAIM_PROGRESS[progressIndex - 1] : null
  const terminal = claim.status === 'entregado' || claim.status === 'cancelado'

  async function applyStatus(status: ClaimStatus) {
    const label = CLAIM_STATUS_LABEL[status]
    const accepted = await confirm(`¿Pasar el reclamo a ${label}?`, '')
    if (!accepted) return
    setBusy(true)
    const result = await setStatus(claim.id, status)
    setBusy(false)
    setOpenStatus(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
  }

  async function saveNote() {
    setBusy(true)
    const result = await addNote(claim.id, note)
    setBusy(false)
    if (!result.ok) {
      await error(result.message)
      return
    }
    setNote('')
    setNoting(false)
  }

  async function cancelClaim() {
    setBusy(true)
    const result = await setStatus(claim.id, 'cancelado')
    setBusy(false)
    setConfirmCancel(false)
    if (!result.ok) {
      await error(result.message)
    }
  }

  const cardRef = useRef<HTMLElement>(null)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!openStatus) return
    function update() {
      const button = statusBtnRef.current
      const menu = statusMenuRef.current
      if (!button || !menu) return
      const rect = button.getBoundingClientRect()
      const width = menu.offsetWidth
      const height = menu.offsetHeight
      const pad = 8
      let left = rect.left
      if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - width)
      let top = rect.bottom + 4
      if (top + height > window.innerHeight - pad) {
        const above = rect.top - 4 - height
        top = above >= pad ? above : Math.max(pad, window.innerHeight - pad - height)
      }
      setStatusMenuPos({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [openStatus])

  useEffect(() => {
    if (!highlight) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight, claim.id])

  return (
    <Card
      as="article"
      ref={cardRef}
      className={highlight ? 'ring-2 ring-accent' : undefined}
    >
      <div className="w-full">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[claim.status]}`}
        >
          {CLAIM_STATUS_LABEL[claim.status]}
        </span>

        {claim.status === 'cancelado' ? null : <ClaimStepper status={claim.status} />}

        {latest && (
          <p className="mt-2 text-sm text-muted">
            {previous ? `${CLAIM_STATUS_LABEL[previous.status]} → ` : ''}
            {CLAIM_STATUS_LABEL[latest.status]} · {formatWhen(latest.at)}
            {latest.by?.userName ? ` · por ${latest.by.userName}` : ''}
          </p>
        )}

        {!readOnly && !terminal && nextStatus && (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-3 sm:w-auto"
            disabled={busy}
            onClick={() => void applyStatus(nextStatus)}
          >
            Pasar a {CLAIM_STATUS_LABEL[nextStatus]}
          </Button>
        )}

        {!readOnly && claim.status !== 'cancelado' && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {prevStatus && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void applyStatus(prevStatus)}>
                Volver a {CLAIM_STATUS_LABEL[prevStatus]}
              </Button>
            )}
            <div>
              <Button
                ref={statusBtnRef}
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-expanded={openStatus}
                aria-haspopup="menu"
                onClick={() => {
                  setOpenStatus((current) => !current)
                  setConfirmCancel(false)
                  setStatusMenuPos(null)
                }}
              >
                Cambiar a otro estado
              </Button>
              {openStatus &&
                createPortal(
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 cursor-default"
                      style={{ zIndex: 'var(--z-dropdown)' }}
                      aria-label="Cerrar menú de estado"
                      onClick={() => setOpenStatus(false)}
                    />
                    <div
                      ref={statusMenuRef}
                      role="menu"
                      className="fixed w-72 rounded-xl border border-border bg-surface p-1 shadow-lg"
                      style={
                        statusMenuPos
                          ? { top: statusMenuPos.top, left: statusMenuPos.left, zIndex: 'var(--z-dropdown)' }
                          : { top: 0, left: 0, visibility: 'hidden', zIndex: 'var(--z-dropdown)' }
                      }
                    >
                      {CLAIM_PROGRESS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          role="menuitem"
                          className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-50 ${
                            claim.status === status ? 'font-semibold' : ''
                          }`}
                          disabled={busy}
                          onClick={() => void applyStatus(status)}
                        >
                          {CLAIM_STATUS_LABEL[status]}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body,
                )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="font-semibold">
            {claim.id} — {claim.client}
            {invoice ? ` (${invoice})` : ''}
          </p>
          <p className="mt-1 text-sm text-subtle">
            {claim.motive} · {formatWhen(claim.createdAt)}
            {claim.phone ? ` · ${claim.phone}` : ''}
            {claim.seller ? ` · Vendedor: ${claim.seller}` : ''}
            {claim.email ? ` · ${claim.email}` : ''}
          </p>
          <p className="mt-2 text-sm">{claim.description}</p>
          <p className="mt-2 text-sm text-subtle">
            {claim.products.map((product) => `${product.name} (x${product.quantity})`).join(' · ')}
          </p>
          <ClaimAttachments claim={claim} />
          {readOnly && claim.repair && (
            <Button variant="secondary" className="mt-3" onClick={() => navigate(`/taller?reclamo=${encodeURIComponent(claim.id)}`)}>
              Ver en Mi taller
            </Button>
          )}
          {user && <RepairFollowUp claim={claim} user={user} />}
          {claim.repair && (
            <div className="mt-3 text-sm">
              <p>
                Reparación · {claim.repair.product} · {claim.repair.coverage === 'garantia' ? 'Garantía' : 'Cobro'} ·{' '}
                ingreso {claim.repair.intakeAt.split('-').reverse().join('/')}
              </p>
              <RepairIntake
                claimId={claim.id}
                repair={claim.repair}
                canEdit={user?.role === 'encargado_deposito' || user?.role === 'admin'}
              />
              {repairCloseText(claim.repair) ? <p className="mt-1">{repairCloseText(claim.repair)}</p> : null}
            </div>
          )}
          {!claim.repair &&
            (user?.role === 'deposito' || user?.role === 'encargado_deposito' || user?.role === 'admin') && (
              <OpenRepair claim={claim} />
            )}
          {notes.map((event, index) => (
            <p key={`${event.at}-${index}`} className="mt-1 text-sm text-subtle">
              Nota · {formatWhen(event.at)} · {event.note}
              {event.by?.userName ? ` · por ${event.by.userName}` : ''}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setNoting((current) => !current)
              setConfirmCancel(false)
            }}
          >
            Nota
          </Button>
          {isOpenClaim(claim.status) && !readOnly &&
            (confirmCancel ? (
              <div className="flex items-center gap-2 text-sm">
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void cancelClaim()}>
                  Confirmar
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmCancel(false)}>
                  Volver
                </Button>
              </div>
            ) : (
              <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>
                Cancelar
              </Button>
            ))}
        </div>
      </div>
      {noting && (
        <div className="mt-3 flex items-end gap-2">
          <Field label="Nota" className="min-w-0 flex-1">
            <Input
              size="lg"
              value={note}
              placeholder="Agregar una nota..."
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => void saveNote()}>
            Guardar
          </Button>
        </div>
      )}
    </Card>
  )
}

function OpenRepair({ claim }: { claim: Claim }) {
  const { openRepair } = useClaims()
  const [open, setOpen] = useState(false)
  const [coverage, setCoverage] = useState<'garantia' | 'cobro'>('garantia')
  const [intakeAt, setIntakeAt] = useState(businessToday)
  const [intakeCondition, setIntakeCondition] = useState('')
  const [intakeAccessories, setIntakeAccessories] = useState('')
  const [conditionError, setConditionError] = useState('')
  const [accessoriesError, setAccessoriesError] = useState('')
  const [busy, setBusy] = useState(false)
  const product = claim.products[0]?.name ?? ''
  const invoice = claim.invoices[0] ?? ''

  async function save() {
    if (!invoice || !product) {
      await error('El reclamo necesita factura y producto.')
      return
    }
    const condition = intakeCondition.trim()
    const accessories = intakeAccessories.trim()
    const nextConditionError =
      condition.length < 5 || condition.length > 500 ? 'Contá en qué estado llega el producto.' : ''
    const nextAccessoriesError =
      accessories.length > 200 ? 'Los accesorios pueden tener hasta 200 caracteres.' : ''
    setConditionError(nextConditionError)
    setAccessoriesError(nextAccessoriesError)
    if (nextConditionError || nextAccessoriesError) return
    setBusy(true)
    const result = await openRepair(claim.id, {
      invoice,
      client: claim.client,
      product,
      coverage,
      intakeAt: intakeAt || businessToday(),
      intakeCondition: condition,
      intakeAccessories: accessories || undefined,
    })
    setBusy(false)
    if (!result.ok) await error(result.message)
    else setOpen(false)
  }

  if (!open) {
    return (
      <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
        Abrir reparación
      </Button>
    )
  }

  return (
    <div className="mt-3 grid gap-2">
      <Field label="Cobertura">
        <Select size="lg" value={coverage} onChange={(event) => setCoverage(event.target.value as 'garantia' | 'cobro')}>
          <option value="garantia">Garantía</option>
          <option value="cobro">Cobro</option>
        </Select>
      </Field>
      <Field label="Fecha de ingreso">
        <Input size="lg" type="date" value={intakeAt} max={businessToday()} onChange={(event) => setIntakeAt(event.target.value)} />
      </Field>
      <Field label="Estado en que ingresa" required error={conditionError}>
        <Textarea
          rows={3}
          value={intakeCondition}
          placeholder="Ej.: carcasa rayada, no enciende, sin tornillos"
          onChange={(event) => {
            setIntakeCondition(event.target.value)
            setConditionError('')
          }}
        />
      </Field>
      <Field label="Accesorios que deja" error={accessoriesError}>
        <Input
          size="lg"
          value={intakeAccessories}
          onChange={(event) => {
            setIntakeAccessories(event.target.value)
            setAccessoriesError('')
          }}
        />
      </Field>
      <Button variant="secondary" size="lg" disabled={busy} onClick={() => void save()}>
        Confirmar ingreso
      </Button>
    </div>
  )
}

function ClaimList({
  claims,
  empty,
  highlightId,
}: {
  claims: Claim[]
  empty: string
  highlightId: string | null
}) {
  return (
    <div className="mt-4">
      <Button variant="secondary" disabled={claims.length === 0} onClick={() => downloadClaims(claims)}>
        Descargar Excel
      </Button>

      {claims.length === 0 ? (
        <LoadState className="mt-4" status="empty" emptyTitle={empty} />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {claims.map((claim) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              highlight={highlightId === claim.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Dashboard({ claims, onSelect }: { claims: Claim[]; onSelect: (status: ClaimStatus) => void }) {
  const abiertos = claims.filter((claim) => claim.status === 'nuevo').length
  const enCurso = claims.filter(
    (claim) => isOpenClaim(claim.status) && claim.status !== 'nuevo',
  ).length
  const resolved = claims.filter((claim) => claim.status === 'entregado')
  const rate = claims.length === 0 ? 0 : Math.round((resolved.length / claims.length) * 100)
  const averageDays = (() => {
    const timed = resolved.filter((claim) => claim.resolvedAt)
    if (timed.length === 0) return null
    const total = timed.reduce((sum, claim) => {
      const start = new Date(claim.createdAt).getTime()
      const end = new Date(claim.resolvedAt ?? claim.createdAt).getTime()
      return sum + Math.max(0, end - start)
    }, 0)
    return total / timed.length / 86_400_000
  })()

  const byStatus = CLAIM_STATUS_ORDER.map((status) => ({
    status,
    label: CLAIM_STATUS_LABEL[status],
    count: claims.filter((claim) => claim.status === status).length,
  })).filter((item) => item.count > 0)

  const byMotive = [...new Set(claims.map((claim) => claim.motive))]
    .map((motive) => ({
      motive,
      count: claims.filter((claim) => claim.motive === motive).length,
    }))
    .sort((a, b) => b.count - a.count)
  const motiveMax = Math.max(1, ...byMotive.map((item) => item.count))

  return (
    <div className="mt-4 flex flex-col gap-4">
      <Button variant="secondary" disabled={claims.length === 0} onClick={() => downloadClaims(claims)}>
        Descargar Excel
      </Button>
      {byStatus.length === 0 ? (
        <p className="text-sm text-muted">Cuando cargues reclamos, vas a ver cómo se reparten.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3">
          {byStatus.map((item) => {
            const percent = Math.round((item.count / claims.length) * 100)
            return (
              <button
                key={item.status}
                type="button"
                aria-label={`Ver ${item.count} reclamos en ${item.label}`}
                className={`rounded-2xl p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${STATUS_BADGE[item.status]}`}
                onClick={() => onSelect(item.status)}
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{item.count}</p>
                <p className="mt-1 text-sm tabular-nums">{percent}% del total</p>
                <span className="relative mt-3 block h-1 overflow-hidden rounded-full">
                  <span className="absolute inset-0 bg-current opacity-25" />
                  <span
                    className="relative block h-full rounded-full bg-current"
                    style={{ width: `${percent}%` }}
                  />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <KpiCard title="Abiertos" value={abiertos} />
        <KpiCard title="En curso" value={enCurso} />
        <KpiCard title="Resueltos" value={resolved.length} />
        {averageDays !== null ? (
          <KpiCard title="Tiempo prom. resolución" value={`${averageDays.toFixed(1)} d`} />
        ) : null}
        <KpiCard title="Tasa de resolución" value={`${rate}%`} />
      </div>

      <Card as="section">
        <h2 className="text-base font-semibold">Top motivos de reclamo</h2>
        {byMotive.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Todavía no hay motivos para mostrar.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {byMotive.map((item) => (
              <li key={item.motive}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.motive}</span>
                  <span className="tabular-nums">{item.count}</span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full bg-warning"
                    style={{ width: `${(item.count / motiveMax) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function PostVenta() {
  const {
    claims,
    loading,
    error: loadError,
    notice,
    legacyOffer,
    dismissNotice,
    refresh,
    uploadLegacy,
    dismissLegacy,
  } = useClaims()
  const { sellers } = useCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('reclamos')
  const [query, setQuery] = useState('')
  const [seller, setSeller] = useState('todos')
  const [period, setPeriod] = useState<Period>('30')
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'todos'>('todos')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [linkNotice, setLinkNotice] = useState<string | null>(null)
  const [legacyBusy, setLegacyBusy] = useState(false)
  const [appliedReclamo, setAppliedReclamo] = useState<string | null>(null)

  const reclamoParam = searchParams.get('reclamo')
  if (!reclamoParam && appliedReclamo !== null) {
    setAppliedReclamo(null)
  } else if (!loading && reclamoParam && reclamoParam !== appliedReclamo) {
    setAppliedReclamo(reclamoParam)
    const claim = claims.find((item) => item.id === reclamoParam)
    if (!claim) {
      setLinkNotice('No encontramos ese reclamo')
      setHighlightId(null)
    } else {
      setLinkNotice(null)
      setQuery('')
      setSeller('todos')
      setPeriod('todos')
      setStatusFilter('todos')
      if (claim.status === 'entregado') setTab('finalizados')
      else if (claim.status === 'cancelado') setTab('cancelados')
      else setTab('reclamos')
      setHighlightId(claim.id)
    }
  }

  useEffect(() => {
    if (!reclamoParam || loading) return
    if (appliedReclamo !== reclamoParam) return
    setSearchParams({}, { replace: true })
  }, [reclamoParam, appliedReclamo, loading, setSearchParams])

  const needle = query.trim().toLowerCase()
  const listed = useMemo(() => {
    return claims.filter((claim) => {
      if (seller !== 'todos' && claim.seller !== seller) return false
      if (!inPeriod(claim.createdAt, period)) return false
      return matchesQuery(claim, needle)
    })
  }, [claims, seller, period, needle])

  const visible =
    statusFilter === 'todos' ? listed : listed.filter((claim) => claim.status === statusFilter)
  const reclamos = visible.filter((claim) => isOpenClaim(claim.status))
  const finalizados = visible.filter((claim) => claim.status === 'entregado')
  const cancelados = visible.filter((claim) => claim.status === 'cancelado')

  function chooseStatus(status: ClaimStatus) {
    setStatusFilter(status)
    if (status === 'entregado') setTab('finalizados')
    else if (status === 'cancelado') setTab('cancelados')
    else setTab('reclamos')
  }

  function listEmpty(fallback: string) {
    if (claims.length === 0) return 'Todavía no hay reclamos cargados.'
    if (statusFilter !== 'todos') {
      return `No hay reclamos en ${CLAIM_STATUS_LABEL[statusFilter]} para esos filtros.`
    }
    return fallback
  }

  async function onUploadLegacy() {
    setLegacyBusy(true)
    const result = await uploadLegacy()
    setLegacyBusy(false)
    if (!result.ok) await error(result.message)
  }

  async function onDismissLegacy() {
    const accepted = await confirm(
      'Descartar',
      'Se borran los reclamos guardados en este navegador.',
      { peligro: true },
    )
    if (!accepted) return
    dismissLegacy()
  }

  if (searchParams.get('tab') === 'nuevo') {
    return <Navigate to="/post-venta/nuevo" replace />
  }

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

  const canCreate =
    user?.role === 'vendedor' ||
    user?.role === 'deposito' ||
    user?.role === 'encargado_deposito' ||
    user?.role === 'admin'

  return (
    <Page>
      <PageHeader
        title="Post Venta"
        subtitle="Cargá y seguí los reclamos de clientes"
        actions={
          canCreate ? (
            <Button variant="secondary" onClick={() => navigate('/post-venta/nuevo')}>
              Nuevo reclamo
            </Button>
          ) : undefined
        }
      />

      {linkNotice && (
        <p className="mt-4 flex items-start justify-between gap-3 rounded-md bg-accent-soft px-4 py-2 text-sm text-text">
          <span>{linkNotice}</span>
          <Button variant="ghost" size="sm" aria-label="Cerrar aviso" onClick={() => setLinkNotice(null)}>
            Cerrar
          </Button>
        </p>
      )}

      {notice && (
        <p className="mt-4 flex items-start justify-between gap-3 rounded-md bg-accent-soft px-4 py-2 text-sm text-text">
          <span>{notice}</span>
          <Button variant="ghost" size="sm" aria-label="Cerrar aviso" onClick={dismissNotice}>
            Cerrar
          </Button>
        </p>
      )}

      {legacyOffer && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Hay reclamos guardados en este navegador</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={legacyBusy} onClick={() => void onUploadLegacy()}>
              Subirlos
            </Button>
            <Button variant="ghost" disabled={legacyBusy} onClick={() => void onDismissLegacy()}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      <FilterBar
        className="mt-5"
        search={{
          value: query,
          onChange: setQuery,
          label: 'Buscar reclamo',
          srOnly: true,
          placeholder: 'Buscar por cliente, factura o producto...',
        }}
        selects={[
          {
            id: 'vendedor',
            label: 'Vendedor',
            value: seller,
            onChange: setSeller,
            options: [
              { value: 'todos', label: 'Todos los vendedores' },
              ...withExtras(
                sellers,
                claims.map((claim) => claim.seller),
              ).map((name) => ({ value: name, label: name })),
            ],
          },
          {
            id: 'periodo',
            label: 'Período',
            value: period,
            onChange: (value) => setPeriod(value as Period),
            options: PERIODS.map((item) => ({ value: item.id, label: item.label })),
          },
          {
            id: 'estado',
            label: 'Estado',
            value: statusFilter,
            onChange: (value) => {
              if (value === 'todos') {
                setStatusFilter('todos')
                return
              }
              chooseStatus(value as ClaimStatus)
            },
            options: [
              { value: 'todos', label: 'Todos los estados' },
              ...CLAIM_STATUS_ORDER.map((status) => ({
                value: status,
                label: CLAIM_STATUS_LABEL[status],
              })),
            ],
          },
        ]}
        activeCount={
          (query.trim() ? 1 : 0) +
          (seller !== 'todos' ? 1 : 0) +
          (period !== '30' ? 1 : 0) +
          (statusFilter !== 'todos' ? 1 : 0)
        }
        onClear={() => {
          setQuery('')
          setSeller('todos')
          setPeriod('30')
          setStatusFilter('todos')
        }}
      />

      <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`border-b-2 px-3 py-2 text-sm ${
                active
                  ? 'border-accent font-semibold text-text'
                  : 'border-transparent text-muted'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'reclamos' && (
        <ClaimList
          claims={reclamos}
          empty={listEmpty('No hay reclamos en curso para esos filtros.')}
          highlightId={highlightId}
        />
      )}
      {tab === 'finalizados' && (
        <ClaimList
          claims={finalizados}
          empty={listEmpty('No hay reclamos finalizados para esos filtros.')}
          highlightId={highlightId}
        />
      )}
      {tab === 'cancelados' && (
        <ClaimList
          claims={cancelados}
          empty={listEmpty('No hay reclamos cancelados para esos filtros.')}
          highlightId={highlightId}
        />
      )}
      {tab === 'dashboard' && (
        <Dashboard claims={listed} onSelect={chooseStatus} />
      )}
    </Page>
  )
}
