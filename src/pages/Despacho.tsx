import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { PriorityChip } from '../components/PriorityChip'
import { Badge, Button, Drawer, EmptyState, FilterBar, ListBox, Page, PageHeader, Select, statusTone, Table, type TableColumn } from '../components/ui'
import { NavIcon } from '../layout/NavIcon'
import { QrCoverDialog } from '../components/QrCoverDialog'
import { QrScanDialog } from '../components/QrScanDialog'
import {
  isOwnDelivery,
  isPickup,
  listForDispatch,
  withCurrent,
  withExtras,
} from '../data/catalog'
import {
  STATUS_LABEL,
  type Order,
  type OrderStatus,
} from '../data/orders'
import {
  MONTH_SHORT,
  formatDayLabel,
  toIso,
  weekDays,
  weekOffsetForIso,
} from '../lib/week'
import { askPlanRoute, askReason, confirm, error, success } from '../lib/alerts'
import { canAssignDispatch, canConfirmDelivery, canEditOrder } from '../lib/access'
import { compareOpenPriority } from '../lib/priority'
import { driverSlotCount, normalizeTimeWindow, SLOT_LIMIT, slotQuestion } from '../lib/slot'
import { isSession } from '../lib/authStore'
import { listRouteSheets, type RouteSheet } from '../lib/routeSheetsApi'
import { businessToday } from '../lib/schedule'
import { listUsers } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'

type DispatchTab = 'pendiente' | 'preparado' | 'asignado' | 'en-viaje' | 'entregado'
type DialogKind = 'caratula' | 'entrega'

const TABS: { id: DispatchTab; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'preparado', label: 'Preparados' },
  { id: 'asignado', label: 'Esperando salida' },
  { id: 'en-viaje', label: 'En viaje' },
  { id: 'entregado', label: 'Entregados' },
]

function matchesTab(order: Order, tab: DispatchTab) {
  return order.status === tab
}

function SlotUsage({ orders, order }: { orders: Order[]; order: Order }) {
  if (!order.driverId || !normalizeTimeWindow(order.timeWindow)) return null
  const count = driverSlotCount(orders, order.driverId, order.deliveryDate, order.timeWindow)
  const full = count >= SLOT_LIMIT
  return (
    <p className={`text-xs ${full ? 'text-danger' : 'text-muted'}`}>
      Cupo en la franja: {count}/{SLOT_LIMIT}
    </p>
  )
}

function DriverChoice({
  orders,
  order,
  driverId,
  name,
}: {
  orders: Order[]
  order: Order
  driverId: string
  name: string
}) {
  const count = driverSlotCount(orders, driverId, order.deliveryDate, order.timeWindow)
  const full = Boolean(order.timeWindow) && count >= SLOT_LIMIT
  return (
    <option
      value={driverId}
      className={full ? 'text-danger' : undefined}
    >
      {order.timeWindow ? `${name} (${count}/${SLOT_LIMIT})` : name}
    </option>
  )
}

function choferOptions(
  drivers: { id: string; name: string; active: boolean }[],
  order: Order,
) {
  const current = drivers.find((driver) => driver.id === order.driverId)
  const active = drivers.filter((driver) => driver.active)
  if (!normalizeTimeWindow(order.timeWindow)) return current ? [current] : []
  if (current && !current.active) return [...active, current]
  return active
}

