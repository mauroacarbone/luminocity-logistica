import { onSegmentKey } from '../lib/radioKeys'
import { Badge } from './ui/Badge'

type Choice<T extends string> = {
  value: T
  label: string
  count: number
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Choice<T>[]
  onChange: (next: T) => void
}) {
  return (
    <div
      className="no-print flex w-full gap-2"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) =>
        onSegmentKey(
          event,
          options.map((option) => option.value),
          value,
          onChange,
        )
      }
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-option={option.value}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? 'border-accent bg-accent-soft font-semibold text-text'
                : 'border-border bg-transparent text-text hover:bg-surface-2'
            }`}
          >
            {option.label}
            <Badge tone={active ? 'primary' : 'neutral'}>{option.count}</Badge>
          </button>
        )
      })}
    </div>
  )
}
