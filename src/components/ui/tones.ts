import type { OrderStatus } from '../../data/orders'
import type { BadgeTone } from './Badge'

/** Tono visual del Badge según el estado del pedido. */
export function statusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case 'pendiente':
      return 'warning'
    case 'preparado':
      return 'neutral'
    case 'asignado':
    case 'en-viaje':
      return 'info'
    case 'entregado':
      return 'success'
  }
}

/** En horario, por vencer y atrasado usan éxito, pendiente y error. */
export function timelinessTone(value: 'en-horario' | 'por-vencer' | 'atrasado'): BadgeTone {
  if (value === 'atrasado') return 'danger'
  if (value === 'por-vencer') return 'warning'
  return 'success'
}
