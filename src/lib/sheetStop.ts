import type { Order } from '../data/orders'

const RETURNED = (sheetId: string) => `Volvió de la hoja ${sheetId} sin entregar`
const FINISH_PREFIX = 'Viaje finalizado sin entregar: '

/** Parada de una hoja cerrada: el viaje, no el estado actual del pedido. */
export function missedClosedStop(order: Order, sheetId: string) {
  if (order.status !== 'entregado') return true
  return (order.history ?? []).some((entry) => entry.reason === RETURNED(sheetId))
}

export function undeliveredReason(order: Order, sheetId: string) {
  const history = order.history ?? []
  const back = history.find((entry) => entry.reason === RETURNED(sheetId))
  if (!back) return ''
  const match = history.find(
    (entry) => entry.at === back.at && typeof entry.reason === 'string' && entry.reason.startsWith(FINISH_PREFIX),
  )
  return match?.reason?.slice(FINISH_PREFIX.length).trim() ?? ''
}
