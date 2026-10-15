import { useState, type ReactNode } from 'react'
import { businessToday } from '../../lib/schedule'
import { Button } from './Button'
import { cx } from './cx'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'

type Shortcut = 'hoy' | 'semana' | 'mes' | 'todos'

export type FilterSearch = {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  label: string
  srOnly?: boolean
}

export type FilterSelect = {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}

export type FilterChipGroup = {
  id: string
  label: string
  options: { value: string; label: string; count?: number }[]
  value?: string
  values?: string[]
  multiple?: boolean
  onChange: (value: string) => void
}

export type FilterDateRange = {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  shortcuts?: Shortcut[]
}

type FilterBarProps = {
  search?: FilterSearch
  selects?: FilterSelect[]
  chips?: FilterChipGroup[]
  dateRange?: FilterDateRange
  onClear?: () => void
  activeCount?: number
  className?: string
}

const SHORTCUT_LABEL: Record<Shortcut, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  todos: 'Todos',
}

function iso(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function rangeFor(shortcut: Shortcut) {
  const today = businessToday()
  if (shortcut === 'hoy') return { from: today, to: today }
  if (shortcut === 'todos') return { from: '', to: '' }
  const [year, month, day] = today.split('-').map(Number)
  if (shortcut === 'mes') {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, '0')}` }
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() + mondayOffset)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { from: iso(start), to: iso(end) }
}

function chipPressed(group: FilterChipGroup, value: string) {
  if (group.multiple) return Boolean(group.values?.includes(value))
  return group.value === value
}

function ChipButtons({ groups }: { groups: FilterChipGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-wrap items-center gap-2" role="group" aria-label={group.label}>
          <span className="text-sm font-medium text-muted">{group.label}</span>
          {group.options.map((option) => {
            const pressed = chipPressed(group, option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={pressed}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm font-medium',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pressed
                    ? 'border-transparent bg-accent text-accent-fg'
                    : 'border-border bg-surface text-text hover:bg-surface-2',
                )}
                onClick={() => group.onChange(option.value)}
              >
                {option.label}
                {option.count != null ? ` (${option.count})` : ''}
              </button>
            )
          })}
        </div>
      ))}
    </>
  )
}

function SelectFields({ selects }: { selects: FilterSelect[] }) {
  return (
    <>
      {selects.map((item) => (
        <label key={item.id} className="flex min-w-40 flex-col gap-1 text-sm font-medium text-text">
          {item.label}
          <Select
            value={item.value}
            disabled={item.disabled}
            aria-label={item.label}
            onChange={(event) => item.onChange(event.target.value)}
          >
            {item.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </>
  )
}

function Dates({ dateRange }: { dateRange: FilterDateRange }) {
  const shortcuts = dateRange.shortcuts ?? []
  return (
    <div className="flex flex-wrap items-end gap-3">
      {shortcuts.map((shortcut) => {
        const range = rangeFor(shortcut)
        const pressed = dateRange.from === range.from && dateRange.to === range.to
        return (
          <button
            key={shortcut}
            type="button"
            aria-pressed={pressed}
            className={cx(
              'rounded-full border px-3 py-1.5 text-sm font-medium',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pressed
                ? 'border-transparent bg-accent text-accent-fg'
                : 'border-border bg-surface text-text hover:bg-surface-2',
            )}
            onClick={() => dateRange.onChange(range)}
          >
            {SHORTCUT_LABEL[shortcut]}
          </button>
        )
      })}
      <label className="flex flex-col gap-1 text-sm font-medium text-text">
        Desde
        <Input
          type="date"
          value={dateRange.from}
          onChange={(event) => dateRange.onChange({ from: event.target.value, to: dateRange.to })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-text">
        Hasta
        <Input
          type="date"
          value={dateRange.to}
          onChange={(event) => dateRange.onChange({ from: dateRange.from, to: event.target.value })}
        />
      </label>
    </div>
  )
}

function SearchField({ search }: { search: FilterSearch }) {
  return (
    <div className="flex min-w-0 flex-1 items-end gap-2">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-text">
        <span className={search.srOnly ? 'sr-only' : undefined}>{search.label}</span>
        <Input
          type="search"
          value={search.value}
          placeholder={search.placeholder}
          onChange={(event) => search.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !search.onSubmit) return
            event.preventDefault()
            search.onSubmit(event.currentTarget.value)
          }}
        />
      </label>
      {search.onSubmit ? (
        <Button variant="secondary" onClick={() => search.onSubmit?.(search.value)}>
          Buscar
        </Button>
      ) : null}
    </div>
  )
}

function ExtraFilters({
  selects,
  chips,
  dateRange,
}: {
  selects?: FilterSelect[]
  chips?: FilterChipGroup[]
  dateRange?: FilterDateRange
}) {
  return (
    <>
      {selects && selects.length > 0 ? <SelectFields selects={selects} /> : null}
      {chips && chips.length > 0 ? <ChipButtons groups={chips} /> : null}
      {dateRange ? <Dates dateRange={dateRange} /> : null}
    </>
  )
}

export function FilterBar({
  search,
  selects,
  chips,
  dateRange,
  onClear,
  activeCount = 0,
  className,
}: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const hasExtra = Boolean((selects && selects.length > 0) || (chips && chips.length > 0) || dateRange)
  const clearButton =
    onClear && activeCount > 0 ? (
      <Button variant="ghost" onClick={onClear}>
        Limpiar filtros
      </Button>
    ) : null

  let sheet: ReactNode = null
  if (open) {
    sheet = (
      <Modal label="Filtros" onClose={() => setOpen(false)} className="flex items-end bg-overlay">
        <div className="max-h-[85vh] w-full overflow-auto rounded-t-[10px] border border-border bg-surface p-4">
          <div className="flex flex-col gap-4">
            <ExtraFilters selects={selects} chips={chips} dateRange={dateRange} />
            <Button variant="primary" size="lg" fullWidth onClick={() => setOpen(false)}>
              Ver resultados
            </Button>
            {onClear ? (
              <Button variant="ghost" size="lg" fullWidth onClick={onClear}>
                Limpiar
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3 rounded-[10px] border border-border bg-surface p-3">
        {search ? <SearchField search={search} /> : null}
        {hasExtra ? (
          <Button variant="secondary" className="sm:hidden" onClick={() => setOpen(true)}>
            Filtros ({activeCount})
          </Button>
        ) : null}
        <div className="hidden min-w-0 flex-wrap items-end gap-3 sm:flex">
          <ExtraFilters selects={selects} chips={chips} dateRange={dateRange} />
          {clearButton}
        </div>
      </div>
      {sheet}
    </div>
  )
}
