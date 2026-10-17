import type { Order } from '../data/orders'

/** Parada de una hoja cerrada: el viaje, no el estado actual del pedido. */
export function missedClosedStop(order: Order, sheetId: string) {
  if (order.status !== 'entregado') return true
  const reason = `Volvió de la hoja ${sheetId} sin entregar`
  return (order.history ?? []).some((entry) => entry.reason === reason)
}
