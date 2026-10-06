import type { Order } from '../data/orders'
import { forwardPath, statusPillFor, STATUS_RANK } from '../lib/orderFlow'

type Variant = 'compact' | 'full'

export function OrderStepper({
  order,
  variant = 'full',
  canceled = false,
}: {
  order: Pick<Order, 'status' | 'dispatchType'>
  variant?: Variant
  canceled?: boolean
}) {
  const steps = forwardPath(order)
  const currentRank = STATUS_RANK[order.status] ?? 0
  const currentLabel = canceled ? 'Cancelado' : statusPillFor(order, order.status)

  if (variant === 'compact') {
    return (
      <div className="order-stepper order-stepper-compact" aria-label={`Estado: ${currentLabel}`}>
        <ol className="order-stepper-track">
          {steps.map((status) => {
            const rank = STATUS_RANK[status]
            const state = stepState(rank, currentRank, canceled)
            return (
              <li key={status} className={`order-step order-step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
              </li>
            )
          })}
        </ol>
        <span className={`order-stepper-now${canceled ? ' is-canceled' : ''}`}>{currentLabel}</span>
      </div>
    )
  }

  return (
    <div className="order-stepper order-stepper-full" aria-label={`Estado: ${currentLabel}`}>
      <ol className="order-stepper-track">
        {steps.map((status, index) => {
          const rank = STATUS_RANK[status]
          const state = stepState(rank, currentRank, canceled)
          const label = statusPillFor(order, status)
          const showCanceled = canceled && state === 'current'
          return (
            <li
              key={status}
              className={`order-step order-step-${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {index > 0 && <span className="order-step-line" aria-hidden="true" />}
              <span className="order-step-dot">{state === 'done' ? '✓' : ''}</span>
              <span className="order-step-label">{label}</span>
              {showCanceled && <span className="order-step-canceled">Cancelado</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function stepState(rank: number, currentRank: number, canceled: boolean): 'done' | 'current' | 'todo' {
  if (rank < currentRank) return 'done'
  if (rank === currentRank) return 'current'
  if (canceled && rank > currentRank) return 'todo'
  return 'todo'
}