function tabFor(status: OrderStatus): DispatchTab {
  return status
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function findOrder(orders: Order[], raw: string) {
  const code = normalize(raw)
  if (code.length < 3) return undefined
  const exact = orders.find((order) => normalize(order.id) === code)
  if (exact) return exact
  return orders.find((order) =>
    order.invoices?.some((invoice) => normalize(invoice).includes(code)),
  )
}

export function Despacho() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout } = useAuth()
  const { orders, loading, patchFields, transitionOrder } = useOrders()
  const { transporters: catalogTransporters, ownTransporters, courierTransporters } = useCatalog()
  const [drivers, setDrivers] = useState<{ id: string; name: string; active: boolean }[]>([])
  const [sheets, setSheets] = useState<RouteSheet[]>([])
  const [tab, setTab] = useState<DispatchTab>('en-viaje')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedIso, setSelectedIso] = useState(() => businessToday())
  const [query, setQuery] = useState('')
  const [transporter, setTransporter] = useState('todos')
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [coverId, setCoverId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [alignedId, setAlignedId] = useState<string | null>(null)

  const assign = Boolean(user && canAssignDispatch(user.role))
  const confirmDelivery = Boolean(user && canConfirmDelivery(user.role))

  useEffect(() => {
    if (!assign) return
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        return
      }
      if (!Array.isArray(result.data)) return
      setDrivers(
        result.data.filter(isSession).flatMap((item) =>
          item.role === 'chofer' ? [{ id: item.id, name: item.name, active: item.active }] : [],
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [assign, logout])

  const days = weekDays(weekOffset)
  const selectedDate = days.find((day) => toIso(day) === selectedIso) ?? days[0]
  const searching = query.trim().length > 0

  const transporters = withExtras(
    catalogTransporters,
    orders.map((order) => order.transporter),
  )

  function inScope(order: Order) {
    if (!matchesTab(order, tab)) return false
    if (transporter !== 'todos' && order.transporter !== transporter) return false
    return true
  }

  useEffect(() => {
    let cancelled = false
    async function loadSheets() {
      if (searching) {
        const needle = query.trim().toLowerCase()
        const matches = orders.filter((order) => {
          if (!matchesTab(order, tab)) return false
          if (transporter !== 'todos' && order.transporter !== transporter) return false
          if (order.id.toLowerCase().includes(needle)) return true
          if (order.client.toLowerCase().includes(needle)) return true
          return order.invoices?.some((invoice) => invoice.toLowerCase().includes(needle)) ?? false
        })
        const dates = [...new Set(matches.map((order) => order.deliveryDate).filter(Boolean))]
        if (dates.length === 0) {
          if (!cancelled) setSheets([])
          return
        }
        const results = await Promise.all(dates.map((date) => listRouteSheets(date)))
        if (cancelled) return
        const merged: RouteSheet[] = []
        for (const result of results) {
          if (!result.ok) continue
          for (const sheet of result.data) {
            if (!merged.some((item) => item.id === sheet.id)) merged.push(sheet)
          }
        }
        setSheets(merged)
        return
      }
      const result = await listRouteSheets(selectedIso)
      if (cancelled || !result.ok) return
      setSheets(result.data)
    }
    void loadSheets()
    return () => {
      cancelled = true
    }
  }, [selectedIso, orders, searching, query, tab, transporter])

  function matchesQuery(order: Order) {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const haystack = [order.id, order.client, ...(order.invoices ?? [])].join(' ').toLowerCase()
    return haystack.includes(needle)
  }

  const scoped = orders.filter(inScope)
  const dayOrders = (
    searching
      ? scoped.filter(matchesQuery)
      : scoped.filter(
          (order) => order.deliveryDate === toIso(selectedDate) && matchesQuery(order),
        )
  ).sort((left, right) => {
    const byPriority = compareOpenPriority(left, right)
    if (byPriority !== 0) return byPriority
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
  const openId = searchParams.get('pedido')
  const openOrder = dayOrders.find((order) => order.id === openId) ?? null

  const closePedido = useCallback(() => {
    if (location.state && typeof location.state === 'object' && (location.state as { fromList?: boolean }).fromList) {
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
  }, [location.state, navigate, setSearchParams])

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
    if (found) {
      setAlignedId(openId)
      if (toIso(selectedDate) !== found.deliveryDate) {
        setWeekOffset(weekOffsetForIso(found.deliveryDate))
        setSelectedIso(found.deliveryDate)
      }
      if (!matchesTab(found, tab)) setTab(tabFor(found.status))
      if (query) setQuery('')
    }
  }

  useEffect(() => {
    if (loading || !openId) return
    if (!orders.some((order) => order.id === openId)) closePedido()
  }, [loading, openId, orders, closePedido])

  useEffect(() => {
    if (!openId || alignedId !== openId) return
    if (!dayOrders.some((order) => order.id === openId)) closePedido()
  }, [openId, alignedId, dayOrders, closePedido])

  function showWeek(offset: number) {
    const nextDays = weekDays(offset)
    const today = businessToday()
    const match = nextDays.find((day) => toIso(day) === today)
    setWeekOffset(offset)
    setSelectedIso(toIso(match ?? nextDays[0]))
  }

  function focusOrder(order: Order) {
    setTab(tabFor(order.status))
    setWeekOffset(weekOffsetForIso(order.deliveryDate))
    setSelectedIso(order.deliveryDate)
    setQuery('')
    setHighlightId(order.id)
  }

  async function assignTransporter(order: Order, next: string) {
    const name = next.trim()
    const accepted = await confirm(
      name ? 'Asignar transportista' : 'Quitar transportista',
      name ? `El pedido ${order.id} queda con ${name}.` : `El pedido ${order.id} queda sin transportista.`,
    )
    if (!accepted) return false
    setBusyId(order.id)
    const result = await patchFields(order.id, { transporter: name || null })
    setBusyId('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    await success(name ? 'Transportista asignado' : 'Transportista quitado')
    return true
  }

  function driverName(driverId: string) {
    return drivers.find((driver) => driver.id === driverId)?.name ?? 'el chofer'
  }

  async function assignDriver(order: Order, driverId: string) {
    const assigns = Boolean(driverId) && order.status === 'preparado'
    const reassigns = Boolean(driverId) && Boolean(order.driverId) && order.driverId !== driverId
    const clears = !driverId && Boolean(order.driverId) && order.status === 'asignado'
    if (reassigns) {
      const accepted = await confirm(
        'Reasignar chofer',
        `El pedido ${order.id} pasa de ${driverName(order.driverId ?? '')} a ${driverName(driverId)}.`,
      )
      if (!accepted) return false
    } else if (assigns) {
      const accepted = await confirm(
        'Asignar chofer',
        `El pedido ${order.id} pasa a asignado con ${driverName(driverId)}.`,
      )
      if (!accepted) return false
    } else if (clears) {
      const reason = await askReason('Quitar chofer', `El pedido ${order.id} vuelve a preparado.`)
      if (!reason) return false
      return saveClearDriver(order, reason)
    } else if (!driverId && Boolean(order.driverId)) {
      const accepted = await confirm('Quitar chofer', `El pedido ${order.id} queda sin chofer.`)
      if (!accepted) return false
    }
    return saveDriver(order, driverId, assigns)
  }

  async function saveClearDriver(order: Order, reason: string) {
    setBusyId(order.id)
    const result = await transitionOrder(order.id, {
      to: 'preparado',
      reason,
      via: 'despacho',
    })
    setBusyId('')
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    await success('Chofer quitado')
    return true
  }

  async function saveDriver(order: Order, driverId: string, assigns: boolean, override = false) {
    setBusyId(order.id)
    if (assigns) {
      const fields: Record<string, unknown> = {
        to: 'asignado',
        driverId,
        via: 'despacho',
      }
      if (override) fields.override = true
      const result = await transitionOrder(order.id, fields)
      setBusyId('')
      if (result.status === 'not-saved' && result.code === 'FRANJA_LLENA' && result.slot && !override) {
        if (user && (user.role === 'encargado_deposito' || user.role === 'admin')) {
          const accepted = await confirm(
            'Franja llena',
            slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
          )
          if (!accepted) return false
          return saveDriver(order, driverId, assigns, true)
        }
        await error(result.message)
        return false
      }
      if (result.status === 'not-saved') {
        await error(result.message)
        return false
      }
      await success('Chofer asignado')
      await offerPlan(driverId, order.deliveryDate)
      return true
    }
    const fields: Record<string, unknown> = { driverId: driverId || null, via: 'despacho' }
    if (override) fields.override = true
    const result = await patchFields(order.id, fields)
    setBusyId('')
    if (result.status === 'not-saved' && result.code === 'FRANJA_LLENA' && result.slot && !override) {
      if (user && (user.role === 'encargado_deposito' || user.role === 'admin')) {
        const accepted = await confirm(
          'Franja llena',
          slotQuestion(result.slot.timeWindow, result.slot.deliveryDate, result.slot.count),
        )
        if (!accepted) return false
        return saveDriver(order, driverId, assigns, true)
      }
      await error(result.message)
      return false
    }
    if (result.status === 'not-saved') {
      await error(result.message)
      return false
    }
    if (driverId) await offerPlan(driverId, order.deliveryDate)
    return true
  }

  async function offerPlan(driverId: string, deliveryDate: string | undefined) {
    if (!driverId || !deliveryDate) return
    if (!user || (user.role !== 'encargado_deposito' && user.role !== 'admin')) return
    const plan = await askPlanRoute()
    if (!plan) return
    const params = new URLSearchParams({ chofer: driverId, fecha: deliveryDate })
    navigate(`/rutas?${params.toString()}`)
  }

  async function submitCode(code: string) {
    const order = findOrder(orders, code)
    if (!order) {
      setDialogError('No encontré un pedido con ese código.')
      return
    }
    if (dialog === 'entrega') {
      if (order.status === 'entregado') {
        setDialogError('Ese pedido ya está entregado.')
        return
      }
      const accepted = await confirm('Entregado', `El pedido ${order.id} queda entregado.`)
      if (!accepted) return
      setScanBusy(true)
      const result = await transitionOrder(order.id, { to: 'entregado', via: 'qr' })
      setScanBusy(false)
      if (result.status === 'not-saved') {
        await error(result.message)
        return
      }
      focusOrder(result.order)
      setNotice(`Entrega confirmada: ${result.order.id}`)
      setDialog(null)
      await success('Pedido entregado')
    } else {
      focusOrder(order)
      setNotice(`Pedido encontrado: ${order.id}`)
    }
    setDialog(null)
    setDialogError('')
  }

  useEffect(() => {
    if (!highlightId) return
    document.getElementById(`order-${highlightId}`)?.scrollIntoView({ block: 'nearest' })
  }, [highlightId, tab, selectedIso, dayOrders.length])

  const coverOrder = coverId ? orders.find((order) => order.id === coverId) : undefined

  const weekTitle =
    weekOffset === 0
      ? 'Esta semana'
      : `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  const dispatchColumns: TableColumn<Order>[] = [
    {
      key: 'id',
      header: 'N°',
      cell: (order) => (
        <Link
          id={`order-${order.id}`}
          className="font-medium text-accent hover:underline"
          to={`/?pedido=${encodeURIComponent(order.id)}`}
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
      cell: (order) => <Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Badge>,
    },
    { key: 'zone', header: 'Zona', cell: (order) => order.zone || '—' },
    {
      key: 'carrier',
      header: 'Transportista',
      cell: (order) => order.driverName?.trim() || order.transporter || '—',
    },
    { key: 'slot', header: 'Franja', cell: (order) => order.timeWindow || '—' },
    {
      key: 'packages',
      header: 'Bultos',
      align: 'right',
      cell: (order) => (order.packages != null ? order.packages : '—'),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Despacho"
        subtitle="Seguimiento de pedidos en viaje y entregados"
        actions={
          confirmDelivery ? (
            <Button
              variant="primary"
              size="lg"
              className="shrink-0"
              onClick={() => {
                setDialogError('')
                setDialog('entrega')
              }}
            >
              Escanear QR y confirmar entrega
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <p className="mt-4 rounded-xl bg-success-soft px-4 py-2 text-sm text-success">{notice}</p>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                active
                  ? 'border-accent font-semibold text-text'
                  : 'border-transparent text-muted'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 items-center gap-2">
        <Button variant="ghost" size="lg" className="justify-self-start" onClick={() => showWeek(weekOffset - 1)}>
          <span className="sm:hidden">‹</span>
          <span className="hidden sm:inline">‹ Sem. anterior</span>
        </Button>
        <p className="text-center text-sm font-semibold sm:text-base">{weekTitle}</p>
        <Button variant="ghost" size="lg" className="justify-self-end" onClick={() => showWeek(weekOffset + 1)}>
          <span className="sm:hidden">›</span>
          <span className="hidden sm:inline">Sem. siguiente ›</span>
        </Button>
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="mt-4 shrink-0 self-start"
        onClick={() => {
          setDialogError('')
          setDialog('caratula')
        }}
      >
        Escanear QR carátula
      </Button>

      <ListBox
        className="mt-4"
        counters={days.map((day) => {
          const iso = toIso(day)
          return {
            key: iso,
            label: formatDayLabel(day),
            count: scoped.filter((order) => order.deliveryDate === iso).length,
            active: !searching && iso === toIso(selectedDate),
            onClick: () => {
              setSelectedIso(iso)
              setQuery('')
            },
          }
        })}
        filters={
          <FilterBar
            size="lg"
            search={{
              value: query,
              onChange: setQuery,
              label: 'Buscar pedido',
              srOnly: true,
              placeholder: 'Buscar en todos los días — cliente, factura o N° pedido...',
            }}
            selects={[
              {
                id: 'transportista',
                label: 'Transportista',
                value: transporter,
                onChange: setTransporter,
                options: [
                  { value: 'todos', label: 'Todos los transportistas' },
                  ...transporters.map((name) => ({ value: name, label: name })),
                ],
              },
            ]}
            activeCount={(query.trim() ? 1 : 0) + (transporter !== 'todos' ? 1 : 0)}
            onClear={() => {
              setQuery('')
              setTransporter('todos')
            }}
          />
        }
      >
        {dayOrders.length === 0 ? (
          <EmptyState variant="plain" icon={<NavIcon name="truck" />} title="No hay pedidos para este día" />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table
                bare
                columns={dispatchColumns}
                rows={dayOrders}
                rowKey={(order) => order.id}
                onRowClick={(order) => openPedido(order.id)}
              />
            </div>
            <div className="flex flex-col lg:hidden">
              {dayOrders.map((order) => (
                <article
                  key={order.id}
                  id={`order-${order.id}`}
                  className={`cursor-pointer border-b border-border px-4 py-3 last:border-b-0 ${
                    highlightId === order.id ? 'ring-2 ring-accent' : ''
                  }`}
                  onClick={() => openPedido(order.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation()
                        openPedido(order.id)
                      }}
                    >
                      N° {order.id}
                    </button>
                    <PriorityChip order={order} />
                    <Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Badge>
                  </div>
                  <p className="mt-2 font-semibold uppercase">{order.client}</p>
                  {order.zone ? <p className="mt-1 text-sm text-muted">{order.zone}</p> : null}
                  {order.timeWindow ? <p className="mt-1 text-sm text-muted">{order.timeWindow}</p> : null}
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
            <div className="flex w-full flex-col gap-2">
                  {assign && !isPickup(openOrder) && (
                    <>
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
                        Transportista
                        <Select
                          size="lg"
                          value={openOrder.transporter ?? ''}
                          disabled={busyId === openOrder.id}
                          onChange={(event) => {
                            const select = event.target
                            const next = select.value
                            const previous = openOrder.transporter ?? ''
                            void assignTransporter(openOrder, next).then((saved) => {
                              if (!saved) select.value = previous
                            })
                          }}
                        >
                          <option value="">Sin transportista</option>
                          {withCurrent(
                            listForDispatch(openOrder.dispatchType ?? 'propia', {
                              ownTransporters,
                              courierTransporters,
                            }),
                            openOrder.transporter,
                          ).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      {isOwnDelivery(openOrder) && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`chofer-${openOrder.id}`} className="text-sm font-medium text-text">
                          Chofer
                        </label>
                        <div className="flex flex-col gap-2">
                          {openOrder.status === 'pendiente' ? (
                            <Select id={`chofer-${openOrder.id}`} size="lg" value="" disabled>
                              <option value="">Primero marcá preparado</option>
                            </Select>
                          ) : openOrder.status === 'en-viaje' || openOrder.status === 'entregado' ? (
                            <Select
                              id={`chofer-${openOrder.id}`}
                              size="lg"
                              value={openOrder.driverId ?? ''}
                              disabled
                            >
                              <option value={openOrder.driverId ?? ''}>
                                {openOrder.driverId
                                  ? drivers.find((driver) => driver.id === openOrder.driverId)?.name ??
                                    openOrder.driverId
                                  : 'Sin chofer'}
                              </option>
                            </Select>
                          ) : !normalizeTimeWindow(openOrder.timeWindow) && !openOrder.driverId ? (
                            <Select id={`chofer-${openOrder.id}`} size="lg" value="" disabled>
                              <option value="">Asigná una franja primero</option>
                            </Select>
                          ) : (
                            <Select
                              id={`chofer-${openOrder.id}`}
                              size="lg"
                              value={openOrder.driverId ?? ''}
                              disabled={busyId === openOrder.id}
                              aria-describedby={
                                !normalizeTimeWindow(openOrder.timeWindow) && openOrder.driverId
                                  ? `franja-${openOrder.id}`
                                  : undefined
                              }
                              onChange={(event) => {
                                const select = event.target
                                const driverId = select.value
                                const previous = openOrder.driverId ?? ''
                                void assignDriver(openOrder, driverId).then((saved) => {
                                  if (!saved) select.value = previous
                                })
                              }}
                            >
                              <option value="">Sin chofer</option>
                              {choferOptions(drivers, openOrder).map((driver) => (
                                <DriverChoice
                                  key={driver.id}
                                  orders={orders}
                                  order={openOrder}
                                  driverId={driver.id}
                                  name={driver.active ? driver.name : `${driver.name} (inactivo)`}
                                />
                              ))}
                              {openOrder.driverId && !drivers.some((driver) => driver.id === openOrder.driverId) && (
                                <DriverChoice
                                  orders={orders}
                                  order={openOrder}
                                  driverId={openOrder.driverId}
                                  name={openOrder.driverId}
                                />
                              )}
                            </Select>
                          )}
                          {openOrder.status !== 'pendiente' &&
                            openOrder.status !== 'en-viaje' &&
                            openOrder.status !== 'entregado' &&
                            !normalizeTimeWindow(openOrder.timeWindow) &&
                            openOrder.driverId && (
                            <p id={`franja-${openOrder.id}`} className="shrink-0">
                              Asigná una franja primero
                            </p>
                          )}
                        </div>
                      </div>
                      )}
                      {isOwnDelivery(openOrder) && <SlotUsage orders={orders} order={openOrder} />}
                    </>
                  )}
                  {user && (
                    <OrderFlowButtons
                      order={{
                        ...openOrder,
                        sheetPlanned: Boolean(
                          isOwnDelivery(openOrder) &&
                            openOrder.routeId &&
                            sheets.some((sheet) => sheet.id === openOrder.routeId && sheet.status === 'planificada'),
                        ),
                      }}
                      role={user.role}
                      via="despacho"
                      busy={busyId === openOrder.id}
                      onBusy={(busy) => setBusyId(busy ? openOrder.id : '')}
                      transition={transitionOrder}
                      driverSelectId={isOwnDelivery(openOrder) ? `chofer-${openOrder.id}` : undefined}
                    />
                  )}
                  {user && canEditOrder(user, openOrder) && (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => navigate('/nuevo-pedido', { state: { orderId: openOrder.id } })}
                    >
                      Editar
                    </Button>
                  )}
                  {(assign || confirmDelivery) && (
                    <Button variant="secondary" size="lg" onClick={() => setCoverId(openOrder.id)}>
                      Carátula
                    </Button>
                  )}
            </div>
          ) : null
        }
      >
        {openOrder ? <OrderDetail order={openOrder} compact /> : null}
      </Drawer>


      {dialog && (
        <QrScanDialog
          key={dialog}
          title={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar carátula'}
          hint="Apuntá la cámara al QR, o pegá el N° de pedido o la factura."
          confirmLabel={dialog === 'entrega' ? 'Confirmar entrega' : 'Buscar'}
          error={dialogError}
          pending={scanBusy}
          onClose={() => {
            if (scanBusy) return
            setDialog(null)
          }}
          onSubmit={submitCode}
        />
      )}
      {coverOrder && <QrCoverDialog order={coverOrder} onClose={() => setCoverId(null)} />}
    </Page>
  )
}
