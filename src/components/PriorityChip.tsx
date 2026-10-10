import type { Order } from '../data/orders'
import { priorityOf } from '../lib/priority'
import { Badge } from './ui'

export function PriorityChip({ order }: { order: Pick<Order, 'priority'> }) {
  const priority = priorityOf(order)
  if (priority === 'normal') return null
  if (priority === 'alta') {
    return <Badge tone="orange">Alta</Badge>
  }
  return <Badge tone="danger">Inmediata</Badge>
}
