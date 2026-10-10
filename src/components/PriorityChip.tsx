import type { Order } from '../data/orders'
import { priorityOf } from '../lib/priority'

export function PriorityChip({ order }: { order: Pick<Order, 'priority'> }) {
  const priority = priorityOf(order)
  if (priority === 'normal') return null
  if (priority === 'alta') {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
        Alta
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
      Inmediata
    </span>
  )
}
