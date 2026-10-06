import type { Order } from '../data/orders'
import { forwardPath, statusPillFor, STATUS_RANK } from '../lib/orderFlow'

type Variant = 'compact' | 'full'

export function OrderStepper({
  order,
  variant = 'full',
}: {
  order: Pick<Order, 'status' | 'dispatchType'>
  variant?: Variant
}) {
  const steps = forwardPath(order)
  const currentRank = STATUS_RANK[order.status] ?? 0
  const currentLabel = statusPillFor(order, order.status)

  if (variant === 'compact') {
    return (
      <div className="order-stepper order-stepper-compact" aria-label={`Estado: ${currentLabel}`}>
        <ol className="order-stepper-track">
          {steps.map((status) => {
            const rank = STATUS_RANK[status]
            const state = stepState(rank, currentRank)
            return (
              <li key={status} className={`order-step order-step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
              </li>
            )
          })}
        </ol>
        <span className="order-stepper-now">{currentLabel}</span>
      </div>
    )
  }

  return (
    <div className="order-stepper order-stepper-full" aria-label={`Estado: ${currentLabel}`}>
      <ol className="order-stepper-track">
        {steps.map((status, index) => {
          const rank = STATUS_RANK[status]
          const state = stepState(rank, currentRank)
          const label = statusPillFor(order, status)
          return (
            <li
              key={status}
              className={`order-step order-step-${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {index > 0 && <span className="order-step-line" aria-hidden="true" />}
              <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
              <span className="order-step-label">{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function stepState(rank: number, currentRank: number): 'done' | 'current' | 'todo' {
  if (rank < currentRank) return 'done'
  if (rank === currentRank) return 'current'
  return 'todo'
}
