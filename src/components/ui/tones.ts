import type { OrderStatus } from '../../data/orders'
import type { BadgeTone } from './Badge'

/** Tono visual del Badge según el estado del pedido. */
export function statusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case 'pendiente':
      return 'warning'
    case 'preparado':
      return 'orange'
    case 'asignado':
      return 'purple'
    case 'en-viaje':
      return 'info'
    case 'entregado':
      return 'success'
  }
}
