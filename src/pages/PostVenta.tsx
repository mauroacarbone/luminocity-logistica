import { useMemo, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { SELLERS } from '../data/catalog'
import {
  CLAIM_MOTIVES,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_ORDER,
  isOpenClaim,
  type Claim,
  type ClaimStatus,
} from '../data/claims'
import type { Order } from '../data/orders'
import { useClaims } from '../state/ClaimsContext'
import { useOrders } from '../state/OrdersContext'

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
const MAX_ATTACHMENT_BYTES = 500 * 1024

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
    Fotos: claim.photoNames.length,
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

function NuevoReclamo({ onCreated }: { onCreated: (id: string) => void }) {
  const { orders } = useOrders()
  const { addClaim } = useClaims()
  const [lookup, setLookup] = useState('')
  const [client, setClient] = useState('')
  const [invoices, setInvoices] = useState([''])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [seller, setSeller] = useState('')
  const [motive, setMotive] = useState('')
  const [description, setDescription] = useState('')
  const [products, setProducts] = useState([{ name: '', quantity: '1' }])
  const [photoNames, setPhotoNames] = useState<string[]>([])
  const [attachmentName, setAttachmentName] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

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
    setPhotoNames([])
    setAttachmentName('')
    setErrors({})
  }

  function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = MAX_PHOTOS - photoNames.length
    if (room <= 0) {
      setErrors((current) => ({ ...current, photos: 'Podés adjuntar hasta 5 fotos.' }))
      return
    }
    const incoming = [...files].slice(0, room).map((file) => file.name)
    setPhotoNames((current) => [...current, ...incoming])
    setErrors((current) => ({
      ...current,
      photos: files.length > room ? 'Podés adjuntar hasta 5 fotos.' : undefined,
    }))
  }

  function onAttachment(file: File | undefined) {
    if (!file) {
      setAttachmentName('')
      setErrors((current) => ({ ...current, file: undefined }))
      return
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentName('')
      setErrors((current) => ({ ...current, file: 'El archivo no puede pesar más de 500 KB.' }))
      return
    }
    setAttachmentName(file.name)
    setErrors((current) => ({ ...current, file: undefined }))
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
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const id = addClaim({
      client: client.trim(),
      invoices: invoices.map((invoice) => invoice.trim()).filter(Boolean),
      phone: phone.trim(),
      email: email.trim(),
      seller,
      motive,
      description: description.trim(),
      products: cleaned,
      photoNames,
      attachmentName,
    })
    reset()
    onCreated(id)
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
              {SELLERS.map((name) => (
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
            {photoNames.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {photoNames.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center justify-between text-sm">
                    <span className="truncate">{name}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setPhotoNames((current) => current.filter((_, itemIndex) => itemIndex !== index))
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
            <small className="hint">PDF, documento, planilla o imagen. Máximo 500 KB.</small>
            {attachmentName && <small className="hint">{attachmentName}</small>}
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
      <div className="flex items-start justify-between gap-3">
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {claim.photoNames.length > 0 && (
              <span className="rounded-full bg-[#e5f6ea] px-2 py-0.5 text-xs font-medium text-[#1d7a3a]">
                {claim.photoNames.length} foto{claim.photoNames.length === 1 ? '' : 's'}
              </span>
            )}
            {claim.attachmentName && (
              <span className="rounded-full bg-[#f1efe8] px-2 py-0.5 text-xs">{claim.attachmentName}</span>
            )}
          </div>
          {latest && (
            <p className="mt-2 text-xs text-lumi-muted">
              {previous ? `${CLAIM_STATUS_LABEL[previous.status]} → ` : ''}
              {CLAIM_STATUS_LABEL[latest.status]} · {formatWhen(latest.at)}
            </p>
          )}
          {notes.map((event, index) => (
            <p key={`${event.at}-${index}`} className="mt-1 text-sm text-[#5f5b55]">
              Nota · {formatWhen(event.at)} · {event.note}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[claim.status]}`}>
            {CLAIM_STATUS_LABEL[claim.status]}
          </span>
          <div className="relative">
            <button
              type="button"
              className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm hover:bg-[#f7f4ea]"
              aria-expanded={openStatus}
              aria-haspopup="menu"
              onClick={() => {
                setOpenStatus((current) => !current)
                setConfirmCancel(false)
              }}
            >
              Estado
            </button>
            {openStatus && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-lumi-line bg-white p-1 shadow-lg"
              >
                {CLAIM_STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="menuitem"
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ea] ${
                      claim.status === status ? 'font-semibold' : ''
                    }`}
                    onClick={() => {
                      setStatus(claim.id, status)
                      setOpenStatus(false)
                    }}
                  >
                    {CLAIM_STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            )}
          </div>
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
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={seller}
          aria-label="Vendedor"
          onChange={(event) => onSeller(event.target.value)}
          className="rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
        >
          <option value="todos">Todos los vendedores</option>
          {SELLERS.map((name) => (
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

function Dashboard({ claims }: { claims: Claim[] }) {
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
  const { claims } = useClaims()
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
  const dashboardClaims = useMemo(
    () => claims.filter((claim) => matchesQuery(claim, needle)),
    [claims, needle],
  )

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
          empty="No hay reclamos en curso para esos filtros."
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
          empty="No hay reclamos finalizados para esos filtros."
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
          empty="No hay reclamos cancelados para esos filtros."
          highlightId={highlightId}
          seller={seller}
          period={period}
          onSeller={setSeller}
          onPeriod={setPeriod}
        />
      )}
      {tab === 'dashboard' && <Dashboard claims={dashboardClaims} />}
    </section>
  )
}
