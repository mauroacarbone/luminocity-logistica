import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isDispatchType } from '../data/catalog'
import { isOrderEdit, isSlotOverride, type Order, type OrderStatus } from '../data/orders'
import { isOrderPriority } from '../lib/priority'
import { loadList, saveList } from '../lib/localStore'
import { slotNotice } from '../lib/slot'
import {
  createOrder,
  deleteOrder,
  listOrders,
  orderBody,
  patchOrder,
  reviewOrderEdit,
  transitionOrder as transitionOrderRequest,
  withoutNewAttachment,
  type ApiResult,
  type OrderDraft,
  type SlotFull,
} from '../lib/ordersApi'
import { useAuth } from './AuthContext'

const ORDERS_KEY = 'luminocity.orders.v1'

const STATUSES = new Set<OrderStatus>([
  'pendiente',
  'preparado',
  'asignado',
  'en-viaje',
  'entregado',
])

const OPTIONAL_STRINGS = [
  'zone',
  'address',
  'seller',
  'phone',
  'amount',
  'betweenStreet1',
  'betweenStreet2',
  'propertyType',
  'floor',
  'unit',
  'doorbell',
  'timeWindow',
  'transporter',
  'notes',
  'attachmentName',
  'attachmentDataUrl',
  'receiverName',
  'receiverDni',
  'driverId',
  'trackingNumber',
  'assignedAt',
  'departedAt',
  'deliveredAt',
  'routeId',
  'createdBy',
  'createdAt',
  'updatedAt',
] as const

export type OrderSaveResult =
  | { status: 'saved'; order: Order }
  | { status: 'saved-without-attachment'; order: Order }
  | { status: 'not-saved'; message: string; code?: string; slot?: SlotFull }

export type OrderDeleteResult = { status: 'deleted' } | { status: 'not-saved'; message: string }

type OrdersContextValue = {
  orders: Order[]
  loading: boolean
  error: string
  legacyCount: number
  importing: boolean
  importError: string
  importLegacy: () => Promise<void>
  reload: () => void
  refresh: (options?: { silent?: boolean }) => Promise<void>
  addOrder: (order: OrderDraft) => Promise<OrderSaveResult>
  updateOrder: (order: Order, reason?: string, override?: boolean) => Promise<OrderSaveResult>
  patchFields: (id: string, fields: Record<string, unknown>) => Promise<OrderSaveResult>
  transitionOrder: (id: string, fields: Record<string, unknown>) => Promise<OrderSaveResult>
  reviewEdit: (
    orderId: string,
    editId: string,
    status: 'aplicada' | 'rechazada',
    override?: boolean,
  ) => Promise<OrderSaveResult>
  removeOrder: (id: string) => Promise<OrderDeleteResult>
}

const OrdersContext = createContext<OrdersContextValue | null>(null)

function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function isOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false
  const order = value as Record<string, unknown>
  if (typeof order.id !== 'string' || order.id.length === 0) return false
  if (typeof order.client !== 'string') return false
  if (typeof order.loadedAt !== 'string') return false
  if (typeof order.deliveryDate !== 'string') return false
  if (typeof order.status !== 'string' || !STATUSES.has(order.status as OrderStatus)) return false
  if (
    order.invoices !== undefined &&
    (!Array.isArray(order.invoices) || order.invoices.some((item) => typeof item !== 'string'))
  ) {
    return false
  }
  if (order.collectOnDelivery !== undefined && typeof order.collectOnDelivery !== 'boolean') return false
  if (order.requiresPickup !== undefined && typeof order.requiresPickup !== 'boolean') return false
  if (order.dispatchType !== undefined && !isDispatchType(order.dispatchType)) return false
  if (order.priority !== undefined && !isOrderPriority(order.priority)) return false
  if (order.edits !== undefined && (!Array.isArray(order.edits) || !order.edits.every(isOrderEdit))) {
    return false
  }
  if (
    order.slotOverrides !== undefined &&
    (!Array.isArray(order.slotOverrides) || !order.slotOverrides.every(isSlotOverride))
  ) {
    return false
  }
  if (
    order.packages !== undefined &&
    (typeof order.packages !== 'number' || !Number.isInteger(order.packages) || order.packages < 1)
  ) {
    return false
  }
  if (
    order.routeSeq !== undefined &&
    (typeof order.routeSeq !== 'number' || !Number.isInteger(order.routeSeq) || order.routeSeq < 1)
  ) {
    return false
  }
  return OPTIONAL_STRINGS.every((key) => optionalString(order[key]))
}

function asOrder(value: unknown) {
  return isOrder(value) ? value : null
}

