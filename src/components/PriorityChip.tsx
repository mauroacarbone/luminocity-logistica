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
    return (
      <Badge tone="neutral" size="lg">
        Normal
      </Badge>
    )
  }
  if (priority === 'alta') {
    return (
      <Badge tone="warning" size="lg">
        Alta
      </Badge>
    )
  }
  return (
    <Badge tone="danger" size="lg">
      Inmediata
    </Badge>
  )
}
