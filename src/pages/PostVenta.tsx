import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Button, Card, Field, FilterBar, Input, KpiCard, LoadState, Page, PageHeader, Select, Textarea } from '../components/ui'
import { withCurrent, withExtras } from '../data/catalog'
import {
  CLAIM_MOTIVES,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_ORDER,
  isOpenClaim,
  type Claim,
  type ClaimFile,
  type ClaimStatus,
} from '../data/claims'
import type { Order } from '../data/orders'
import {
  attachmentKind,
  claimAttachmentRejection,
  imageFileRejection,
  openAttachment,
  readAttachmentFile,
} from '../lib/attachment'
import { confirm, error } from '../lib/alerts'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useClaims } from '../state/ClaimsContext'
import { useOrders } from '../state/OrdersContext'

const CLAIM_PROGRESS = CLAIM_STATUS_ORDER.filter(
  (status): status is Exclude<ClaimStatus, 'cancelado'> => status !== 'cancelado',
)

type Tab = 'nuevo' | 'reclamos' | 'finalizados' | 'cancelados' | 'dashboard'
type Period = '7' | '30' | 'mes' | 'todos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo Reclamo' },
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

const MAX_PHOTOS = 5

const STATUS_BADGE: Record<ClaimStatus, string> = {
  nuevo: 'bg-surface-muted text-text',
  recepcion: 'bg-info-soft text-info',
  'pendiente-retiro': 'bg-orange-soft text-orange',
  'enviado-proveedor': 'bg-purple-soft text-purple',
  reparacion: 'bg-accent-soft text-text',
  entregado: 'bg-success-soft text-success',
  cancelado: 'bg-danger-soft text-danger-deep',
}

type FormErrors = Partial<
  Record<'client' | 'motive' | 'description' | 'products' | 'email' | 'photos' | 'file', string>
>

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

