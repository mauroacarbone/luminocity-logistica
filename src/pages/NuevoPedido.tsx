import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { withCurrent } from '../data/catalog'
import type { Order } from '../data/orders'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_SAVE_ERROR,
  attachmentKind,
  attachmentRejection,
  openAttachment,
  readAttachmentFile,
} from '../lib/attachment'
import { geocodeSearch, locateAddress, locatePoint, type GeocodeHit, type LocatedAddress } from '../lib/geocode'
import { asDeliveryZone, inferZone, zoneDayWarning, zoneDays, type ZoneQuery } from '../lib/zone'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'

type Errors = Partial<
  Record<
    | 'seller'
    | 'client'
    | 'phone'
    | 'address'
    | 'between'
    | 'propertyType'
    | 'deliveryDate'
    | 'amount'
    | 'file',
    string
  >
>

function Toggle({
  pressed,
  label,
  onClick,
}: {
  pressed: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={pressed ? 'toggle on' : 'toggle'}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
    >
      <span />
    </button>
  )
}

function formatLoadedAt(date: Date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const timePart = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${day}/${month}/${year}, ${timePart}`
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function PedidoForm({ editingId }: { editingId?: string }) {
  const navigate = useNavigate()
  const { orders, addOrder, updateOrder } = useOrders()
  const { sellers, propertyTypes, timeWindows, transporters, zones } = useCatalog()
  const existing = orders.find((order) => order.id === editingId)
  const [seller, setSeller] = useState(existing?.seller ?? '')
  const [client, setClient] = useState(existing?.client ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [invoices, setInvoices] = useState(
    existing?.invoices && existing.invoices.length > 0 ? existing.invoices : [''],
  )
  const [collectOnDelivery, setCollectOnDelivery] = useState(existing?.collectOnDelivery ?? false)
  const [amount, setAmount] = useState(existing?.amount ?? '')
  const savedZone = existing?.zone ?? ''
  const [address, setAddress] = useState(existing?.address ?? '')
  const [lookup, setLookup] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [deliveryZone, setDeliveryZone] = useState(savedZone ?? '')
  const [zoneManual, setZoneManual] = useState(Boolean(savedZone))
  const [zoneHint, setZoneHint] = useState<ZoneQuery | null>(null)
  const [zonePending, setZonePending] = useState(false)
  const [betweenStreet1, setBetweenStreet1] = useState(existing?.betweenStreet1 ?? '')
  const [betweenStreet2, setBetweenStreet2] = useState(existing?.betweenStreet2 ?? '')
  const [propertyType, setPropertyType] = useState(existing?.propertyType ?? '')
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate ?? '')
  const [timeWindow, setTimeWindow] = useState(existing?.timeWindow ?? timeWindows[0] ?? '')
  const [requiresPickup, setRequiresPickup] = useState(existing?.requiresPickup ?? false)
  const [transporter, setTransporter] = useState(existing?.transporter ?? transporters[0] ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [storedId, setStoredId] = useState<string | undefined>(existing?.id)
  const [attachmentName, setAttachmentName] = useState(existing?.attachmentName ?? '')
  const [attachmentDataUrl, setAttachmentDataUrl] = useState(existing?.attachmentDataUrl ?? '')
  const [readingFile, setReadingFile] = useState(false)
  const [receiverName, setReceiverName] = useState(existing?.receiverName ?? '')
  const [receiverDni, setReceiverDni] = useState(existing?.receiverDni ?? '')
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  const [betweenNote, setBetweenNote] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const addressRef = useRef<HTMLDivElement>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const locateAbort = useRef<AbortController | null>(null)
  const pickingSuggestion = useRef(false)
  const blurTimer = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const attachmentSectionRef = useRef<HTMLElement>(null)
  const readCancel = useRef<(() => void) | null>(null)
  const fileRequest = useRef(0)
  const listId = useId()

  function updateInvoice(index: number, value: string) {
    setInvoices((current) =>
      current.map((invoice, itemIndex) => (itemIndex === index ? value : invoice)),
    )
  }

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
      locateAbort.current?.abort()
      readCancel.current?.()
    }
  }, [])

  useEffect(() => {
    if (zoneManual) return
    const handle = window.setTimeout(() => {
      const next = inferZone({
        address,
        displayName: zoneHint?.displayName,
        place: zoneHint?.place,
      })
      setDeliveryZone(next ?? '')
      setZonePending(false)
    }, 500)
    return () => window.clearTimeout(handle)
  }, [address, zoneHint, zoneManual])

  useEffect(() => {
    if (lookup.length < 3) return
    const controller = new AbortController()
    searchAbort.current = controller
    const handle = window.setTimeout(() => {
      geocodeSearch(lookup, controller.signal)
        .then((hits) => {
          if (controller.signal.aborted) return
          const input = addressRef.current?.querySelector('input')
          setSuggestions(hits)
          setActiveSuggestion(0)
          setSuggestOpen(hits.length > 0 && document.activeElement === input)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return
          setSuggestions([])
          setSuggestOpen(false)
        })
    }, 500)
    return () => {
      window.clearTimeout(handle)
      controller.abort()
    }
  }, [lookup])

  useEffect(() => {
    if (!suggestOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!addressRef.current?.contains(event.target as Node)) {
        searchAbort.current?.abort()
        setSuggestOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [suggestOpen])

  function onAddressChange(value: string) {
    const nextLookup = value.trim()
    setAddress(value)
    setLookup(nextLookup)
    if (nextLookup.length < 3) {
      setSuggestions([])
      setSuggestOpen(false)
    }
    setLocateError('')
    setBetweenNote('')
    setZoneManual(false)
    setZoneHint(null)
    setZonePending(true)
  }

  function applyLocated(located: LocatedAddress) {
    setLookup('')
    setSuggestions([])
    setSuggestOpen(false)
    setZoneManual(false)
    setZoneHint(located.hint)
    setAddress(located.street)
    setDeliveryZone(
      inferZone({
        address: located.street,
        displayName: located.hint.displayName,
        place: located.hint.place,
      }) ?? '',
    )
    setZonePending(false)
    setLocateError('')
    setErrors((current) => ({ ...current, address: undefined, between: located.between.length ? undefined : current.between }))
    if (located.between.length >= 2) {
      setBetweenStreet1(located.between[0])
      setBetweenStreet2(located.between[1])
      setBetweenNote('')
    } else if (located.between.length === 1) {
      setBetweenStreet1(located.between[0])
      setBetweenStreet2('')
      setBetweenNote('Encontré una sola entre calle; completá la otra a mano.')
    } else {
      setBetweenStreet1('')
      setBetweenStreet2('')
      setBetweenNote('No pude detectar entre calles; completalas a mano.')
    }
  }

  async function runLocate(load: (signal: AbortSignal) => Promise<LocatedAddress>) {
    locateAbort.current?.abort()
    const controller = new AbortController()
    locateAbort.current = controller
    setLocating(true)
    setLocateError('')
    setBetweenNote('')
    try {
      const located = await load(controller.signal)
      if (controller.signal.aborted) return
      applyLocated(located)
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      setLocateError('No encontramos esa dirección. Revisá calle y número.')
    } finally {
      if (locateAbort.current === controller) setLocating(false)
    }
  }

  function dismissSuggestions() {
    searchAbort.current?.abort()
    setSuggestOpen(false)
  }

  function chooseSuggestion(hit: GeocodeHit) {
    pickingSuggestion.current = true
    dismissSuggestions()
    void runLocate((signal) => locatePoint(hit, signal))
  }

  function onLocate() {
    dismissSuggestions()
    void runLocate((signal) => locateAddress(address.trim(), signal))
  }

  function onAddressKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!suggestOpen) return
      event.preventDefault()
      dismissSuggestions()
      return
    }
    if (!suggestOpen || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = (activeSuggestion + 1) % suggestions.length
      setActiveSuggestion(next)
      document.getElementById(`${listId}-opt-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = (activeSuggestion - 1 + suggestions.length) % suggestions.length
      setActiveSuggestion(next)
      document.getElementById(`${listId}-opt-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && suggestions[activeSuggestion]) {
      event.preventDefault()
      chooseSuggestion(suggestions[activeSuggestion])
    }
  }

  function onAddressBlur(event: FocusEvent<HTMLInputElement>) {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => {
      if (pickingSuggestion.current) {
        pickingSuggestion.current = false
        return
      }
      setSuggestOpen(false)
    }, 160)
    if (zoneManual) return
    const next = inferZone({
      address: event.target.value,
      displayName: zoneHint?.displayName,
      place: zoneHint?.place,
    })
    setDeliveryZone(next ?? '')
    setZonePending(false)
  }

  function clearAttachment() {
    fileRequest.current += 1
    readCancel.current?.()
    readCancel.current = null
    setReadingFile(false)
    setAttachmentName('')
    setAttachmentDataUrl('')
    setErrors((current) => ({ ...current, file: undefined }))
    if (fileRef.current) fileRef.current.value = ''
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const problem = attachmentRejection(file)
    if (problem) {
      fileRequest.current += 1
      readCancel.current?.()
      readCancel.current = null
      setReadingFile(false)
      if (fileRef.current) fileRef.current.value = ''
      setErrors((current) => ({ ...current, file: problem }))
      return
    }
    fileRequest.current += 1
    const request = fileRequest.current
    readCancel.current?.()
    const job = readAttachmentFile(file)
    readCancel.current = job.abort
    setReadingFile(true)
    setErrors((current) => ({ ...current, file: undefined }))
    job.promise
      .then((dataUrl) => {
        if (fileRequest.current !== request) return
        setAttachmentName(file.name)
        setAttachmentDataUrl(dataUrl)
        setReadingFile(false)
      })
      .catch((error: unknown) => {
        if (fileRequest.current !== request) return
        setReadingFile(false)
        if (isAbortError(error)) return
        setErrors((current) => ({ ...current, file: 'No se pudo leer el archivo.' }))
      })
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Errors = {}
    if (!seller) nextErrors.seller = 'Seleccioná un vendedor.'
    if (!client.trim()) nextErrors.client = 'Ingresá el nombre del cliente.'
    if (!phone.trim()) nextErrors.phone = 'Ingresá un teléfono.'
    if (!address.trim()) nextErrors.address = 'Ingresá la dirección.'
    if (!betweenStreet1.trim() && !betweenStreet2.trim()) {
      nextErrors.between = 'Completá al menos una entre calle.'
    }
    if (!propertyType) nextErrors.propertyType = 'Seleccioná el tipo de propiedad.'
    if (!deliveryDate) nextErrors.deliveryDate = 'Elegí la fecha de entrega.'
    if (collectOnDelivery && !amount.trim()) {
      nextErrors.amount = 'Ingresá el monto a cobrar.'
    }
    if (readingFile) {
      nextErrors.file = 'Esperá a que se termine de leer el archivo.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const knownZone = asDeliveryZone(deliveryZone, zones)
    const keptZone = existing?.zone && existing.zone === deliveryZone ? existing.zone : undefined
    const resolvedZone = zoneManual
      ? knownZone ?? keptZone
      : inferZone({
          address: address.trim(),
          displayName: zoneHint?.displayName,
          place: zoneHint?.place,
        })
    const stored = storedId ? orders.find((order) => order.id === storedId) : undefined
    const id = storedId ?? `P-${Math.floor(1000000 + Math.random() * 9000000)}`
    const order: Order = {
      id,
      client: client.trim(),
      zone: resolvedZone,
      address: address.trim(),
      loadedAt: stored?.loadedAt ?? formatLoadedAt(new Date()),
      deliveryDate,
      status: stored?.status ?? 'pendiente',
      packages: stored?.packages,
      seller,
      phone: phone.trim(),
      invoices: invoices.map((invoice) => invoice.trim()).filter(Boolean),
      collectOnDelivery,
      amount: collectOnDelivery ? amount.trim() : undefined,
      betweenStreet1: betweenStreet1.trim(),
      betweenStreet2: betweenStreet2.trim(),
      propertyType,
      timeWindow,
      requiresPickup,
      transporter,
      notes: notes.trim(),
      attachmentName: attachmentName || undefined,
      attachmentDataUrl: attachmentDataUrl || undefined,
      receiverName: receiverName.trim() || undefined,
      receiverDni: receiverDni.trim() || undefined,
    }
    const result = storedId ? updateOrder(order) : addOrder(order)
    if (result.status === 'saved-without-attachment') {
      setStoredId(result.order.id)
      setAttachmentName(result.order.attachmentName ?? '')
      setAttachmentDataUrl(result.order.attachmentDataUrl ?? '')
      if (fileRef.current) fileRef.current.value = ''
      setErrors({ file: ATTACHMENT_SAVE_ERROR })
      attachmentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (result.status === 'not-saved') {
      setStoredId(id)
      setErrors({
        file: attachmentDataUrl
          ? ATTACHMENT_SAVE_ERROR
          : 'No se pudo guardar el pedido en este navegador.',
      })
      attachmentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    navigate(storedId ? '/pedidos' : '/')
  }

  const dayWarning = zoneDayWarning(deliveryZone, deliveryDate, zones)
  const sellerOptions = withCurrent(sellers, seller)
  const propertyOptions = withCurrent(propertyTypes, propertyType)
  const zoneOptions = withCurrent(
    zones.map((item) => item.name),
    deliveryZone,
  )
  const timeOptions = withCurrent(timeWindows, timeWindow)
  const transporterOptions = withCurrent(transporters, transporter)

  return (
    <section className="page">
      <header className="page-header">
        <h1>{storedId ? 'Editar Pedido' : 'Nuevo Pedido'}</h1>
        <p>
          {storedId
            ? 'Actualizá los datos del pedido.'
            : 'Cargá un nuevo pedido de logística.'}
        </p>
      </header>

      <form className="form-stack" onSubmit={onSubmit} noValidate>
        <section className="form-card">
          <h2>Vendedor</h2>
          <label className="field">
            <span>Vendedor *</span>
            <select
              value={seller}
              aria-invalid={Boolean(errors.seller)}
              onChange={(event) => setSeller(event.target.value)}
            >
              <option value="">Seleccioná vendedor</option>
              {sellerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {errors.seller && <small className="field-error">{errors.seller}</small>}
          </label>
        </section>

        <section className="form-card">
          <h2>Datos del Cliente</h2>
          <div className="field-grid">
            <label className="field">
              <span>Nombre *</span>
              <input
                value={client}
                placeholder="Nombre del cliente"
                aria-invalid={Boolean(errors.client)}
                onChange={(event) => setClient(event.target.value)}
              />
              {errors.client && <small className="field-error">{errors.client}</small>}
            </label>
            <label className="field">
              <span>Teléfono *</span>
              <input
                value={phone}
                placeholder="+54 11..."
                aria-invalid={Boolean(errors.phone)}
                onChange={(event) => setPhone(event.target.value)}
              />
              {errors.phone && <small className="field-error">{errors.phone}</small>}
            </label>
            <div className="field full">
              <span>N° Nota de Pedido / Factura</span>
              {invoices.map((invoice, index) => (
                <div className="inline-field" key={index}>
                  <input
                    value={invoice}
                    placeholder="FAC [A] 0006-00011801"
                    aria-label={`Factura ${index + 1}`}
                    onChange={(event) => updateInvoice(index, event.target.value)}
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
          </div>
          <div className="toggle-row">
            <div>
              <strong>Cobranza</strong>
              <p className="hint">Hay que cobrarle un monto al cliente al momento de la entrega</p>
            </div>
            <Toggle
              pressed={collectOnDelivery}
              label="Cobranza en la entrega"
              onClick={() => setCollectOnDelivery((current) => !current)}
            />
          </div>
          {collectOnDelivery && (
            <label className="field amount-field">
              <span>Monto *</span>
              <input
                value={amount}
                inputMode="decimal"
                placeholder="Ej: 150000"
                aria-invalid={Boolean(errors.amount)}
                onChange={(event) => setAmount(event.target.value)}
              />
              {errors.amount && <small className="field-error">{errors.amount}</small>}
            </label>
          )}
        </section>

        <section className="form-card">
          <h2>Dirección de Entrega</h2>
          <div className="field-grid">
            <div className="field full">
              <label htmlFor="delivery-address">Dirección (Calle y Número) *</label>
              <div className="address-row" ref={addressRef}>
                <div className="address-input-wrap">
                  <input
                    id="delivery-address"
                    value={address}
                    placeholder="Ej: Av. Corrientes 1234"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={suggestOpen}
                    aria-controls={listId}
                    aria-activedescendant={
                      suggestOpen ? `${listId}-opt-${activeSuggestion}` : undefined
                    }
                    aria-invalid={Boolean(errors.address)}
                    onChange={(event) => onAddressChange(event.target.value)}
                    onKeyDown={onAddressKeyDown}
                    onFocus={() => {
                      if (blurTimer.current) {
                        window.clearTimeout(blurTimer.current)
                        blurTimer.current = null
                      }
                      if (lookup.length >= 3 && suggestions.length > 0) setSuggestOpen(true)
                    }}
                    onBlur={onAddressBlur}
                  />
                  {suggestOpen && suggestions.length > 0 && (
                    <ul className="address-suggest" id={listId} role="listbox">
                      {suggestions.map((hit, index) => (
                        <li key={hit.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            id={`${listId}-opt-${index}`}
                            aria-selected={index === activeSuggestion}
                            onPointerDown={() => {
                              pickingSuggestion.current = true
                            }}
                            onMouseEnter={() => setActiveSuggestion(index)}
                            onClick={() => chooseSuggestion(hit)}
                          >
                            <strong>{hit.label}</strong>
                            {hit.detail && <small>{hit.detail}</small>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="detect-btn"
                  onClick={onLocate}
                  disabled={locating || address.trim().length < 3}
                  aria-busy={locating}
                >
                  {locating ? 'Ubicando...' : 'Ubicar'}
                </button>
              </div>
              <small className="hint">
                Ingresá la dirección del cliente y tocá Ubicar para completar zona y, si se puede,
                entre calles.
              </small>
              {locateError && <small className="field-error">{locateError}</small>}
              {errors.address && <small className="field-error">{errors.address}</small>}
            </div>
            <label className="field">
              <span className="hint-danger">Entre calle 1 (al menos una obligatoria)</span>
              <input
                value={betweenStreet1}
                placeholder="Ej: Callao"
                aria-invalid={Boolean(errors.between)}
                onChange={(event) => {
                  setBetweenStreet1(event.target.value)
                  setBetweenNote('')
                }}
              />
              {errors.between && <small className="field-error">{errors.between}</small>}
              {betweenNote && <small className="field-warn">{betweenNote}</small>}
            </label>
            <label className="field">
              <span>Entre calle 2</span>
              <input
                value={betweenStreet2}
                placeholder="Ej: Uruguay"
                onChange={(event) => {
                  setBetweenStreet2(event.target.value)
                  setBetweenNote('')
                }}
              />
            </label>
            <label className="field">
              <span>Tipo de propiedad *</span>
              <select
                value={propertyType}
                aria-invalid={Boolean(errors.propertyType)}
                onChange={(event) => setPropertyType(event.target.value)}
              >
                <option value="">Seleccioná tipo</option>
                {propertyOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {errors.propertyType && (
                <small className="field-error">{errors.propertyType}</small>
              )}
            </label>
          </div>
          <label className="field zone-field">
            <span>Zona de reparto</span>
            <select
              value={deliveryZone}
              onChange={(event) => {
                setDeliveryZone(event.target.value)
                setZoneManual(true)
                setZonePending(false)
              }}
            >
              <option value="">Sin zona</option>
              {zoneOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <small className="hint">
              {zonePending
                ? 'Calculando la zona…'
                : deliveryZone
                  ? zoneManual
                    ? `${deliveryZone}. Se mantiene hasta que cambies la dirección.`
                    : `Detectada: ${deliveryZone}${zoneDays(deliveryZone, zones) ? ` · ${zoneDays(deliveryZone, zones)}` : ''}.`
                  : zoneManual
                    ? 'Sin zona. Si cambiás la dirección, se vuelve a calcular.'
                    : 'Se calcula con la dirección. Podés elegirla a mano.'}
            </small>
          </label>
          <p className="zone-title">Días de reparto por zona</p>
          <div className="zone-list">
            {zones.map((item) => (
              <span key={item.name} className={!zonePending && item.name === deliveryZone ? 'zone-chip active' : 'zone-chip'}>
                <strong>{item.name}</strong> {item.days}
              </span>
            ))}
          </div>
        </section>

        <section className="form-card">
          <h2>Fecha y Horario</h2>
          <div className="field-grid">
            <label className="field">
              <span>Fecha de Entrega *</span>
              <input
                type="date"
                value={deliveryDate}
                aria-invalid={Boolean(errors.deliveryDate)}
                onChange={(event) => setDeliveryDate(event.target.value)}
              />
              {errors.deliveryDate && (
                <small className="field-error">{errors.deliveryDate}</small>
              )}
              {!errors.deliveryDate && dayWarning && (
                <small className="field-warn">{dayWarning}</small>
              )}
            </label>
            <label className="field">
              <span>Franja Horaria</span>
              <select value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}>
                {timeOptions.map((window) => (
                  <option key={window} value={window}>
                    {window}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="form-card toggle-card">
          <div className="toggle-row">
            <div>
              <h2>Requiere Retiro</h2>
              <p className="hint">Hay que retirar mercadería antes de entregar</p>
            </div>
            <Toggle
              pressed={requiresPickup}
              label="Requiere retiro"
              onClick={() => setRequiresPickup((current) => !current)}
            />
          </div>
        </section>

        <section className="form-card">
          <h2>Transportista</h2>
          <label className="field">
            <select value={transporter} onChange={(event) => setTransporter(event.target.value)}>
              {transporterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <small className="hint">
              El transportista queda asignado para cuando el pedido llegue a Despacho.
            </small>
          </label>
        </section>

        <section className="form-card">
          <h2>Notas adicionales</h2>
          <label className="field">
            <textarea
              value={notes}
              rows={4}
              placeholder="Observaciones..."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </section>

        <section className="form-card" ref={attachmentSectionRef}>
          <h2>Documentación</h2>
          <label className="field">
            <span>Adjuntar remito, factura u otro archivo (imagen, PDF o Word, opcional)</span>
            <input
              ref={fileRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              aria-invalid={Boolean(errors.file)}
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <small className="hint">Imagen, PDF o Word (.doc, .docx). Máximo 2 MB.</small>
          </label>
          {readingFile && <small className="hint">Leyendo archivo…</small>}
          {(attachmentName || attachmentDataUrl) && (
            <div className="attachment-bar">
              {attachmentDataUrl.startsWith('data:image/') && (
                <img
                  className="attachment-preview"
                  src={attachmentDataUrl}
                  alt={attachmentName || 'Adjunto'}
                />
              )}
              <div className="attachment-actions">
                <strong>{attachmentName || 'Adjunto'}</strong>
                {attachmentDataUrl && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openAttachment(attachmentName || 'adjunto', attachmentDataUrl)}
                  >
                    {attachmentKind(attachmentName, attachmentDataUrl) === 'word' ? 'Descargar' : 'Abrir'}
                  </button>
                )}
                <button type="button" className="text-button" onClick={clearAttachment}>
                  Quitar
                </button>
              </div>
              {attachmentName && !attachmentDataUrl && (
                <small className="hint">
                  El archivo no está guardado. Volvé a adjuntarlo para verlo.
                </small>
              )}
            </div>
          )}
          {errors.file && (
            <small className="field-error" role="alert">
              {errors.file}
            </small>
          )}
        </section>

        <section className="form-card">
          <h2>Datos de quien recibe (opcional)</h2>
          <div className="field-grid">
            <label className="field">
              <span>Nombre y Apellido</span>
              <input
                value={receiverName}
                placeholder="Nombre completo de quien recibe"
                onChange={(event) => setReceiverName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>DNI</span>
              <input
                value={receiverDni}
                placeholder="Ej: 30123456"
                onChange={(event) => setReceiverDni(event.target.value)}
              />
            </label>
          </div>
        </section>

        <div className="form-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate(storedId ? '/pedidos' : '/')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={readingFile}>
            {storedId ? 'Guardar cambios' : 'Crear Pedido'}
          </button>
        </div>
      </form>
    </section>
  )
}

export function NuevoPedido() {
  const location = useLocation()
  const editingId = (location.state as { orderId?: string } | null)?.orderId
  return <PedidoForm key={editingId ?? 'nuevo'} editingId={editingId} />
}
