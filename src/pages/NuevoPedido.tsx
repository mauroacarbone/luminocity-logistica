import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DELIVERY_ZONES,
  PROPERTY_TYPES,
  SELLERS,
  TIME_WINDOWS,
  TRANSPORTERS,
} from '../data/catalog'
import type { Order } from '../data/orders'
import { asDeliveryZone, inferZone, zoneDayWarning, zoneDays, type ZoneQuery } from '../lib/zone'
import { useOrders } from '../state/OrdersContext'

const MAX_FILE_BYTES = 2 * 1024 * 1024

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

async function detectStreet() {
  if (!navigator.geolocation) {
    throw new Error('Este navegador no puede detectar la ubicación.')
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
    })
  })

  const { latitude, longitude } = position.coords
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
    { headers: { 'Accept-Language': 'es' } },
  )
  if (!response.ok) {
    throw new Error('No se pudo completar la dirección.')
  }

  const data = (await response.json()) as {
    display_name?: string
    address?: ZoneQuery['place']
  }
  const street = [data.address?.road, data.address?.house_number].filter(Boolean).join(' ')
  return {
    street: street || data.display_name || '',
    hint: { displayName: data.display_name, place: data.address } satisfies ZoneQuery,
  }
}

function PedidoForm({ editingId }: { editingId?: string }) {
  const navigate = useNavigate()
  const { orders, addOrder, updateOrder } = useOrders()
  const existing = orders.find((order) => order.id === editingId)
  const [seller, setSeller] = useState(existing?.seller ?? '')
  const [client, setClient] = useState(existing?.client ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [invoices, setInvoices] = useState(
    existing?.invoices && existing.invoices.length > 0 ? existing.invoices : [''],
  )
  const [collectOnDelivery, setCollectOnDelivery] = useState(existing?.collectOnDelivery ?? false)
  const [amount, setAmount] = useState(existing?.amount ?? '')
  const savedZone = asDeliveryZone(existing?.zone)
  const [address, setAddress] = useState(existing?.address ?? '')
  const [deliveryZone, setDeliveryZone] = useState(savedZone ?? '')
  const [zoneManual, setZoneManual] = useState(Boolean(savedZone))
  const [zoneHint, setZoneHint] = useState<ZoneQuery | null>(null)
  const [zonePending, setZonePending] = useState(false)
  const [betweenStreet1, setBetweenStreet1] = useState(existing?.betweenStreet1 ?? '')
  const [betweenStreet2, setBetweenStreet2] = useState(existing?.betweenStreet2 ?? '')
  const [propertyType, setPropertyType] = useState(existing?.propertyType ?? '')
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate ?? '')
  const [timeWindow, setTimeWindow] = useState(existing?.timeWindow ?? TIME_WINDOWS[0])
  const [requiresPickup, setRequiresPickup] = useState(existing?.requiresPickup ?? false)
  const [transporter, setTransporter] = useState(existing?.transporter ?? TRANSPORTERS[0])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [attachmentName, setAttachmentName] = useState(existing?.attachmentName ?? '')
  const [receiverName, setReceiverName] = useState(existing?.receiverName ?? '')
  const [receiverDni, setReceiverDni] = useState(existing?.receiverDni ?? '')
  const [detecting, setDetecting] = useState(false)
  const [detectMessage, setDetectMessage] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function updateInvoice(index: number, value: string) {
    setInvoices((current) =>
      current.map((invoice, itemIndex) => (itemIndex === index ? value : invoice)),
    )
  }

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

  function onAddressChange(value: string) {
    setAddress(value)
    setZoneManual(false)
    setZoneHint(null)
    setZonePending(true)
  }

  async function onDetect() {
    setDetecting(true)
    setDetectMessage('')
    try {
      const detected = await detectStreet()
      if (!detected.street) {
        setDetectMessage('No encontramos una calle para esta ubicación.')
        return
      }
      setZoneManual(false)
      setZoneHint(detected.hint)
      setAddress(detected.street)
      setDeliveryZone(
        inferZone({
          address: detected.street,
          displayName: detected.hint.displayName,
          place: detected.hint.place,
        }) ?? '',
      )
      setZonePending(false)
      setErrors((current) => ({ ...current, address: undefined }))
    } catch {
      setDetectMessage('No se pudo detectar la ubicación. Completá la dirección a mano.')
    } finally {
      setDetecting(false)
    }
  }

  function onFile(file: File | undefined) {
    if (!file) {
      setAttachmentName('')
      setErrors((current) => ({ ...current, file: undefined }))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setAttachmentName('')
      setErrors((current) => ({
        ...current,
        file: 'El archivo supera los 2 MB.',
      }))
      return
    }
    setAttachmentName(file.name)
    setErrors((current) => ({ ...current, file: undefined }))
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
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const resolvedZone = zoneManual
      ? asDeliveryZone(deliveryZone)
      : inferZone({
          address: address.trim(),
          displayName: zoneHint?.displayName,
          place: zoneHint?.place,
        })
    const order: Order = {
      id: existing?.id ?? `P-${Math.floor(1000000 + Math.random() * 9000000)}`,
      client: client.trim(),
      zone: resolvedZone,
      address: address.trim(),
      loadedAt: existing?.loadedAt ?? formatLoadedAt(new Date()),
      deliveryDate,
      status: existing?.status ?? 'pendiente',
      packages: existing?.packages,
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
      receiverName: receiverName.trim() || undefined,
      receiverDni: receiverDni.trim() || undefined,
    }
    if (existing) {
      updateOrder(order)
      navigate('/pedidos')
      return
    }
    addOrder(order)
    navigate('/')
  }

  const dayWarning = zoneDayWarning(deliveryZone, deliveryDate)

  return (
    <section className="page">
      <header className="page-header">
        <h1>{existing ? 'Editar Pedido' : 'Nuevo Pedido'}</h1>
        <p>
          {existing
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
              {SELLERS.map((name) => (
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
            <label className="field">
              <span>Dirección (Calle y Número) *</span>
              <div className="address-row">
                <input
                  value={address}
                  placeholder="Ej: Av. Corrientes 1234"
                  aria-invalid={Boolean(errors.address)}
                  onChange={(event) => onAddressChange(event.target.value)}
                  onBlur={(event) => {
                    if (zoneManual) return
                    const next = inferZone({
                      address: event.target.value,
                      displayName: zoneHint?.displayName,
                      place: zoneHint?.place,
                    })
                    setDeliveryZone(next ?? '')
                    setZonePending(false)
                  }}
                />
                <button type="button" className="detect-btn" onClick={onDetect} disabled={detecting}>
                  {detecting ? 'Detectando...' : 'Detectar'}
                </button>
              </div>
              <small className="hint">
                Detectá tu ubicación para autocompletar las entre calles.
              </small>
              {detectMessage && <small className="field-error">{detectMessage}</small>}
              {errors.address && <small className="field-error">{errors.address}</small>}
            </label>
            <label className="field">
              <span className="hint-danger">Entre calle 1 (al menos una obligatoria)</span>
              <input
                value={betweenStreet1}
                placeholder="Ej: Callao"
                aria-invalid={Boolean(errors.between)}
                onChange={(event) => setBetweenStreet1(event.target.value)}
              />
              {errors.between && <small className="field-error">{errors.between}</small>}
            </label>
            <label className="field">
              <span>Entre calle 2</span>
              <input
                value={betweenStreet2}
                placeholder="Ej: Uruguay"
                onChange={(event) => setBetweenStreet2(event.target.value)}
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
                {PROPERTY_TYPES.map((type) => (
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
              {DELIVERY_ZONES.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            <small className="hint">
              {zonePending
                ? 'Calculando la zona…'
                : deliveryZone
                  ? zoneManual
                    ? `${deliveryZone}. Se mantiene hasta que cambies la dirección.`
                    : `Detectada: ${deliveryZone}${zoneDays(deliveryZone) ? ` · ${zoneDays(deliveryZone)}` : ''}.`
                  : zoneManual
                    ? 'Sin zona. Si cambiás la dirección, se vuelve a calcular.'
                    : 'Se calcula con la dirección. Podés elegirla a mano.'}
            </small>
          </label>
          <p className="zone-title">Días de reparto por zona</p>
          <div className="zone-list">
            {DELIVERY_ZONES.map((item) => (
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
                {TIME_WINDOWS.map((window) => (
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
              {TRANSPORTERS.map((name) => (
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

        <section className="form-card">
          <h2>Documentación</h2>
          <label className="field">
            <span>Adjuntar remito, factura u otro archivo (foto o PDF, opcional)</span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <small className="hint">
              Tamaño máximo recomendado: 2 MB. Los archivos más pesados pueden fallar al guardar.
            </small>
            {errors.file && <small className="field-error">{errors.file}</small>}
          </label>
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
            onClick={() => navigate(existing ? '/pedidos' : '/')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            {existing ? 'Guardar cambios' : 'Crear Pedido'}
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
