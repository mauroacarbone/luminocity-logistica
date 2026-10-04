import { useEffect, useState } from 'react'
import { ServerDown, Spinner } from '../components/LoadState'
import { pendingEdit, type Order, type OrderEdit } from '../data/orders'
import { confirm, error as showError, success } from '../lib/alerts'
import { slotQuestion } from '../lib/slot'
import {
  isAuthorization,
  listAuthorizations,
  resolveAuthorization,
  type SellerAuthorization,
} from '../lib/authorizationsApi'
import { isSession } from '../lib/authStore'
import { listUsers } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

const FIELD_LABEL: Record<string, string> = {
  client: 'Cliente',
  seller: 'Vendedor',
  phone: 'Teléfono',
  address: 'Dirección',
  propertyType: 'Propiedad',
  loadedAt: 'Carga',
  deliveryDate: 'Entrega',
  zone: 'Zona',
  amount: 'Monto',
  timeWindow: 'Franja',
  transporter: 'Transportista',
  notes: 'Notas',
  attachmentName: 'Adjunto',
  attachmentDataUrl: 'Archivo',
  receiverName: 'Recibe',
  receiverDni: 'DNI',
  betweenStreet1: 'Entrecalle',
  betweenStreet2: 'Entrecalle 2',
  floor: 'Piso',
  unit: 'Depto / Unidad',
  doorbell: 'Timbre',
  invoices: 'Facturas',
  collectOnDelivery: 'Cobro',
  requiresPickup: 'Retiro',
  dispatchType: 'Despacho',
}

function formatChange(key: string, value: unknown) {
  if (key === 'attachmentDataUrl') return value ? 'archivo nuevo' : 'sin archivo'
  if (value == null || value === '') return 'vacío'
  if (typeof value === 'boolean') return value ? 'sí' : 'no'
  if (Array.isArray(value)) return value.join(', ') || 'vacío'
  return String(value)
}

function changeLines(changes: OrderEdit['changes']) {
  return Object.entries(changes).map(([key, value]) => ({
    key,
    label: FIELD_LABEL[key] ?? key,
    value: formatChange(key, value),
  }))
}

export function Bandeja() {
  const { logout } = useAuth()
  const { orders, reviewEdit } = useOrders()
  const [authorizations, setAuthorizations] = useState<SellerAuthorization[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.all([listAuthorizations(), listUsers()]).then(([authResult, usersResult]) => {
      if (cancelled) return
      setLoading(false)
      if (!authResult.ok) {
        if (authResult.status === 401) logout()
        else setError(authResult.status === 0 ? 'No se pudo conectar con el servidor' : authResult.message)
        return
      }
      if (!Array.isArray(authResult.data) || !authResult.data.every(isAuthorization)) {
        setError('No se pudieron leer las autorizaciones.')
        return
      }
      setAuthorizations(authResult.data)
      if (usersResult.ok && Array.isArray(usersResult.data)) {
        const next: Record<string, string> = {}
        for (const item of usersResult.data) {
          if (isSession(item)) next[item.id] = item.name
        }
        setNames(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [logout, attempt])

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const pendingAuth = authorizations.filter((item) => item.status === 'pendiente')
  const pendingEdits = orders.flatMap((order) => {
    const edit = pendingEdit(order)
    return edit ? [{ order, edit }] : []
  })

  async function decideAuth(id: string, status: 'aprobada' | 'rechazada') {
    const rejecting = status === 'rechazada'
    const item = authorizations.find((entry) => entry.id === id)
    const accepted = await confirm(
      rejecting ? 'Rechazar autorización' : 'Aprobar autorización',
      rejecting
        ? `No va a poder cargar a nombre de ${item?.seller ?? 'ese vendedor'}.`
        : `Va a poder cargar a nombre de ${item?.seller ?? 'ese vendedor'}.`,
      { peligro: rejecting },
    )
    if (!accepted) return
    setBusy(id)
    const result = await resolveAuthorization(id, status)
    setBusy('')
    if (!result.ok) {
      if (result.status === 401) logout()
      else setError(result.message)
      return
    }
    if (!isAuthorization(result.data)) {
      setError('No se pudo leer la autorización.')
      return
    }
    const saved = result.data
    setError('')
    setAuthorizations((current) => current.map((item) => (item.id === id ? saved : item)))
  }

  async function decideEdit(order: Order, edit: OrderEdit, status: 'aplicada' | 'rechazada') {
    const rejecting = status === 'rechazada'
    const accepted = await confirm(
      rejecting ? 'Rechazar edición' : 'Aprobar edición',
      rejecting
        ? `Se rechaza la edición del pedido ${order.id}.`
        : `Se aplica la edición del pedido ${order.id}.`,
      { peligro: rejecting },
    )
    if (!accepted) return
    setBusy(edit.id)
    let result = await reviewEdit(order.id, edit.id, status)
    if (result.status === 'not-saved' && result.code === 'FRANJA_LLENA' && result.slot && status === 'aplicada') {
      setBusy('')
      const accepted = await confirm(
        'Franja llena',
        slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
      )
      if (!accepted) return
      setBusy(edit.id)
      result = await reviewEdit(order.id, edit.id, status, true)
    }
    setBusy('')
    if (result.status === 'not-saved') await showError(result.message)
    else await success(rejecting ? 'Edición rechazada' : 'Edición aprobada')
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Bandeja</h1>
        <p>Autorizaciones y ediciones que esperan confirmación.</p>
      </header>
      {loading && <Spinner label="Cargando bandeja…" />}
      {error && <ServerDown message={error} onRetry={retry} />}

      {!loading && !error && (
      <>
      <h2 className="mt-6 text-xl font-semibold">Autorizaciones</h2>
      {pendingAuth.length === 0 ? (
        <div className="mt-3 rounded-2xl bg-white px-5 py-6 text-sm text-lumi-muted shadow-sm">
          No hay autorizaciones pendientes.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {pendingAuth.map((item) => (
            <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">{names[item.requestedBy] ?? 'Vendedor'}</p>
              <p className="mt-1 text-sm text-lumi-muted">Quiere cargar a nombre de {item.seller}.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink"
                  disabled={busy === item.id}
                  onClick={() => void decideAuth(item.id, 'aprobada')}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  className="rounded-xl px-3 py-1.5 text-sm text-lumi-danger hover:bg-[#fde8e7]"
                  disabled={busy === item.id}
                  onClick={() => void decideAuth(item.id, 'rechazada')}
                >
                  Rechazar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-xl font-semibold">Ediciones</h2>
      {pendingEdits.length === 0 ? (
        <div className="mt-3 rounded-2xl bg-white px-5 py-6 text-sm text-lumi-muted shadow-sm">
          No hay ediciones pendientes.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {pendingEdits.map(({ order, edit }) => (
            <article key={edit.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">
                {order.id} · {order.client}
              </p>
              <p className="mt-1 text-sm text-lumi-muted">
                {names[edit.by] ?? 'Vendedor'} · {edit.reason}
              </p>
              <ul className="mt-2 text-sm">
                {changeLines(edit.changes).map((line) => (
                  <li key={line.key}>
                    {line.label}: {line.value}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink"
                  disabled={busy === edit.id}
                  onClick={() => void decideEdit(order, edit, 'aplicada')}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  className="rounded-xl px-3 py-1.5 text-sm text-lumi-danger hover:bg-[#fde8e7]"
                  disabled={busy === edit.id}
                  onClick={() => void decideEdit(order, edit, 'rechazada')}
                >
                  Rechazar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      </>
      )}
    </section>
  )
}
