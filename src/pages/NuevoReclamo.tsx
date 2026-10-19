import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Input, Page, PageHeader, Select, Textarea } from '../components/ui'
import { withCurrent } from '../data/catalog'
import { CLAIM_MOTIVES, type ClaimFile } from '../data/claims'
import type { Order } from '../data/orders'
import { claimAttachmentRejection, imageFileRejection, readAttachmentFile } from '../lib/attachment'
import { businessToday } from '../lib/schedule'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useClaims } from '../state/ClaimsContext'
import { useOrders } from '../state/OrdersContext'

const MAX_PHOTOS = 5

type FormErrors = Partial<
  Record<
    'client' | 'motive' | 'description' | 'products' | 'email' | 'photos' | 'file' | 'intakeCondition' | 'intakeAccessories',
    string
  >
>

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

export function NuevoReclamo() {
  const { user } = useAuth()
  const { orders } = useOrders()
  const navigate = useNavigate()
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
  const [workshop, setWorkshop] = useState(user?.role === 'deposito')
  const [coverage, setCoverage] = useState<'garantia' | 'cobro'>('garantia')
  const [intakeAt, setIntakeAt] = useState(businessToday)
  const [intakeCondition, setIntakeCondition] = useState('')
  const [intakeAccessories, setIntakeAccessories] = useState('')
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
    setWorkshop(user?.role === 'deposito')
    setCoverage('garantia')
    setIntakeAt(businessToday())
    setIntakeCondition('')
    setIntakeAccessories('')
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
    const invoice = invoices.map((item) => item.trim()).filter(Boolean)[0] ?? ''
    const productName = cleaned[0]?.name ?? ''
    if (workshop) {
      if (!invoice) nextErrors.file = 'Cargá la factura para el ingreso al taller.'
      if (!productName) nextErrors.products = 'Cargá el producto que ingresa al taller.'
      if (!intakeAt || intakeAt > businessToday()) nextErrors.file = 'La fecha de ingreso no puede ser futura.'
      const condition = intakeCondition.trim()
      const accessories = intakeAccessories.trim()
      if (condition.length < 5 || condition.length > 500) {
        nextErrors.intakeCondition = 'Contá en qué estado llega el producto.'
      }
      if (accessories.length > 200) nextErrors.intakeAccessories = 'Los accesorios pueden tener hasta 200 caracteres.'
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
      intake: workshop
        ? {
            invoice,
            client: client.trim(),
            product: productName,
            coverage,
            intakeAt: intakeAt || businessToday(),
            intakeCondition: intakeCondition.trim(),
            intakeAccessories: intakeAccessories.trim() || undefined,
          }
        : undefined,
    })
    setSaving(false)
    if (!result.ok) {
      setErrors((current) => ({ ...current, file: result.message }))
      return
    }
    reset()
    navigate(`/post-venta?reclamo=${encodeURIComponent(result.id)}`)
  }

  return (
    <Page>
      <PageHeader title="Nuevo reclamo" subtitle="Cargá el reclamo del cliente" />
      <form className="form-stack mt-4" onSubmit={onSubmit}>
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

          <div className="field full border-t border-border pt-4">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={workshop}
                onChange={(event) => setWorkshop(event.target.checked)}
              />
              El producto ingresa al taller
            </label>
            {workshop && (
              <div className="mt-3 grid gap-3">
                <Field label="Cobertura">
                  <Select
                    size="lg"
                    value={coverage}
                    onChange={(event) => setCoverage(event.target.value as 'garantia' | 'cobro')}
                  >
                    <option value="garantia">Garantía</option>
                    <option value="cobro">Cobro</option>
                  </Select>
                </Field>
                <Field label="Fecha de ingreso">
                  <Input
                    size="lg"
                    type="date"
                    value={intakeAt}
                    max={businessToday()}
                    onChange={(event) => setIntakeAt(event.target.value)}
                  />
                </Field>
                <Field label="Estado en que ingresa" required error={errors.intakeCondition}>
                  <Textarea
                    rows={3}
                    value={intakeCondition}
                    placeholder="Ej.: carcasa rayada, no enciende, sin tornillos"
                    onChange={(event) => setIntakeCondition(event.target.value)}
                  />
                </Field>
                <Field label="Accesorios que deja" error={errors.intakeAccessories}>
                  <Input
                    size="lg"
                    value={intakeAccessories}
                    onChange={(event) => setIntakeAccessories(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        <div className="form-actions mt-4">
          <Button variant="ghost" disabled={saving} onClick={reset}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving} loading={saving}>
            Crear reclamo
          </Button>
        </div>
      </section>
      </form>
    </Page>
  )
}