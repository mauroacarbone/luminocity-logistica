import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
  'receiverName',
  'receiverDni',
] as const

type OrdersContextValue = {
  orders: Order[]
  addOrder: (order: Order) => void
  updateOrder: (order: Order) => void
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
  return OPTIONAL_STRINGS.every((key) => optionalString(order[key]))
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => loadList(ORDERS_KEY, isOrder))

  useEffect(() => {
    saveList(ORDERS_KEY, orders)
  }, [orders])

  function addOrder(order: Order) {
    setOrders((current) => [order, ...current])
  }

  function updateOrder(order: Order) {
    setOrders((current) => current.map((item) => (item.id === order.id ? order : item)))
  }

  function removeOrder(id: string) {
    setOrders((current) => current.filter((item) => item.id !== id))
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
