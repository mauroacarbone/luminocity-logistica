import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Order } from '../data/orders'

type OrdersContextValue = {
  orders: Order[]
  addOrder: (order: Order) => void
  updateOrder: (order: Order) => void
  removeOrder: (id: string) => void
}

const OrdersContext = createContext<OrdersContextValue | null>(null)

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([])

  function addOrder(order: Order) {
    setOrders((current) => [order, ...current])
  }

  function updateOrder(order: Order) {
    setOrders((current) =>
      current.map((item) => (item.id === order.id ? order : item)),
    )
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
