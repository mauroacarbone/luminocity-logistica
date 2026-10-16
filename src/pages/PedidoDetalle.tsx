import { useEffect, useState } from 'react'
import { Card, Page, PageHeader } from '../components/ui'
import { useParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { NoAccess } from '../components/NoAccess'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { ServerDown, Spinner } from '../components/LoadState'
import { type Order } from '../data/orders'
import { getOrder } from '../lib/ordersApi'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

function isOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.client === 'string' && typeof item.status === 'string'
}

function PedidoDetalleView({ id }: { id: string }) {
  const { user, logout } = useAuth()
  const { transitionOrder } = useOrders()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

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

  if (forbidden) return <NoAccess />
  if (missing) {
    return (
      <Page>
        <PageHeader title="No existe ese pedido" back={{ to: '/pedidos', label: 'Volver a pedidos' }} />
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

  return (
    <Page>
      <PageHeader
        crumb={order.id}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{order.id}</span>
            <PriorityChip order={order} />
          </span>
        }
        subtitle={<span className="font-semibold uppercase">{order.client}</span>}
        actions={
          <OrderFlowButtons
            order={order}
            role={user.role}
            via="pedidos"
            busy={busy}
            onBusy={setBusy}
            transition={transitionOrder}
            onDone={() => setReloadKey((key) => key + 1)}
          />
        }
      />

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
