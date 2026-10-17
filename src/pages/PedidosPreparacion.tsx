import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PrepChecklist } from '../components/PrepChecklist'
import { PrepChip } from '../components/PrepChip'
import { Badge, Button, Drawer, EmptyState, FilterBar, ListBox, Page, PageHeader, statusTone, Table, type TableColumn } from '../components/ui'
import { NavIcon } from '../layout/NavIcon'
import { OrderDetail } from '../components/OrderDetail'
import { PriorityChip } from '../components/PriorityChip'
import { DISPATCH_LABEL } from '../data/catalog'
import { type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { canCancelOrder, canEditOrder, canPrepare } from '../lib/access'
import { statusPillFor } from '../lib/orderFlow'
import { formatPrepMs, prepDuration, takeState, takenByName } from '../lib/preparation'
import { compareOpenPriority } from '../lib/priority'
import { businessToday } from '../lib/schedule'
import {
  MONTH_SHORT,
  formatDayLabel,
  toIso,
  weekDays,
  weekOffsetForIso,
} from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
function formatPrepHour(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PrepTimer({ order }: { order: Order }) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [])
  return <span className="tabular-nums">{now ? formatPrepMs(prepDuration(order, now)) : '—'}</span>
}

function isOpenPrep(order: Order) {
  return order.status === 'pendiente' || order.status === 'preparado'
}

function openedFromList(state: unknown) {
  return Boolean(state && typeof state === 'object' && (state as { fromList?: boolean }).fromList)
}

