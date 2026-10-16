import type { KeyboardEvent } from 'react'

export function onSegmentKey<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (next: T) => void,
) {
  if (values.length === 0) return
  const index = Math.max(0, values.indexOf(current))
  let next: T | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = values[(index + 1) % values.length]
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = values[(index - 1 + values.length) % values.length]
  } else if (event.key === 'Home') next = values[0]
  else if (event.key === 'End') next = values[values.length - 1]
  if (next == null) return
  event.preventDefault()
  onChange(next)
  event.currentTarget.querySelector<HTMLButtonElement>(`[data-option="${CSS.escape(next)}"]`)?.focus()
}