function asOrderList(value: unknown) {
  if (!Array.isArray(value) || !value.every(isOrder)) return null
  return value
}

function draftOf(order: Order): OrderDraft {
  return {
    client: order.client,
    zone: order.zone,
    address: order.address,
    loadedAt: order.loadedAt,
    deliveryDate: order.deliveryDate,
    status: order.status,
    packages: order.packages,
    seller: order.seller,
    phone: order.phone,
    invoices: order.invoices,
    collectOnDelivery: order.collectOnDelivery,
    amount: order.amount,
    betweenStreet1: order.betweenStreet1,
    betweenStreet2: order.betweenStreet2,
    propertyType: order.propertyType,
    floor: order.floor,
    unit: order.unit,
    doorbell: order.doorbell,
    timeWindow: order.timeWindow,
    requiresPickup: order.requiresPickup,
    dispatchType: order.dispatchType,
    priority: order.priority,
    transporter: order.transporter,
    notes: order.notes,
    attachmentName: order.attachmentName,
    attachmentDataUrl: order.attachmentDataUrl,
    receiverName: order.receiverName,
    receiverDni: order.receiverDni,
  }
}

function remember(list: Order[]) {
  if (list.length === 0) {
    try {
      localStorage.removeItem(ORDERS_KEY)
    } catch {
      // Si no se puede borrar, el botón no vuelve a aparecer porque la API ya tiene pedidos.
    }
    return
  }
  saveList(ORDERS_KEY, list)
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [legacyOrders, setLegacyOrders] = useState<Order[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const ordersRef = useRef(orders)
  const legacyRef = useRef(legacyOrders)
  const importingRef = useRef(false)
  const refreshInFlight = useRef(false)
  const generation = useRef(0)
  const userId = user?.id ?? null
  const [trackedUserId, setTrackedUserId] = useState(userId)

  if (userId !== trackedUserId) {
    setTrackedUserId(userId)
    setOrders([])
    setLegacyOrders([])
    setError('')
    setImportError('')
    setStatus(userId ? 'loading' : 'idle')
  }

  const loading = Boolean(user) && status !== 'ready' && status !== 'error'

  useEffect(() => {
    const id = ++generation.current
    ordersRef.current = []
    legacyRef.current = []
    if (!userId) return

    let cancelled = false
    void listOrders().then((result) => {
      if (cancelled || id !== generation.current) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        setError(result.status === 0 ? 'No se pudo conectar con el servidor' : result.message)
        setStatus('error')
        return
      }
      const list = asOrderList(result.data)
      if (!list) {
        setError('El servidor no devolvió los pedidos.')
        setStatus('error')
        return
      }
      ordersRef.current = list
      setOrders(list)
      const legacy = loadList(ORDERS_KEY, isOrder).items
      legacyRef.current = legacy
      setLegacyOrders(legacy)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [userId, logout, attempt])

  const reload = useCallback(() => {
    setError('')
    setStatus('loading')
    setAttempt((current) => current + 1)
  }, [])

  const refresh = useCallback(
    (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        reload()
        return Promise.resolve()
      }
      if (!userId) return Promise.resolve()
      const id = generation.current
      return listOrders().then((result) => {
        if (id !== generation.current) return
        if (!result.ok) {
          if (result.status === 401) logout()
          return
        }
        const list = asOrderList(result.data)
        if (!list) return
        ordersRef.current = list
        setOrders(list)
      })
    },
    [userId, logout, reload],
  )

  useEffect(() => {
    if (!userId) return
    function tick() {
      if (document.visibilityState !== 'visible') return
      if (importingRef.current || refreshInFlight.current) return
      refreshInFlight.current = true
      void refresh({ silent: true }).finally(() => {
        refreshInFlight.current = false
      })
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') tick()
    }, 30_000)
    function onVisible() {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [userId, refresh])

  function replaceOrders(list: Order[]) {
    ordersRef.current = list
    setOrders(list)
  }

  function replaceLegacy(list: Order[]) {
    legacyRef.current = list
    setLegacyOrders(list)
    remember(list)
  }

  function fail(result: Extract<ApiResult, { ok: false }>): OrderSaveResult {
    if (result.status === 401) logout()
    return {
      status: 'not-saved',
      message: slotNotice(result.code, user?.role, result.message),
      code: result.code,
      slot: result.slot,
    }
  }

  function adopt(saved: Order) {
    const exists = ordersRef.current.some((item) => item.id === saved.id)
    replaceOrders(
      exists
        ? ordersRef.current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...ordersRef.current],
    )
  }

  async function write(
    mode: 'create' | 'patch',
    order: OrderDraft,
    id?: string,
    reason?: string,
    override = false,
  ): Promise<OrderSaveResult> {
    const previous = id ? ordersRef.current.find((item) => item.id === id) : undefined
    const body = orderBody(order, mode, previous)
    if (reason) body.reason = reason
    if (override) body.override = true
    let dropped = false
    let result = mode === 'create' ? await createOrder(body) : await patchOrder(id ?? '', body)
    if (!result.ok && result.status === 413 && typeof body.attachmentDataUrl === 'string') {
      const retry = withoutNewAttachment(body, mode, previous)
      if (retry.attachmentDataUrl !== body.attachmentDataUrl) {
        result = mode === 'create' ? await createOrder(retry) : await patchOrder(id ?? '', retry)
        dropped = result.ok
      }
    }
    if (!result.ok) return fail(result)
    const saved = asOrder(result.data)
    if (!saved) return { status: 'not-saved', message: 'El servidor no devolvió un pedido válido.' }
    if (mode === 'create') {
      replaceOrders([saved, ...ordersRef.current.filter((item) => item.id !== saved.id)])
    } else {
      adopt(saved)
    }
    if (dropped) return { status: 'saved-without-attachment', order: saved }
    return { status: 'saved', order: saved }
  }

  function addOrder(order: OrderDraft) {
    return write('create', order)
  }

  function updateOrder(order: Order, reason?: string, override = false) {
    return write('patch', draftOf(order), order.id, reason, override)
  }

  async function patchFields(id: string, fields: Record<string, unknown>): Promise<OrderSaveResult> {
    const result = await patchOrder(id, fields)
    if (!result.ok) return fail(result)
    const saved = asOrder(result.data)
    if (!saved) return { status: 'not-saved', message: 'El servidor no devolvió un pedido válido.' }
    adopt(saved)
    return { status: 'saved', order: saved }
  }

  async function transitionOrder(id: string, fields: Record<string, unknown>): Promise<OrderSaveResult> {
    const result = await transitionOrderRequest(id, fields)
    if (!result.ok) return fail(result)
    const saved = asOrder(result.data)
    if (!saved) return { status: 'not-saved', message: 'El servidor no devolvió un pedido válido.' }
    adopt(saved)
    return { status: 'saved', order: saved }
  }

  async function reviewEdit(
    orderId: string,
    editId: string,
    status: 'aplicada' | 'rechazada',
    override = false,
  ): Promise<OrderSaveResult> {
    const result = await reviewOrderEdit(orderId, editId, status, override)
    if (!result.ok) return fail(result)
    const saved = asOrder(result.data)
    if (!saved) return { status: 'not-saved', message: 'El servidor no devolvió un pedido válido.' }
    adopt(saved)
    return { status: 'saved', order: saved }
  }

  async function removeOrder(id: string): Promise<OrderDeleteResult> {
    const result = await deleteOrder(id)
    if (!result.ok) {
      if (result.status === 401) logout()
      if (result.status === 404) {
        replaceOrders(ordersRef.current.filter((item) => item.id !== id))
      }
      return { status: 'not-saved', message: result.message }
    }
    replaceOrders(ordersRef.current.filter((item) => item.id !== id))
    return { status: 'deleted' }
  }

  async function importLegacy() {
    if (importingRef.current || legacyRef.current.length === 0) return
    importingRef.current = true
    setImporting(true)
    setImportError('')
    const source = legacyRef.current
    const failed: Order[] = []
    const lines: string[] = []
    let imported = 0
    for (let index = source.length - 1; index >= 0; index -= 1) {
      const legacy = source[index]
      const result = await write('create', draftOf(legacy))
      if (result.status === 'not-saved') {
        failed.push(legacy)
        lines.push(`${legacy.id}: ${result.message}`)
      } else {
        imported += 1
      }
    }
    failed.reverse()
    lines.reverse()
    replaceLegacy(failed)
    const summary = [`Se importaron ${imported} de ${source.length}.`, ...lines]
    setImportError(summary.join('\n'))
    importingRef.current = false
    setImporting(false)
  }

  return (
    <OrdersContext.Provider
      value={{
        orders,
        loading,
        error,
        legacyCount: legacyOrders.length,
        importing,
        importError,
        importLegacy,
        reload,
        refresh,
        addOrder,
        updateOrder,
        patchFields,
        transitionOrder,
        reviewEdit,
        removeOrder,
      }}
    >
      {children}
    </OrdersContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrders() {
  const value = useContext(OrdersContext)
  if (!value) {
    throw new Error('useOrders debe usarse dentro de OrdersProvider')
  }
  return value
}