export function PedidosPreparacion() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { orders, loading, removeOrder, releaseOrder } = useOrders()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => businessToday())
  const [busyId, setBusyId] = useState('')
  const [scope, setScope] = useState<'todos' | 'incompletos'>('todos')
  const [alignedId, setAlignedId] = useState<string | null>(null)
  const days = weekDays(weekOffset)
  const weekOrders = orders.filter(isOpenPrep)
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const dayOrders = weekOrders
    .filter((order) => order.deliveryDate === toIso(selectedDate))
    .sort((left, right) => {
      const byPriority = compareOpenPriority(left, right)
      if (byPriority !== 0) return byPriority
      if (left.status !== right.status) {
        return left.status === 'pendiente' ? -1 : 1
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
  const shownOrders = scope === 'incompletos' ? dayOrders.filter((order) => order.prepIncomplete) : dayOrders
  const openId = searchParams.get('pedido')
  const openOrder = dayOrders.find((order) => order.id === openId) ?? null

  function closePedido() {
    setAlignedId(null)
    if (openedFromList(location.state)) {
      navigate(-1)
      return
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('pedido')
        return next
      },
      { replace: true },
    )
  }

  function openPedido(id: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('pedido', id)
        return next
      },
      { state: { fromList: true } },
    )
  }

  if (!loading && openId && alignedId !== openId) {
    const found = orders.find((order) => order.id === openId)
    if (found && isOpenPrep(found)) {
      setAlignedId(openId)
      if (!days.some((day) => toIso(day) === found.deliveryDate)) {
        setWeekOffset(weekOffsetForIso(found.deliveryDate))
      }
      if (selectedIso !== found.deliveryDate) setSelectedIso(found.deliveryDate)
    }
  }

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = businessToday()
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
    if (openId) closePedido()
  }

  function heldBy(order: Order) {
    if (!user) return ''
    if (takeState(order) !== 'en-preparacion') return ''
    if (order.preparation?.takenBy?.id === user.id) return ''
    return takenByName(order) || 'otro operario'
  }

  function canRelease(order: Order) {
    if (!user) return false
    if (user.role !== 'encargado_deposito' && user.role !== 'admin') return false
    return takeState(order) === 'en-preparacion'
  }

  async function release(order: Order) {
    setBusyId(order.id)
    const result = await releaseOrder(order.id)
    setBusyId('')
    if (result.status === 'not-saved') await error(result.message)
  }

  function armadoCell(order: Order) {
    if (takeState(order) === 'en-preparacion') {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>En preparación · {takenByName(order) || 'operario'}</span>
          <PrepTimer order={order} />
          {canRelease(order) ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busyId === order.id}
              onClick={(event) => {
                event.stopPropagation()
                void release(order)
              }}
            >
              Liberar
            </Button>
          ) : null}
        </span>
      )
    }
    if (!order.preparedBy) return '—'
    return `${order.preparedBy.name} · ${formatPrepHour(order.preparedAt)} · ${order.prepMs == null ? '—' : formatPrepMs(order.prepMs)}`
  }

  function openPreparation(order: Order) {
    navigate(`/preparacion?pedido=${encodeURIComponent(order.id)}`)
  }

  async function cancelOrder(order: Order) {
    const admin = user?.role === 'admin'
    const accepted = await confirm(
      admin ? 'Borrar pedido' : 'Cancelar pedido',
      admin ? `Se borra el pedido ${order.id}.` : `Se cancela el pedido ${order.id}.`,
      { peligro: true },
    )
    if (!accepted) return
    setBusyId(order.id)
    const result = await removeOrder(order.id)
    setBusyId('')
    if (result.status === 'not-saved') await error(result.message)
    else {
      if (searchParams.get('pedido') === order.id) closePedido()
      await success(admin ? 'Pedido borrado' : 'Pedido cancelado')
    }
  }

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  const columns: TableColumn<Order>[] = [
    {
      key: 'id',
      header: 'N°',
      cell: (order) => (
        <Link
          className="font-medium text-accent hover:underline"
          to={`/pedidos/${order.id}`}
          onClick={(event) => event.stopPropagation()}
        >
          {order.id}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', cell: (order) => order.client },
    { key: 'priority', header: 'Prioridad', cell: (order) => <PriorityChip order={order} /> },
    {
      key: 'status',
      header: 'Estado',
      cell: (order) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>
          <PrepChip order={order} />
        </span>
      ),
    },
    { key: 'armado', header: 'Armado', cell: (order) => armadoCell(order) },
    { key: 'zone', header: 'Zona', cell: (order) => order.zone || '—' },
    {
      key: 'dispatch',
      header: 'Despacho',
      cell: (order) => (order.dispatchType ? DISPATCH_LABEL[order.dispatchType] : '—'),
    },
    { key: 'slot', header: 'Franja', cell: (order) => order.timeWindow || '—' },
    {
      key: 'packages',
      header: 'Bultos',
      align: 'right',
      cell: (order) => (order.packages != null ? order.packages : '—'),
    },
    { key: 'loaded', header: 'Cargado', cell: (order) => order.loadedAt },
    {
      key: 'prepare',
      header: '',
      cell: (order) =>
        user && canPrepare(user.role) && order.status === 'pendiente' ? (
          <div className="flex flex-col items-start gap-1">
            {heldBy(order) ? (
              <span className="text-sm text-muted">Lo está armando {heldBy(order)}</span>
            ) : null}
            <Button
              variant="ghost"
              size="lg"
              onClick={(event) => {
                event.stopPropagation()
                openPreparation(order)
              }}
            >
              Armar en Mi preparación
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Pedidos y Preparación"
        subtitle="Pedidos de la semana, por preparar y preparados."
      />

      <div className="mt-6 grid grid-cols-3 items-center gap-2">
        <Button
          variant="ghost"
          size="lg"
          className="justify-self-start"
          onClick={() => showWeek(weekOffset - 1)}
        >
          <span className="sm:hidden">‹</span>
          <span className="hidden sm:inline">‹ Sem. anterior</span>
        </Button>
        <p className="text-center text-sm font-semibold sm:text-base">{weekTitle}</p>
        <Button
          variant="ghost"
          size="lg"
          className="justify-self-end"
          onClick={() => showWeek(weekOffset + 1)}
        >
          <span className="sm:hidden">›</span>
          <span className="hidden sm:inline">Sem. siguiente ›</span>
        </Button>
      </div>

      <FilterBar
        chips={[
          {
            id: 'incompletos',
            label: 'Armado',
            variant: 'segmented',
            value: scope,
            options: [
              { value: 'todos', label: 'Todos' },
              { value: 'incompletos', label: 'Incompletos' },
            ],
            onChange: (next) => setScope(next === 'incompletos' ? 'incompletos' : 'todos'),
          },
        ]}
      />

      <ListBox
        className="mt-4"
        counters={days.map((day) => {
          const iso = toIso(day)
          const count = weekOrders.filter((order) => order.deliveryDate === iso).length
          return {
            key: iso,
            label: formatDayLabel(day),
            count,
            active: iso === toIso(selectedDate),
            onClick: () => {
              if (iso !== toIso(selectedDate) && openId) closePedido()
              setSelectedIso(iso)
            },
          }
        })}
      >
        {shownOrders.length === 0 ? (
          <EmptyState variant="plain" icon={<NavIcon name="box" />} title="No hay pedidos" />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table
                bare
                columns={columns}
                rows={shownOrders}
                rowKey={(order) => order.id}
                onRowClick={(order) => openPedido(order.id)}
              />
            </div>
            <div className="flex flex-col lg:hidden">
              {shownOrders.map((order) => (
                <article
                  key={order.id}
                  className="cursor-pointer border-b border-border px-4 py-3 text-left last:border-b-0"
                  onClick={() => openPedido(order.id)}
                >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    onClick={(event) => {
                      event.stopPropagation()
                      openPedido(order.id)
                    }}
                  >
                    N° {order.id}
                  </button>
                  <PriorityChip order={order} />
                  <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>
                  <PrepChip order={order} />
                </div>
                <p className="mt-2 font-semibold uppercase">{order.client}</p>
                {order.zone ? <p className="mt-1 text-sm text-muted">{order.zone}</p> : null}
                {order.timeWindow ? <p className="mt-1 text-sm text-muted">{order.timeWindow}</p> : null}
                <p className="mt-2 text-sm text-text">{armadoCell(order)}</p>
                {user && canPrepare(user.role) && order.status === 'pendiente' ? (
                  <>
                    {heldBy(order) ? (
                      <p className="mt-3 text-sm text-muted">Lo está armando {heldBy(order)}</p>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="lg"
                      className="mt-3"
                      onClick={(event) => {
                        event.stopPropagation()
                        openPreparation(order)
                      }}
                    >
                      Armar en Mi preparación
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="lg"
                    className="mt-3"
                    onClick={(event) => {
                      event.stopPropagation()
                      openPedido(order.id)
                    }}
                  >
                    Ver pedido
                  </Button>
                )}
              </article>
            ))}
          </div>
        </>
        )}
      </ListBox>

      <Drawer
        open={Boolean(openOrder)}
        onClose={closePedido}
        title={openOrder?.id ?? 'Pedido'}
        subtitle={openOrder ? openOrder.client.toUpperCase() : undefined}
        footer={
          openOrder ? (
            <>
              {user && canPrepare(user.role) && openOrder.status === 'pendiente' ? (
                <>
                  {heldBy(openOrder) ? (
                    <p className="text-sm text-muted">Lo está armando {heldBy(openOrder)}</p>
                  ) : null}
                  <Button variant="primary" size="lg" onClick={() => openPreparation(openOrder)}>
                    Armar en Mi preparación
                  </Button>
                </>
              ) : null}
              {user && canEditOrder(user, openOrder) ? (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => navigate('/nuevo-pedido', { state: { orderId: openOrder.id } })}
                >
                  Editar
                </Button>
              ) : null}
              {user && canCancelOrder(user.role) ? (
                <Button
                  variant="danger-outline"
                  size="lg"
                  disabled={busyId === openOrder.id}
                  onClick={() => void cancelOrder(openOrder)}
                >
                  {user.role === 'admin' ? 'Borrar' : 'Cancelar'}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {openOrder ? (
          <div className="flex flex-col gap-4">
            <Link className="text-sm font-medium text-accent hover:underline" to={`/pedidos/${openOrder.id}`}>
              Abrir página completa
            </Link>
            <OrderDetail order={openOrder} compact />
            <PrepChecklist order={openOrder} userId={user?.id} role={user?.role} />
          </div>
        ) : null}
      </Drawer>

    </Page>
  )
}
