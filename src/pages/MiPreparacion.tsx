import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrderAttachmentLink } from '../components/OrderAttachmentLink'
import { PrepChecklist } from '../components/PrepChecklist'
import { PrepChip } from '../components/PrepChip'
import { PriorityChip } from '../components/PriorityChip'
import { ChoiceGroup } from '../components/ChoiceGroup'
import { Badge, Button, Drawer, EmptyState, Input, Page, PageHeader } from '../components/ui'
import { DISPATCH_LABEL, isPickup } from '../data/catalog'
import type { Order } from '../data/orders'
import { confirm, error as showError } from '../lib/alerts'
import { checklistOf, formatPrepMs, prepDuration, takeState, takenByName } from '../lib/preparation'
import { compareOpenPriority } from '../lib/priority'
import { businessToday } from '../lib/schedule'
import { normalizeTimeWindow } from '../lib/slot'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'

type Queue = 'armar' | 'mios' | 'hoy'

function baDay(iso: string | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function invoiceNumbers(order: Order) {
  return (order.invoices ?? []).map((invoice) => invoice.trim()).filter(Boolean)
}

function armingText(order: Order, now: number, mineId: string) {
  if (takeState(order, now) === 'en-preparacion') {
    const duration = now ? formatPrepMs(prepDuration(order, now)) : '—'
    if (order.preparation?.takenBy?.id === mineId) return `Armando · ${duration}`
    const name = takenByName(order) || 'otro operario'
    return `Armando · ${name} · ${duration}`
  }
  const elapsed = prepDuration(order, now)
  if (elapsed != null) return `Sin empezar · ${formatPrepMs(elapsed)}`
  return 'Sin empezar'
}

function InvoiceFile({ order }: { order: Order }) {
  if (order.attachmentDataUrl) {
    return (
      <OrderAttachmentLink
        name={order.attachmentName}
        dataUrl={order.attachmentDataUrl}
        label="Ver FC / nota de pedido"
      />
    )
  }
  if (isPickup(order)) return <Badge tone="warning">Sin PDF adjunto</Badge>
  return <p className="text-sm text-muted">Sin PDF adjunto</p>
}

function isOverdue(order: Order, today: string) {
  return Boolean(order.deliveryDate?.trim()) && order.deliveryDate < today && order.status !== 'entregado'
}

function compareQueue(left: Order, right: Order, today: string) {
  const priority = compareOpenPriority(left, right)
  if (priority !== 0) return priority
  const late = Number(isOverdue(right, today)) - Number(isOverdue(left, today))
  if (late !== 0) return late
  const slot = normalizeTimeWindow(left.timeWindow).localeCompare(normalizeTimeWindow(right.timeWindow), 'es')
  if (slot !== 0) return slot
  return (left.deliveryDate || '').localeCompare(right.deliveryDate || '')
}

function useNow() {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [])
  return now
}

