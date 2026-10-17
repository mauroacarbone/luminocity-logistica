import { useEffect, useState } from 'react'
import { Button, Card, Page, PageHeader } from '../components/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { NoAccess } from '../components/NoAccess'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { ServerDown, Spinner } from '../components/LoadState'
import { isOwnDelivery } from '../data/catalog'
import { type Order } from '../data/orders'
import { getOrder } from '../lib/ordersApi'
import { departureBlock, WAITING_SHEET } from '../lib/routeReady'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

function isOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.client === 'string' && typeof item.status === 'string'
}

function PedidoDetalleView({ id }: { id: string }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { transitionOrder } = useOrders()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadedSheets, setLoadedSheets] = useState<{ id: string; sheets: RouteSheet[] } | null>(null)

  useEffect(() => {
    let alive = true
    void getOrder(id).then((result) => {
      if (!alive) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        if (result.status === 403) {
          setForbidden(true)
          setLoading(false)
          return
        }
        if (result.status === 404) {
          setMissing(true)
          setLoading(false)
          return
        }
        setError(result.message)
        setLoading(false)
        return
      }
      if (!isOrder(result.data)) {
        setError('No se pudo leer el pedido.')
        setLoading(false)
        return
      }
      setOrder(result.data)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id, logout, reloadKey])

  useEffect(() => {
    if (!order || user?.role !== 'chofer' || order.status !== 'asignado' || !isOwnDelivery(order)) return
    const date = order.deliveryDate
    if (!date) return
    let cancelled = false
    void listRouteSheets(date).then((result) => {
      if (cancelled) return
      setLoadedSheets({ id: order.id, sheets: result.ok ? result.data : [] })
    })
    return () => {
      cancelled = true
    }
  }, [order, user?.role])

  if (forbidden) return <NoAccess />
  if (missing) {
    return (
      <Page>
        <PageHeader
          title="No existe ese pedido"
          back={
            user?.role === 'chofer'
              ? { to: '/mis-entregas', label: 'Volver' }
              : { to: '/pedidos', label: 'Volver a pedidos' }
          }
        />
      </Page>
    )
  }
  if (loading) {
    return (
      <Page>
        <Spinner label="Cargando pedido…" />
      </Page>
    )
  }
  if (error) {
    return (
      <Page>
        <ServerDown
          message={error}
          onRetry={() => {
            setError('')
            setLoading(true)
            setReloadKey((key) => key + 1)
          }}
        />
      </Page>
    )
  }
  if (!order || !user) return <NoAccess />

  const driver = user.role === 'chofer'
  const sheetNotice =
    driver && order.status === 'asignado' && isOwnDelivery(order)
      ? !order.deliveryDate ||
        (loadedSheets?.id === order.id && departureBlock(order, loadedSheets.sheets, [order]))
        ? WAITING_SHEET
        : ''
      : ''

  return (
    <Page>
      <PageHeader
        crumb={order.id}
        back={driver ? { to: '/mis-entregas', label: 'Volver' } : undefined}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{order.id}</span>
            <PriorityChip order={order} />
          </span>
        }
        subtitle={<span className="font-semibold uppercase">{order.client}</span>}
        actions={
          driver ? (
            <Button variant="secondary" size="lg" onClick={() => navigate('/mis-entregas')}>
              Ver en Mis entregas
            </Button>
          ) : (
            <OrderFlowButtons
              order={order}
              role={user.role}
              via="pedidos"
              busy={busy}
              onBusy={setBusy}
              transition={transitionOrder}
              onDone={() => setReloadKey((key) => key + 1)}
            />
          )
        }
      />
      {driver && sheetNotice ? (
        <p className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-semibold">{sheetNotice}</p>
      ) : null}

      <Card className="mt-4">
        <OrderStepper order={order} variant="full" />
      </Card>

      <OrderDetail order={order} onOrderChange={setOrder} />
    </Page>
  )
}

export function PedidoDetalle() {
  const { id = '' } = useParams()
  if (!id) return <NoAccess />
  return <PedidoDetalleView key={id} id={id} />
}
