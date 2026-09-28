import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import type { Order, OrderStatus } from '../data/orders'
import { loadList, saveList } from '../lib/localStore'

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
  'timeWindow',
  'transporter',
  'notes',
  'attachmentName',
  'attachmentDataUrl',
  'receiverName',
  'receiverDni',
] as const

export type OrderSaveResult =
  | { status: 'saved' }
  | { status: 'saved-without-attachment'; order: Order }
  | { status: 'not-saved' }

type OrdersContextValue = {
  orders: Order[]
  addOrder: (order: Order) => OrderSaveResult
  updateOrder: (order: Order) => OrderSaveResult
  removeOrder: (id: string) => void
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
  if (
    order.packages !== undefined &&
    (typeof order.packages !== 'number' || !Number.isInteger(order.packages) || order.packages < 1)
  ) {
    return false
  }
  return OPTIONAL_STRINGS.every((key) => optionalString(order[key]))
}

function omitAttachment(order: Order): Order {
  const next: Order = { ...order }
  delete next.attachmentName
  delete next.attachmentDataUrl
  return next
}

function withoutNewAttachment(next: Order[], focusId: string, previous?: Order) {
  return next.map((item) => {
    if (item.id !== focusId) return item
    if (previous?.attachmentDataUrl && previous.attachmentDataUrl !== item.attachmentDataUrl) {
      return {
        ...item,
        attachmentName: previous.attachmentName,
        attachmentDataUrl: previous.attachmentDataUrl,
      }
    }
    const cleared = omitAttachment(item)
    if (previous?.attachmentName && !previous.attachmentDataUrl) {
      return { ...cleared, attachmentName: previous.attachmentName }
    }
    return cleared
  })
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => loadList(ORDERS_KEY, isOrder).items)
  const ordersRef = useRef(orders)

  function commit(next: Order[], focusId?: string): OrderSaveResult {
    const apply = (list: Order[], result: OrderSaveResult) => {
      ordersRef.current = list
      setOrders(list)
      return result
    }

    const written = saveList(ORDERS_KEY, next)
    if (written === 'ok') return apply(next, { status: 'saved' })

    const focus = focusId ? next.find((item) => item.id === focusId) : undefined
    if (written === 'quota' && focus?.attachmentDataUrl) {
      const previous = ordersRef.current.find((item) => item.id === focus.id)
      const restored = withoutNewAttachment(next, focus.id, previous)
      if (saveList(ORDERS_KEY, restored) === 'ok') {
        const order = restored.find((item) => item.id === focus.id) ?? omitAttachment(focus)
        return apply(restored, { status: 'saved-without-attachment', order })
      }
      const restoredFocus = restored.find((item) => item.id === focus.id)
      if (restoredFocus?.attachmentDataUrl) {
        const omitted = next.map((item) => (item.id === focus.id ? omitAttachment(item) : item))
        if (saveList(ORDERS_KEY, omitted) === 'ok') {
          const order = omitted.find((item) => item.id === focus.id) ?? omitAttachment(focus)
          return apply(omitted, { status: 'saved-without-attachment', order })
        }
      }
      return apply(next, { status: 'not-saved' })
    }

    return apply(next, { status: 'not-saved' })
  }

  function addOrder(order: Order) {
    return commit([order, ...ordersRef.current], order.id)
  }

  function updateOrder(order: Order) {
    return commit(
      ordersRef.current.map((item) => (item.id === order.id ? order : item)),
      order.id,
    )
  }

  function removeOrder(id: string) {
    commit(ordersRef.current.filter((item) => item.id !== id))
  }

  return (
    <OrdersContext.Provider value={{ orders, addOrder, updateOrder, removeOrder }}>
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
