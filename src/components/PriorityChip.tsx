import type { Order } from '../data/orders'
import { priorityOf } from '../lib/priority'
import { Badge } from './ui'

export function PriorityChip({
  order,
  showNormal = false,
}: {
  order: Pick<Order, 'priority'>
  showNormal?: boolean
}) {
  const priority = priorityOf(order)
  if (priority === 'normal') {
    if (!showNormal) return null
    return <Badge tone="neutral">Normal</Badge>
  }
  if (priority === 'alta') {
    return <Badge tone="orange">Alta</Badge>
  }
  return <Badge tone="danger">Inmediata</Badge>
}