function SearchField({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <Field label="Buscar pedido">
      <Input
        size="lg"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
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

function NuevoReclamo({ onCreated }: { onCreated: (id: string) => void }) {
  const { user } = useAuth()
  const { orders } = useOrders()
  const { addClaim } = useClaims()
  const { sellers } = useCatalog()
  const sellerLocked = user?.role === 'vendedor'
  const lockedSeller = sellerLocked ? (user?.sellerName?.trim() ?? '') : ''
  const [lookup, setLookup] = useState('')
  const [client, setClient] = useState('')
  const [invoices, setInvoices] = useState([''])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [seller, setSeller] = useState('')
  const [motive, setMotive] = useState('')
  const [description, setDescription] = useState('')
  const [products, setProducts] = useState([{ name: '', quantity: '1' }])
  const [photos, setPhotos] = useState<ClaimFile[]>([])
  const [attachment, setAttachment] = useState<ClaimFile | null>(null)
  const [readingPhotos, setReadingPhotos] = useState(false)
  const [readingFile, setReadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const photoRequest = useRef(0)
  const fileRequest = useRef(0)
  const fileAbort = useRef<(() => void) | null>(null)
  const sellerValue = sellerLocked ? lockedSeller : seller

  const needle = lookup.trim().toLowerCase()
  const matches = needle.length < 2
    ? []
    : orders
        .filter((order) => {
          const blob = [order.id, order.client, order.phone, ...(order.invoices ?? [])]
            .join(' ')
            .toLowerCase()
          return blob.includes(needle)
        })
        .slice(0, 5)

  function applyOrder(order: Order) {
    setClient(order.client)
    setPhone(order.phone ?? '')
    setSeller(order.seller ?? '')
    const known = (order.invoices ?? []).filter(Boolean)
    setInvoices(known.length > 0 ? known : [order.id])
    setLookup('')
    setErrors((current) => ({ ...current, client: undefined }))
  }

  function reset() {
    setLookup('')
    setClient('')
    setInvoices([''])
    setPhone('')
    setEmail('')
    setSeller('')
    setMotive('')
    setDescription('')
    setProducts([{ name: '', quantity: '1' }])
    photoRequest.current += 1
    fileRequest.current += 1
    fileAbort.current?.()
    fileAbort.current = null
    setPhotos([])
    setAttachment(null)
    setReadingPhotos(false)
    setReadingFile(false)
    setErrors({})
  }

  async function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setErrors((current) => ({ ...current, photos: 'Podés adjuntar hasta 5 fotos.' }))
      return
    }
    const incoming = [...files].slice(0, room)
    const overflow = files.length > room
    const request = photoRequest.current + 1
    photoRequest.current = request
    setReadingPhotos(true)
    const loaded: ClaimFile[] = []
    let problem: string | undefined
    for (const file of incoming) {
      const rejection = imageFileRejection(file)
      if (rejection) {
        problem = rejection
        continue
      }
      const job = readAttachmentFile(file)
      try {
        const dataUrl = await job.promise
        if (photoRequest.current !== request) return
        loaded.push({ name: file.name, dataUrl })
      } catch (error) {
        if (photoRequest.current !== request) return
        if (!isAbortError(error)) problem = 'No se pudo leer la foto.'
      }
    }
    if (photoRequest.current !== request) return
    setPhotos((current) => [...current, ...loaded].slice(0, MAX_PHOTOS))
    setErrors((current) => ({
      ...current,
      photos: problem ?? (overflow ? 'Podés adjuntar hasta 5 fotos.' : undefined),
    }))
    setReadingPhotos(false)
  }

  function onAttachment(file: File | undefined) {
    fileRequest.current += 1
    const request = fileRequest.current
    fileAbort.current?.()
    fileAbort.current = null
    if (!file) {
      setAttachment(null)
      setReadingFile(false)
      setErrors((current) => ({ ...current, file: undefined }))
      return
    }
    const rejection = claimAttachmentRejection(file)
    if (rejection) {
      setAttachment(null)
      setReadingFile(false)
      setErrors((current) => ({ ...current, file: rejection }))
      return
    }
    const job = readAttachmentFile(file)
    fileAbort.current = job.abort
    setReadingFile(true)
    setErrors((current) => ({ ...current, file: undefined }))
    job.promise
      .then((dataUrl) => {
        if (fileRequest.current !== request) return
        setAttachment({ name: file.name, dataUrl })
        setReadingFile(false)
      })
      .catch((error: unknown) => {
        if (fileRequest.current !== request) return
        setReadingFile(false)
        if (isAbortError(error)) return
        setAttachment(null)
        setErrors((current) => ({ ...current, file: 'No se pudo leer el archivo.' }))
      })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: FormErrors = {}
    if (!client.trim()) nextErrors.client = 'Ingresá el nombre del cliente.'
    if (!motive) nextErrors.motive = 'Elegí un motivo.'
    if (!description.trim()) nextErrors.description = 'Contá qué pasó.'
    const cleaned = products
      .map((product) => ({
        name: product.name.trim(),
        quantity: Math.max(1, Number(product.quantity) || 1),
      }))
      .filter((product) => product.name)
    if (cleaned.length === 0) nextErrors.products = 'Agregá al menos un producto.'
    if (email.trim() && !email.includes('@')) nextErrors.email = 'El email no parece válido.'
    if (readingPhotos || readingFile) {
      nextErrors.file = 'Esperá a que se terminen de leer los archivos.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    const result = await addClaim({
      client: client.trim(),
      invoices: invoices.map((invoice) => invoice.trim()).filter(Boolean),
      phone: phone.trim(),
      email: email.trim(),
      seller: sellerValue,
      motive,
      description: description.trim(),
      products: cleaned,
      photos,
      attachment: attachment ?? undefined,
    })
    setSaving(false)
    if (!result.ok) {
      setErrors((current) => ({ ...current, file: result.message }))
      return
    }
    reset()
    onCreated(result.id)
  }

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <div>
        <SearchField
          value={lookup}
          placeholder="Buscar cliente, factura o producto antes de cargar un nuevo reclamo..."
          onChange={setLookup}
        />
        {needle.length >= 2 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">
                No hay pedidos que coincidan. Podés cargar el reclamo a mano.
              </p>
            ) : (
              matches.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted"
                  onClick={() => applyOrder(order)}
                >
                  <strong>{order.id}</strong> — {order.client}
                  {order.invoices && order.invoices.length > 0 ? ` · ${order.invoices.join(', ')}` : ''}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <section className="form-card">
        <h2>Nuevo reclamo</h2>
        <div className="field-grid">
          <div className="field full">
            <Field label="Nombre del cliente *" error={errors.client}>
              <Input
                size="lg"
                value={client}
                placeholder="Nombre del cliente"
                onChange={(event) => setClient(event.target.value)}
              />
            </Field>
          </div>
          <div className="field full">
            <span>N° de factura / pedido</span>
            {invoices.map((invoice, index) => (
              <div className="inline-field" key={index}>
                <Input
                  size="lg"
                  value={invoice}
                  placeholder="Ej: 0001-00012345"
                  aria-label={`Factura ${index + 1}`}
                  onChange={(event) =>
                    setInvoices((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                />
                {invoices.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setInvoices((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => setInvoices((current) => [...current, ''])}
            >
              + Agregar otra factura
            </Button>
          </div>
          <Field label="Teléfono">
            <Input
              size="lg"
              value={phone}
              placeholder="+54 11..."
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              size="lg"
              type="email"
              value={email}
              placeholder="cliente@email.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Vendedor">
            <Select
              size="lg"
              value={sellerValue}
              disabled={sellerLocked || saving}
              onChange={(event) => setSeller(event.target.value)}
            >
              <option value="">Seleccioná vendedor</option>
              {withCurrent(sellers, sellerValue).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo *" error={errors.motive}>
            <Select
              size="lg"
              value={motive}
              onChange={(event) => setMotive(event.target.value)}
            >
              <option value="">Seleccioná un motivo</option>
              {CLAIM_MOTIVES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <div className="field full">
            <Field label="Descripción del problema *" error={errors.description}>
              <Textarea
                value={description}
                rows={4}
                placeholder="Contá qué pasó..."
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          <div className="field full">
            <span>Productos del reclamo *</span>
            {products.map((product, index) => (
              <div className="inline-field" key={index}>
                <Input
                  size="lg"
                  value={product.name}
                  placeholder="Escribí el nombre o código del producto"
                  aria-label={`Producto ${index + 1}`}
                  aria-invalid={Boolean(errors.products)}
                  onChange={(event) =>
                    setProducts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  size="lg"
                  value={product.quantity}
                  inputMode="numeric"
                  aria-label={`Cantidad del producto ${index + 1}`}
                  className="max-w-[4.5rem] shrink-0"
                  style={{ width: 72, flex: '0 0 72px' }}
                  onChange={(event) =>
                    setProducts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, quantity: event.target.value } : item,
                      ),
                    )
                  }
                />
                {products.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            {errors.products && <small className="field-error">{errors.products}</small>}
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => setProducts((current) => [...current, { name: '', quantity: '1' }])}
            >
              + Agregar otro producto
            </Button>
          </div>
          <div className="field full">
            <span>Foto (hasta 5, opcional)</span>
            <label
              className="detect-btn"
              style={{ display: 'inline-flex', justifyContent: 'center', padding: '10px 14px', cursor: 'pointer' }}
            >
              Agregar foto
              <Input
                size="lg"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  onPhotos(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            {readingPhotos && <small className="hint">Leyendo fotos…</small>}
            {photos.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {photos.map((photo, index) => (
                  <li key={`${photo.name}-${index}`} className="flex items-center justify-between text-sm">
                    <span className="truncate">{photo.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {errors.photos && <small className="field-error">{errors.photos}</small>}
          </div>
          <div className="field full">
            <Field
              label="Adjuntar archivo"
              hint={
                readingFile
                  ? 'Leyendo archivo…'
                  : attachment
                    ? `${attachment.name}. PDF, Word, Excel o imagen. Máximo 2 MB.`
                    : 'PDF, Word, Excel o imagen. Máximo 2 MB.'
              }
              error={errors.file}
            >
              <Input
                size="lg"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(event) => onAttachment(event.target.files?.[0])}
              />
            </Field>
          </div>
        </div>
        <div className="form-actions mt-4">
          <Button variant="ghost" disabled={saving} onClick={reset}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving} loading={saving}>
            Guardar reclamo
          </Button>
        </div>
      </section>
    </form>
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
  const [openStatus, setOpenStatus] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const invoice = claim.invoices[0]
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

        {!terminal && nextStatus && (
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

        {claim.status !== 'cancelado' && (
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
          {isOpenClaim(claim.status) &&
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

function Dashboard({ claims }: { claims: Claim[] }) {
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

  const byStatus = CLAIM_STATUS_ORDER.filter((status) => status !== 'cancelado')
    .map((status) => ({
      status,
      label: CLAIM_STATUS_LABEL[status],
      count: claims.filter((claim) => claim.status === status).length,
    }))
    .filter((item) => item.count > 0)
  const statusMax = Math.max(1, ...byStatus.map((item) => item.count))

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
        <h2 className="text-base font-semibold">Reclamos por estado</h2>
        {byStatus.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Cuando cargues reclamos, vas a ver cómo se reparten.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {byStatus.map((item) => (
              <li key={item.status}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{item.label}</span>
                  <span className="tabular-nums">{item.count}</span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full bg-info"
                    style={{ width: `${(item.count / statusMax) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
  const [tab, setTab] = useState<Tab>('nuevo')
  const [query, setQuery] = useState('')
  const [seller, setSeller] = useState('todos')
  const [period, setPeriod] = useState<Period>('30')
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

  const reclamos = listed.filter((claim) => isOpenClaim(claim.status))
  const finalizados = listed.filter((claim) => claim.status === 'entregado')
  const cancelados = listed.filter((claim) => claim.status === 'cancelado')

  function openCreated(id: string) {
    setHighlightId(id)
    setTab('reclamos')
    setSeller('todos')
    setPeriod('30')
    setQuery('')
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
      <PageHeader title="Post Venta" subtitle="Cargá y seguí los reclamos de clientes" />

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
        selects={
          tab === 'nuevo'
            ? undefined
            : [
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
              ]
        }
        activeCount={
          tab === 'nuevo'
            ? query.trim()
              ? 1
              : 0
            : (query.trim() ? 1 : 0) + (seller !== 'todos' ? 1 : 0) + (period !== '30' ? 1 : 0)
        }
        onClear={() => {
          setQuery('')
          setSeller('todos')
          setPeriod('30')
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
              {item.id === 'nuevo' ? '+ ' : ''}
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'nuevo' && <NuevoReclamo onCreated={openCreated} />}
      {tab === 'reclamos' && (
        <ClaimList
          claims={reclamos}
          empty={
            claims.length === 0
              ? 'Todavía no hay reclamos cargados.'
              : 'No hay reclamos en curso para esos filtros.'
          }
          highlightId={highlightId}
        />
      )}
      {tab === 'finalizados' && (
        <ClaimList
          claims={finalizados}
          empty={
            claims.length === 0
              ? 'Todavía no hay reclamos cargados.'
              : 'No hay reclamos finalizados para esos filtros.'
          }
          highlightId={highlightId}
        />
      )}
      {tab === 'cancelados' && (
        <ClaimList
          claims={cancelados}
          empty={
            claims.length === 0
              ? 'Todavía no hay reclamos cargados.'
              : 'No hay reclamos cancelados para esos filtros.'
          }
          highlightId={highlightId}
        />
      )}
      {tab === 'dashboard' && (
        <Dashboard claims={listed} />
      )}
    </Page>
  )
}