export function MiPreparacion() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const { orders, loading, takeOrder, releaseOrder, transitionOrder, refresh } = useOrders()
  const { lines } = usePicking()
  const today = businessToday()
  const now = useNow()
  const [queue, setQueue] = useState<Queue>('armar')
  const [openId, setOpenId] = useState('')
  const [seenPedido, setSeenPedido] = useState('')
  const requestedId = searchParams.get('pedido') ?? ''
  const [packages, setPackages] = useState('1')
  const [busy, setBusy] = useState('')
  const [detailError, setDetailError] = useState('')
  if (!requestedId && seenPedido) setSeenPedido('')

  const mineId = user?.id ?? ''
  const pending = orders.filter((order) => order.status === 'pendiente')
  const free = pending.filter((order) => takeState(order, now) !== 'en-preparacion' || order.preparation?.takenBy?.id === mineId)
  const waiting = pending
    .filter((order) => takeState(order, now) === 'en-preparacion' && order.preparation?.takenBy?.id !== mineId)
    .sort((left, right) => compareQueue(left, right, today))
  const toBuild = free
    .filter((order) => order.preparation?.takenBy?.id !== mineId || takeState(order, now) !== 'en-preparacion')
    .sort((left, right) => compareQueue(left, right, today))
  const mine = pending
    .filter((order) => order.preparation?.takenBy?.id === mineId && takeState(order, now) === 'en-preparacion')
    .sort((left, right) => compareQueue(left, right, today))
  const doneToday = orders
    .filter((order) => order.preparedBy?.id === mineId && baDay(order.preparedAt) === today)
    .sort((left, right) => (right.preparedAt || '').localeCompare(left.preparedAt || ''))

  const visible = queue === 'armar' ? [...toBuild, ...waiting] : queue === 'mios' ? mine : doneToday
  const open = orders.find((order) => order.id === openId) ?? null
  const openHeldByOther = open ? takeState(open, now) === 'en-preparacion' && open.preparation?.takenBy?.id !== mineId : false
  const openMine = open ? open.preparation?.takenBy?.id === mineId && takeState(open, now) === 'en-preparacion' : false

  const subtitle = formatIsoDate(today)

  useEffect(() => {
    if (!requestedId || loading || seenPedido === requestedId) return
    const order = orders.find((item) => item.id === requestedId)
    const handle = window.setTimeout(() => {
      setSeenPedido(requestedId)
      if (!order || (order.status !== 'pendiente' && order.status !== 'preparado')) {
        void showError('Ese pedido no está para armar.')
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current)
            next.delete('pedido')
            return next
          },
          { replace: true },
        )
        return
      }
      setOpenId(order.id)
      setPackages(String(order.packages && order.packages >= 1 ? order.packages : 1))
      setDetailError('')
      if (order.preparedBy?.id === mineId && baDay(order.preparedAt) === today) setQueue('hoy')
      else if (
        order.preparation?.takenBy?.id === mineId &&
        takeState(order, Date.now()) === 'en-preparacion'
      ) {
        setQueue('mios')
      } else setQueue('armar')
    }, 0)
    return () => window.clearTimeout(handle)
  }, [requestedId, loading, seenPedido, orders, mineId, today, setSearchParams])

  function closeDrawer() {
    setOpenId('')
    setSeenPedido('')
    if (!searchParams.get('pedido')) return
    const next = new URLSearchParams(searchParams)
    next.delete('pedido')
    setSearchParams(next, { replace: true })
  }

  function openOrder(order: Order) {
    setOpenId(order.id)
    setPackages(String(order.packages && order.packages >= 1 ? order.packages : 1))
    setDetailError('')
  }

  function changePackages(next: number) {
    setPackages(String(Math.max(1, next)))
  }

  async function take(order: Order) {
    setBusy(order.id)
    const result = await takeOrder(order.id)
    setBusy('')
    if (result.status === 'not-saved') {
      await showError(result.message)
      await refresh({ silent: true })
      return
    }
    openOrder(result.order)
    setQueue('mios')
  }

  async function release(order: Order) {
    setBusy(order.id)
    const result = await releaseOrder(order.id)
    setBusy('')
    if (result.status === 'not-saved') {
      await showError(result.message)
      await refresh({ silent: true })
      return
    }
    setOpenId('')
  }

  async function markArmed(order: Order) {
    const count = Number(packages)
    if (!Number.isInteger(count) || count < 1) {
      setDetailError('Indicá la cantidad de bultos.')
      return
    }
    const check = checklistOf(lines, order)
    if (check.total > 0 && check.done < check.total) {
      const accepted = await confirm(
        'Marcar armado',
        `Queda como armado incompleto (${check.done} de ${check.total} artículos). Se puede completar después.`,
      )
      if (!accepted) return
    }
    setBusy(order.id)
    const result = await transitionOrder(order.id, {
      to: 'preparado',
      packages: count,
      via: 'preparacion',
      ...(check.total > 0 ? { checklist: { done: check.done, total: check.total } } : {}),
    })
    setBusy('')
    if (result.status === 'not-saved') {
      await showError(result.message)
      await refresh({ silent: true })
      return
    }
    setOpenId('')
    setQueue('hoy')
  }

  return (
    <Page>
      <PageHeader title="Mi preparación" subtitle={subtitle} />
      <ChoiceGroup
        label="Cola"
        value={queue}
        onChange={setQueue}
        options={[
          { value: 'armar', label: 'Por armar', count: toBuild.length + waiting.length },
          { value: 'mios', label: 'Míos', count: mine.length },
          { value: 'hoy', label: 'Armados hoy', count: doneToday.length },
        ]}
      />
      {visible.length === 0 ? (
        <EmptyState
          title={queue === 'hoy' ? 'Nada armado hoy' : queue === 'mios' ? 'No tenés pedidos tomados' : 'No hay pedidos por armar'}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((order) => {
            const heldByOther = takeState(order, now) === 'en-preparacion' && order.preparation?.takenBy?.id !== mineId
            const own = order.preparation?.takenBy?.id === mineId && takeState(order, now) === 'en-preparacion'
            const canTake = queue === 'armar' && !heldByOther && order.status === 'pendiente'
            const invoices = invoiceNumbers(order)
            return (
              <li key={order.id} className="rounded-md border border-border bg-surface">
                <button type="button" className="flex w-full min-h-11 flex-col gap-2 px-4 py-3 text-left" onClick={() => openOrder(order)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{order.id}</strong>
                    <PriorityChip order={order} />
                    {isOverdue(order, today) ? <Badge tone="warning">Atrasado</Badge> : null}
                    <PrepChip order={order} now={now || undefined} />
                  </span>
                  <span className="font-semibold">{order.client}</span>
                  <span className={invoices.length > 0 ? 'text-sm text-text' : 'text-sm text-muted'}>
                    {invoices.length > 0 ? `FC / NP ${invoices.join(', ')}` : 'Sin FC / nota de pedido'}
                  </span>
                  <span className="text-sm text-muted">
                    {[order.zone, normalizeTimeWindow(order.timeWindow) || order.timeWindow, order.deliveryDate ? formatIsoDate(order.deliveryDate) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="text-sm text-muted">
                    {order.dispatchType ? DISPATCH_LABEL[order.dispatchType] : 'Sin despacho'}
                    {order.seller ? ` · ${order.seller}` : ''}
                  </span>
                  {own ? (
                    <span className="text-sm tabular-nums text-text">{now ? formatPrepMs(prepDuration(order, now)) : '—'}</span>
                  ) : null}
                  {queue === 'hoy' ? (
                    <span className="text-sm tabular-nums text-text">
                      {order.prepMs == null ? '—' : formatPrepMs(order.prepMs)}
                    </span>
                  ) : null}
                </button>
                {canTake ? (
                  <div className="px-4 pb-3">
                    <Button variant="secondary" size="lg" disabled={busy === order.id} onClick={() => void take(order)}>
                      Tomar
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <Drawer
        open={Boolean(open)}
        onClose={closeDrawer}
        title={open?.id ?? 'Pedido'}
        subtitle={open?.client}
        mobileFull
        footer={
          open && open.status === 'pendiente' ? (
            <div className="flex w-full flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={busy === open.id || openHeldByOther}
                onClick={() => void markArmed(open)}
              >
                {openHeldByOther ? `Lo está armando ${takenByName(open)}` : 'Marcar armado'}
              </Button>
              {!openMine && !openHeldByOther ? (
                <Button variant="secondary" size="lg" fullWidth disabled={busy === open.id} onClick={() => void take(open)}>
                  Tomar
                </Button>
              ) : null}
              {openMine ? (
                <Button variant="secondary" size="lg" fullWidth disabled={busy === open.id} onClick={() => void release(open)}>
                  Liberar
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {open ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold tabular-nums">{armingText(open, now, mineId)}</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Zona</dt>
                <dd>{open.zone || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Franja</dt>
                <dd>{normalizeTimeWindow(open.timeWindow) || open.timeWindow || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Entrega</dt>
                <dd>{open.deliveryDate ? formatIsoDate(open.deliveryDate) : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Vendedor</dt>
                <dd>{open.seller || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">FC / Nota de pedido</dt>
                <dd className={invoiceNumbers(open).length > 0 ? undefined : 'text-muted'}>
                  {invoiceNumbers(open).length > 0
                    ? invoiceNumbers(open).join(', ')
                    : 'Sin FC / nota de pedido'}
                </dd>
                <div className="mt-2">
                  <InvoiceFile order={open} />
                </div>
              </div>
            </dl>
            {open.notes ? <p className="text-sm text-text">{open.notes}</p> : null}
            <PrepChecklist
              order={open}
              userId={user?.id}
              role={user?.role}
              countLocked={user?.role === 'deposito' && open.status === 'pendiente' && !openMine}
              emptyExtra={<InvoiceFile order={open} />}
            />
            {open.status === 'pendiente' ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Bultos</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="size-11 shrink-0"
                    aria-label="Menos un bulto"
                    disabled={user?.role === 'deposito' && !openMine}
                    onClick={() => changePackages(Number(packages) - 1)}
                  >
                    −
                  </Button>
                  <Input
                    aria-label="Bultos"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={packages}
                    disabled={user?.role === 'deposito' && !openMine}
                    onChange={(event) => setPackages(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="lg"
                    className="size-11 shrink-0"
                    aria-label="Más un bulto"
                    disabled={user?.role === 'deposito' && !openMine}
                    onClick={() => changePackages(Number(packages) + 1)}
                  >
                    +
                  </Button>
                </div>
                {detailError ? <p className="text-sm text-danger">{detailError}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </Page>
  )
}
