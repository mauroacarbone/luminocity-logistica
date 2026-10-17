import { useEffect, useState } from 'react'
import type { Order } from '../data/orders'
import { takeState, takenByName } from '../lib/preparation'
import { Badge } from './ui'

function useClock(enabled: boolean) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const start = window.setTimeout(() => setNow(Date.now()), 0)
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [enabled])
  return now
}

export function PrepChip({ order, now }: { order: Order; now?: number }) {
  const clock = useClock(now == null)
  const at = now ?? (clock || undefined)
  if (takeState(order, at) === 'en-preparacion') {
    const name = takenByName(order)
    return <Badge tone="info">{name ? `En preparación · ${name}` : 'En preparación'}</Badge>
  }
  if (order.status === 'preparado' && order.prepIncomplete && order.prepChecklist) {
    const { done, total } = order.prepChecklist
    return <Badge tone="warning">{`Armado incompleto · ${done}/${total}`}</Badge>
  }
  return null
}
