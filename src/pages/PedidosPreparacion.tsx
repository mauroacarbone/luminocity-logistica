import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Drawer, EmptyState, Modal, Page, PageHeader, statusTone, Table, type TableColumn } from '../components/ui'
import { OrderDetail } from '../components/OrderDetail'
import { PriorityChip } from '../components/PriorityChip'
import { DISPATCH_LABEL } from '../data/catalog'
import { type Order } from '../data/orders'
import { confirm, error, success } from '../lib/alerts'
import { canCancelOrder, canEditOrder, canPrepare } from '../lib/access'
import { statusPillFor } from '../lib/orderFlow'
import { compareOpenPriority } from '../lib/priority'
import {
  DAY_LONG,
  DAY_SHORT,
  MONTH_SHORT,
  formatDayLabel,
  toIso,
  weekDays,
  weekOffsetForIso,
} from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

function readPackages(raw: string) {
  const trimmed = raw.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  return Number(trimmed)
}

function PackagesDialog({
  orderId,
  saveError,
  saving,
  onClose,
  onConfirm,
}: {
  orderId: string
  saveError: string
  saving: boolean
  onClose: () => void
  onConfirm: (packages: number) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const packages = readPackages(value)
    if (packages == null) {
      setError('Ingresá una cantidad entera de bultos (1 o más).')
      return
    }
    onConfirm(packages)
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="packages-title"
      closeOnEscape={!saving}
      className="grid place-items-center bg-black/40 p-4"
    >
      <form
        noValidate
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-lg"
        onSubmit={onSubmit}
      >
        <h2 id="packages-title" className="text-xl font-semibold">Marcar preparado</h2>
        <p className="mt-1 text-sm text-muted">
          Indicá cuántos bultos tiene el pedido {orderId}.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Cantidad de bultos
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError('')
            }}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {saveError && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {saveError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="lg" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  )
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
  const { orders, loading, removeOrder, transitionOrder } = useOrders()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => toIso(new Date()))
  const [preparing, setPreparing] = useState<Order | null>(null)
  const [prepareError, setPrepareError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
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
    const today = toIso(new Date())
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
    if (openId) closePedido()
  }

  async function markPrepared(packages: number) {
    if (!preparing) return
    const accepted = await confirm(
      'Marcar preparado',
      `El pedido ${preparing.id} queda preparado con ${packages} bulto${packages === 1 ? '' : 's'}.`,
    )
    if (!accepted) return
    setSaving(true)
    const result = await transitionOrder(preparing.id, {
      to: 'preparado',
      packages,
      via: 'pedidos',
    })
    setSaving(false)
    if (result.status === 'not-saved') {
      setPrepareError(result.message)
      await error(result.message)
      return
    }
    setPrepareError('')
    setPreparing(null)
    await success('Pedido preparado')
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
      cell: (order) => <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>,
    },
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
          <Button
            variant="ghost"
            size="lg"
            disabled={busyId === order.id}
            onClick={(event) => {
              event.stopPropagation()
              setPreparing(order)
            }}
          >
            Marcar preparado
          </Button>
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

      <div className="mt-4 grid min-w-0 grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = toIso(day)
          const count = weekOrders.filter((order) => order.deliveryDate === iso).length
          const selected = iso === toIso(selectedDate)
          return (
            <button
              key={iso}
              type="button"
              className={`flex min-w-0 flex-col items-center gap-1 border-b-2 px-0.5 py-2 text-xs sm:text-sm ${
                selected
                  ? 'border-accent font-semibold text-text'
                  : 'border-transparent text-muted'
              }`}
              onClick={() => {
                if (iso !== toIso(selectedDate) && openId) closePedido()
                setSelectedIso(iso)
              }}
            >
              <span className="truncate sm:hidden">{DAY_SHORT[day.getDay()]}</span>
              <span className="hidden truncate sm:inline">{formatDayLabel(day)}</span>
              <span
                className={`grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                  selected ? 'bg-accent text-accent-fg' : 'bg-surface text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold">{DAY_LONG[selectedDate.getDay()]}</h2>
        <p className="text-sm text-muted">
          {dayOrders.length} pedido{dayOrders.length === 1 ? '' : 's'}
        </p>
      </div>

      {dayOrders.length === 0 ? (
        <EmptyState className="mt-4" title="No hay pedidos." />
      ) : (
        <>
          <div className="mt-4 hidden lg:block">
            <Table columns={columns} rows={dayOrders} rowKey={(order) => order.id} onRowClick={(order) => openPedido(order.id)} />
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:hidden">
            {dayOrders.map((order) => (
              <article
                key={order.id}
                className="cursor-pointer rounded-2xl bg-surface p-4 text-left shadow-sm"
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
                </div>
                <p className="mt-2 font-semibold uppercase">{order.client}</p>
                {order.zone ? <p className="mt-1 text-sm text-muted">{order.zone}</p> : null}
                {order.timeWindow ? <p className="mt-1 text-sm text-muted">{order.timeWindow}</p> : null}
                <Button
                  variant="ghost"
                  size="lg"
                  className="mt-3"
                  disabled={Boolean(user && canPrepare(user.role) && order.status === 'pendiente' && busyId === order.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (user && canPrepare(user.role) && order.status === 'pendiente') setPreparing(order)
                    else openPedido(order.id)
                  }}
                >
                  {user && canPrepare(user.role) && order.status === 'pendiente' ? 'Marcar preparado' : 'Ver pedido'}
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={Boolean(openOrder)}
        onClose={closePedido}
        title={openOrder?.id ?? 'Pedido'}
        subtitle={openOrder ? openOrder.client.toUpperCase() : undefined}
        footer={
          openOrder ? (
            <>
              {user && canPrepare(user.role) && openOrder.status === 'pendiente' ? (
                <Button variant="primary" size="lg" disabled={busyId === openOrder.id} onClick={() => setPreparing(openOrder)}>
                  Marcar preparado
                </Button>
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
          </div>
        ) : null}
      </Drawer>

      {preparing && (
        <PackagesDialog
          orderId={preparing.id}
          saveError={prepareError}
          saving={saving}
          onClose={() => {
            if (saving) return
            setPrepareError('')
            setPreparing(null)
          }}
          onConfirm={(packages) => void markPrepared(packages)}
        />
      )}
    </Page>
  )
}
