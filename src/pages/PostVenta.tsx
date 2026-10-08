import { useMemo, useRef, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
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
import { confirm } from '../lib/alerts'
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
  nuevo: 'bg-[#f1efe8] text-lumi-ink',
  recepcion: 'bg-[#e7f0ff] text-[#2458a6]',
  'pendiente-retiro': 'bg-[#ffe8cc] text-[#9a4d00]',
  'enviado-proveedor': 'bg-[#efe8ff] text-[#5b3d99]',
  reparacion: 'bg-[#fff4cc] text-lumi-ink',
  entregado: 'bg-[#e5f6ea] text-[#1d7a3a]',
  cancelado: 'bg-[#fde8e7] text-[#a33b38]',
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
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-lumi-line bg-white px-3 py-2">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-lumi-muted" aria-hidden="true">
        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
      />
    </label>
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

function ClaimFileButton({
  kind,
  file,
}: {
  kind: 'photo' | 'file'
  file: ClaimFile
}) {
  if (!file.dataUrl) return null
  const label = fileLabel(kind, file.name, file.dataUrl)
  return (
    <button
      type="button"
      className="self-start text-left text-sm font-medium text-lumi-ink hover:underline"
      title={`${label} ${file.name}`}
      onClick={() => openAttachment(file.name, file.dataUrl)}
    >
      {label}
      {kind === 'photo' ? ` · ${file.name}` : ''}
    </button>
  )
}

function NuevoReclamo({ onCreated }: { onCreated: (id: string) => void }) {
  const { orders } = useOrders()
  const { addClaim } = useClaims()
  const { sellers } = useCatalog()
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
  const [errors, setErrors] = useState<FormErrors>({})
  const photoRequest = useRef(0)
  const fileRequest = useRef(0)
  const fileAbort = useRef<(() => void) | null>(null)

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

  function onSubmit(event: FormEvent) {
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

    const result = addClaim({
      client: client.trim(),
      invoices: invoices.map((invoice) => invoice.trim()).filter(Boolean),
      phone: phone.trim(),
      email: email.trim(),
      seller,
      motive,
      description: description.trim(),
      products: cleaned,
      photos,
      attachment: attachment ?? undefined,
    })
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
          <div className="mt-2 overflow-hidden rounded-xl border border-lumi-line bg-white shadow-sm">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-lumi-muted">
                No hay pedidos que coincidan. Podés cargar el reclamo a mano.
              </p>
            ) : (
              matches.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="block w-full border-b border-lumi-line px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#f7f4ea]"
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
          <label className="field full">
            <span>Nombre del cliente *</span>
            <input
              value={client}
              placeholder="Nombre del cliente"
              aria-invalid={Boolean(errors.client)}
              onChange={(event) => setClient(event.target.value)}
            />
            {errors.client && <small className="field-error">{errors.client}</small>}
          </label>
          <div className="field full">
            <span>N° de factura / pedido</span>
            {invoices.map((invoice, index) => (
              <div className="inline-field" key={index}>
                <input
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
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setInvoices((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-button center"
              onClick={() => setInvoices((current) => [...current, ''])}
            >
              + Agregar otra factura
            </button>
          </div>
          <label className="field">
            <span>Teléfono</span>
            <input
              value={phone}
              placeholder="+54 11..."
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              placeholder="cliente@email.com"
              aria-invalid={Boolean(errors.email)}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </label>
          <label className="field">
            <span>Vendedor</span>
            <select value={seller} onChange={(event) => setSeller(event.target.value)}>
              <option value="">Seleccioná vendedor</option>
              {withCurrent(sellers, seller).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Motivo *</span>
            <select
              value={motive}
              aria-invalid={Boolean(errors.motive)}
              onChange={(event) => setMotive(event.target.value)}
            >
              <option value="">Seleccioná un motivo</option>
              {CLAIM_MOTIVES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {errors.motive && <small className="field-error">{errors.motive}</small>}
          </label>
          <label className="field full">
            <span>Descripción del problema *</span>
            <textarea
              value={description}
              rows={4}
              placeholder="Contá qué pasó..."
              aria-invalid={Boolean(errors.description)}
              onChange={(event) => setDescription(event.target.value)}
            />
            {errors.description && <small className="field-error">{errors.description}</small>}
          </label>
          <div className="field full">
            <span>Productos del reclamo *</span>
            {products.map((product, index) => (
              <div className="inline-field" key={index}>
                <input
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
                <input
                  value={product.quantity}
                  inputMode="numeric"
                  aria-label={`Cantidad del producto ${index + 1}`}
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
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            {errors.products && <small className="field-error">{errors.products}</small>}
            <button
              type="button"
              className="text-button center"
              onClick={() => setProducts((current) => [...current, { name: '', quantity: '1' }])}
            >
              + Agregar otro producto
            </button>
          </div>
          <div className="field full">
            <span>Foto (hasta 5, opcional)</span>
            <label
              className="detect-btn"
              style={{ display: 'inline-flex', justifyContent: 'center', padding: '10px 14px', cursor: 'pointer' }}
            >
              Agregar foto
              <input
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
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.photos && <small className="field-error">{errors.photos}</small>}
          </div>
          <label className="field full">
            <span>Adjuntar archivo</span>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={(event) => onAttachment(event.target.files?.[0])}
            />
            <small className="hint">PDF, Word, Excel o imagen. Máximo 2 MB.</small>
            {readingFile && <small className="hint">Leyendo archivo…</small>}
            {attachment && <small className="hint">{attachment.name}</small>}
            {errors.file && <small className="field-error">{errors.file}</small>}
          </label>
        </div>
        <div className="form-actions mt-4">
          <button type="button" className="btn-ghost" onClick={reset}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Guardar reclamo
          </button>
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
      <div className="order-stepper order-stepper-full max-sm:hidden" aria-label={`Estado: ${currentLabel}`}>
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
      <div
        className="order-stepper order-stepper-compact sm:hidden"
        aria-label={`Estado: ${currentLabel}`}
      >
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
  )
}

function ClaimCard({ claim, highlight }: { claim: Claim; highlight: boolean }) {
  const { setStatus, addNote } = useClaims()
  const [openStatus, setOpenStatus] = useState(false)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
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
    setStatus(claim.id, status)
    setOpenStatus(false)
  }

  return (
    <article
      className={`rounded-2xl bg-white p-4 shadow-sm ${highlight ? 'ring-2 ring-lumi-yellow' : ''} ${
        openStatus ? 'relative z-20' : ''
      }`}
    >
      {openStatus && (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Cerrar menú de estado"
          onClick={() => setOpenStatus(false)}
        />
      )}

      <div className="w-full">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[claim.status]}`}
        >
          {CLAIM_STATUS_LABEL[claim.status]}
        </span>

        {claim.status === 'cancelado' ? null : <ClaimStepper status={claim.status} />}

        {latest && (
          <p className="mt-2 text-sm text-lumi-muted">
            {previous ? `${CLAIM_STATUS_LABEL[previous.status]} → ` : ''}
            {CLAIM_STATUS_LABEL[latest.status]} · {formatWhen(latest.at)}
          </p>
        )}

        {!terminal && nextStatus && (
          <button
            type="button"
            className="btn-primary mt-3 w-full sm:w-auto"
            onClick={() => void applyStatus(nextStatus)}
          >
            Pasar a {CLAIM_STATUS_LABEL[nextStatus]}
          </button>
        )}

        {claim.status !== 'cancelado' && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {prevStatus && (
              <button
                type="button"
                className="text-sm text-lumi-muted hover:text-lumi-ink hover:underline"
                onClick={() => void applyStatus(prevStatus)}
              >
                Volver a {CLAIM_STATUS_LABEL[prevStatus]}
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                className="text-sm text-lumi-muted hover:text-lumi-ink hover:underline"
                aria-expanded={openStatus}
                aria-haspopup="menu"
                onClick={() => {
                  setOpenStatus((current) => !current)
                  setConfirmCancel(false)
                }}
              >
                Cambiar a otro estado
              </button>
              {openStatus && (
                <div
                  role="menu"
                  className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-lumi-line bg-white p-1 shadow-lg"
                >
                  {CLAIM_PROGRESS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="menuitem"
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea] ${
                        claim.status === status ? 'font-semibold' : ''
                      }`}
                      onClick={() => void applyStatus(status)}
                    >
                      {CLAIM_STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 border-t border-lumi-line pt-4">
        <div className="min-w-0">
          <p className="font-semibold">
            {claim.id} — {claim.client}
            {invoice ? ` (${invoice})` : ''}
          </p>
          <p className="mt-1 text-sm text-[#5f5b55]">
            {claim.motive} · {formatWhen(claim.createdAt)}
            {claim.phone ? ` · ${claim.phone}` : ''}
            {claim.seller ? ` · Vendedor: ${claim.seller}` : ''}
            {claim.email ? ` · ${claim.email}` : ''}
          </p>
          <p className="mt-2 text-sm">{claim.description}</p>
          <p className="mt-2 text-sm text-[#5f5b55]">
            {claim.products.map((product) => `${product.name} (x${product.quantity})`).join(' · ')}
          </p>
          {(claim.photos?.some((photo) => photo.dataUrl) || claim.attachment?.dataUrl) && (
            <div className="mt-2 flex flex-col items-start gap-1">
              {claim.photos?.map((photo, index) => (
                <ClaimFileButton key={`${photo.name}-${index}`} kind="photo" file={photo} />
              ))}
              {claim.attachment?.dataUrl && <ClaimFileButton kind="file" file={claim.attachment} />}
            </div>
          )}
          {notes.map((event, index) => (
            <p key={`${event.at}-${index}`} className="mt-1 text-sm text-[#5f5b55]">
              Nota · {formatWhen(event.at)} · {event.note}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            className="text-sm text-lumi-muted hover:text-lumi-ink"
            onClick={() => {
              setNoting((current) => !current)
              setConfirmCancel(false)
            }}
          >
            Nota
          </button>
          {isOpenClaim(claim.status) &&
            (confirmCancel ? (
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="text-[#a33b38]"
                  onClick={() => setStatus(claim.id, 'cancelado')}
                >
                  Confirmar
                </button>
                <button type="button" className="text-lumi-muted" onClick={() => setConfirmCancel(false)}>
                  Volver
                </button>
              </div>
            ) : (
              <button type="button" className="text-sm text-[#a33b38]" onClick={() => setConfirmCancel(true)}>
                Cancelar
              </button>
            ))}
        </div>
      </div>
      {noting && (
        <div className="mt-3 flex gap-2">
          <input
            value={note}
            placeholder="Agregar una nota..."
            onChange={(event) => setNote(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-lumi-line px-3 py-2 text-sm"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              addNote(claim.id, note)
              setNote('')
              setNoting(false)
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </article>
  )
}

function FilterBar({
  seller,
  period,
  onSeller,
  onPeriod,
  claims,
}: {
  seller: string
  period: Period
  onSeller: (value: string) => void
  onPeriod: (value: Period) => void
  claims: Claim[]
}) {
  const { sellers } = useCatalog()
  const sellerOptions = withExtras(
    sellers,
    claims.map((claim) => claim.seller),
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={seller}
        aria-label="Vendedor"
        onChange={(event) => onSeller(event.target.value)}
        className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
      >
        <option value="todos">Todos los vendedores</option>
        {sellerOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={period}
        aria-label="Período"
        onChange={(event) => onPeriod(event.target.value as Period)}
        className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
      >
        {PERIODS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm disabled:text-lumi-muted"
        disabled={claims.length === 0}
        onClick={() => downloadClaims(claims)}
      >
        Descargar Excel
      </button>
    </div>
  )
}

function ClaimList({
  claims,
  empty,
  highlightId,
  seller,
  period,
  onSeller,
  onPeriod,
}: {
  claims: Claim[]
  empty: string
  highlightId: string | null
  seller: string
  period: Period
  onSeller: (value: string) => void
  onPeriod: (value: Period) => void
}) {
  return (
    <div className="mt-4">
      <FilterBar
        seller={seller}
        period={period}
        onSeller={onSeller}
        onPeriod={onPeriod}
        claims={claims}
      />

      {claims.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-lumi-muted shadow-sm">{empty}</div>
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

function Dashboard({
  claims,
  seller,
  period,
  onSeller,
  onPeriod,
}: {
  claims: Claim[]
  seller: string
  period: Period
  onSeller: (value: string) => void
  onPeriod: (value: Period) => void
}) {
  const open = claims.filter((claim) => isOpenClaim(claim.status)).length
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

  const stats = [
    { label: 'Total reclamos', value: String(claims.length), tone: 'text-[#2458a6]' },
    { label: 'En curso', value: String(open), tone: 'text-[#c2610c]' },
    { label: 'Resueltos', value: String(resolved.length), tone: 'text-[#1d7a3a]' },
    {
      label: 'Tiempo prom. resolución',
      value: averageDays === null ? '—' : `${averageDays.toFixed(1)}d`,
      tone: 'text-[#1d7a3a]',
    },
    { label: 'Tasa de resolución', value: `${rate}%`, tone: 'text-[#5b3d99]' },
  ]

  return (
    <div className="mt-4 flex flex-col gap-4">
      <FilterBar
        seller={seller}
        period={period}
        onSeller={onSeller}
        onPeriod={onPeriod}
        claims={claims}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl bg-white px-4 py-5 text-center shadow-sm">
            <p className={`text-3xl font-semibold ${stat.tone}`}>{stat.value}</p>
            <p className="mt-1 text-sm text-lumi-muted">{stat.label}</p>
          </article>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Reclamos por estado</h2>
        {byStatus.length === 0 ? (
          <p className="mt-4 text-sm text-lumi-muted">Cuando cargues reclamos, vas a ver cómo se reparten.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {byStatus.map((item) => (
              <li key={item.status}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{item.label}</span>
                  <span className="tabular-nums">{item.count}</span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[#f3f1ea]">
                  <span
                    className="block h-full rounded-full bg-[#3b6fd8]"
                    style={{ width: `${(item.count / statusMax) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Top motivos de reclamo</h2>
        {byMotive.length === 0 ? (
          <p className="mt-4 text-sm text-lumi-muted">Todavía no hay motivos para mostrar.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {byMotive.map((item) => (
              <li key={item.motive}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.motive}</span>
                  <span className="tabular-nums">{item.count}</span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[#f3f1ea]">
                  <span
                    className="block h-full rounded-full bg-[#e39b2b]"
                    style={{ width: `${(item.count / motiveMax) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function PostVenta() {
  const { claims, notice, dismissNotice } = useClaims()
  const [tab, setTab] = useState<Tab>('nuevo')
  const [query, setQuery] = useState('')
  const [seller, setSeller] = useState('todos')
  const [period, setPeriod] = useState<Period>('30')
  const [highlightId, setHighlightId] = useState<string | null>(null)

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

  return (
    <section className="page">
      <header className="page-header">
        <h1>Post Venta</h1>
        <p>Cargá y seguí los reclamos de clientes</p>
      </header>

      {notice && (
        <p className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-[#fff4cc] px-4 py-2 text-sm text-lumi-ink">
          <span>{notice}</span>
          <button type="button" className="shrink-0 font-medium" onClick={dismissNotice}>
            Cerrar
          </button>
        </p>
      )}

      <div className="mt-5">
        <SearchField
          value={query}
          placeholder="Buscar por cliente, factura o producto..."
          onChange={setQuery}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-lumi-line">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`border-b-2 px-3 py-2 text-sm ${
                active
                  ? 'border-lumi-yellow font-semibold text-lumi-ink'
                  : 'border-transparent text-lumi-muted'
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
          seller={seller}
          period={period}
          onSeller={setSeller}
          onPeriod={setPeriod}
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
          seller={seller}
          period={period}
          onSeller={setSeller}
          onPeriod={setPeriod}
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
          seller={seller}
          period={period}
          onSeller={setSeller}
          onPeriod={setPeriod}
        />
      )}
      {tab === 'dashboard' && (
        <Dashboard
          claims={listed}
          seller={seller}
          period={period}
          onSeller={setSeller}
          onPeriod={setPeriod}
        />
      )}
    </section>
  )
}
