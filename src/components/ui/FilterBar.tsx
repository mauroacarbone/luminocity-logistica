import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavIcon } from '../../layout/NavIcon'
import { usePopoverPosition } from '../../layout/usePopoverPosition'
import { businessToday } from '../../lib/schedule'
import { onSegmentKey } from '../../lib/radioKeys'
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
  variant?: 'counters' | 'segmented'
  onChange: (value: string) => void
}

export type FilterDateRange = {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  shortcuts?: Shortcut[]
  disabled?: boolean
}

type FilterSize = 'md' | 'lg'

type FilterBarProps = {
  search?: FilterSearch
  selects?: FilterSelect[]
  chips?: FilterChipGroup[]
  dateRange?: FilterDateRange
  onClear?: () => void
  activeCount?: number
  size?: FilterSize
  stacked?: boolean
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

function onChipKey(event: ReactKeyboardEvent<HTMLDivElement>, group: FilterChipGroup) {
  const values = group.options.map((option) => option.value)
  const current = group.value && values.includes(group.value) ? group.value : values[0]
  if (!current) return
  onSegmentKey(event, values, current, group.onChange)
}

function SegmentedChips({ group }: { group: FilterChipGroup }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={`${group.id}-label`} className="text-sm font-medium text-text">
        {group.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${group.id}-label`}
        className="flex flex-wrap gap-2"
        onKeyDown={(event) => onChipKey(event, group)}
      >
        {group.options.map((option) => {
          const active = chipPressed(group, option.value)
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-option={option.value}
              className={cx(
                'inline-flex h-9 items-center rounded-md px-3 text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border border-accent bg-accent-soft font-semibold text-text'
                  : 'border border-border bg-transparent text-text',
              )}
              onClick={() => group.onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChipButtons({ groups, size }: { groups: FilterChipGroup[]; size: FilterSize }) {
  return (
    <>
      {groups.map((group) =>
        group.variant === 'segmented' ? (
          <SegmentedChips key={group.id} group={group} />
        ) : (
        <div key={group.id} className="flex flex-wrap items-center gap-2" role="group" aria-label={group.label}>
          {group.variant === 'counters' ? null : <span className="text-sm font-medium text-muted">{group.label}</span>}
          {group.options.map((option) => {
            const pressed = chipPressed(group, option.value)
            const counter = group.variant === 'counters'
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={pressed}
                className={cx(
                  'inline-flex items-center text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  counter
                    ? cx('h-8 px-2', pressed ? 'font-semibold text-text' : 'text-muted')
                    : cx(
                        'rounded-md border border-border bg-surface-2 px-3 font-medium text-text hover:bg-surface',
                        size === 'lg' ? 'min-h-[44px] py-2' : 'py-1.5',
                        pressed && 'border-accent text-text',
                      ),
                )}
                onClick={() => group.onChange(option.value)}
              >
                {option.label}
                {option.count != null ? (
                  counter ? <span className="ml-1 font-semibold">{option.count}</span> : ` (${option.count})`
                ) : null}
              </button>
            )
          })}
        </div>
        ),
      )}
    </>
  )
}

function FilterSelectMenu({ item }: { item: FilterSelect }) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const { top, left, menuRef } = usePopoverPosition(buttonRef, open, 'start')
  const selected = item.options.find((option) => option.value === item.value)
  const hasValue = Boolean(selected && selected.value !== '' && selected.label !== item.label)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, menuRef])

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setFocus(Math.max(0, item.options.findIndex((option) => option.value === item.value)))
        setOpen(true)
        return
      }
      setFocus((current) => Math.min(item.options.length - 1, current + 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocus((current) => Math.max(0, current - 1))
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = item.options[focus]
      if (option) item.onChange(option.value)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cx(
          'inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm hover:bg-surface-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          hasValue ? 'text-text' : 'text-muted',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={item.disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        {hasValue ? selected?.label : item.label}
        <NavIcon name="chevron-down" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={item.label}
              className="fixed z-[1200] min-w-44 rounded-md border border-border bg-surface py-1 shadow-md"
              style={{ top, left }}
              onKeyDown={onKeyDown}
            >
              {item.options.map((option, index) => {
                const chosen = option.value === item.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    className={cx(
                      'flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-text hover:bg-surface-2',
                      index === focus && 'bg-surface-2',
                    )}
                    onMouseEnter={() => setFocus(index)}
                    onClick={() => {
                      item.onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <span className="w-4">{chosen ? '✓' : ''}</span>
                    {option.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function SelectFields({
  selects,
  native,
  className,
}: {
  selects: FilterSelect[]
  native?: boolean
  className?: string
}) {
  if (!native) {
    return (
      <>
        {selects.map((item) => (
          <FilterSelectMenu key={item.id} item={item} />
        ))}
      </>
    )
  }
  return (
    <>
      {selects.map((item) => (
        <label
          key={item.id}
          className={cx('flex flex-col gap-1 text-sm font-medium text-text', className ?? 'min-w-40')}
        >
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
          disabled={dateRange.disabled}
          onChange={(event) => dateRange.onChange({ from: event.target.value, to: dateRange.to })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-text">
        Hasta
        <Input
          type="date"
          value={dateRange.to}
          disabled={dateRange.disabled}
          onChange={(event) => dateRange.onChange({ from: dateRange.from, to: event.target.value })}
        />
      </label>
    </div>
  )
}

function SearchField({ search, size }: { search: FilterSearch; size: FilterSize }) {
  return (
    <form
      className={cx(
        'flex w-full items-center rounded-md border border-border bg-bg focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]',
        size === 'lg' ? 'h-10' : 'h-8',
      )}
      onSubmit={(event) => {
        event.preventDefault()
        search.onSubmit?.(search.value)
      }}
    >
      <span className="sr-only">{search.label}</span>
      <span className="pl-2 text-muted" aria-hidden="true">
        <NavIcon name="search" />
      </span>
      <input
        type="search"
        value={search.value}
        placeholder={search.placeholder ?? search.label}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm text-text outline-none placeholder:text-muted"
        onChange={(event) => search.onChange(event.target.value)}
      />
      {search.value ? (
        <button
          type="button"
          className="grid h-full place-items-center px-2 text-muted hover:text-text"
          aria-label="Limpiar búsqueda"
          onClick={() => search.onChange('')}
        >
          <NavIcon name="x" />
        </button>
      ) : null}
      {search.onSubmit ? (
        <button
          type="submit"
          className="grid h-full place-items-center border-l border-border px-2 text-muted hover:text-text"
          aria-label="Buscar"
        >
          <NavIcon name="search" />
        </button>
      ) : null}
    </form>
  )
}

function ExtraFilters({
  selects,
  chips,
  dateRange,
  size,
  native,
}: {
  selects?: FilterSelect[]
  chips?: FilterChipGroup[]
  dateRange?: FilterDateRange
  size: FilterSize
  native?: boolean
}) {
  return (
    <>
      {selects && selects.length > 0 ? <SelectFields selects={selects} native={native} /> : null}
      {chips && chips.length > 0 ? <ChipButtons groups={chips} size={size} /> : null}
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
  size = 'md',
  stacked = false,
  className,
}: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const hasExtra = Boolean((selects && selects.length > 0) || (chips && chips.length > 0) || dateRange)
  const clearButton =
    onClear && activeCount > 0 ? (
      <button type="button" className="inline-flex items-center gap-1 text-sm text-accent hover:underline" onClick={onClear}>
        <NavIcon name="x" />
        Limpiar filtros
      </button>
    ) : null

  let sheet: ReactNode = null
  if (open) {
    sheet = (
      <Modal label="Filtros" onClose={() => setOpen(false)} className="flex items-end bg-overlay">
        <div className="max-h-[85vh] w-full overflow-auto rounded-t-[10px] border border-border bg-surface p-4">
          <div className="flex flex-col gap-4">
            <ExtraFilters selects={selects} chips={chips} dateRange={dateRange} size={size} native />
            <Button variant="primary" size="lg" fullWidth onClick={() => setOpen(false)}>
              Ver resultados
            </Button>
            {onClear ? (
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
              >
                Limpiar
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    )
  }

  if (stacked) {
    return (
      <div className={cx('flex flex-col gap-2', className)}>
        <div className="flex flex-wrap items-end gap-2">
          {search ? (
            <div className="min-w-[min(100%,12rem)] flex-1">
              <SearchField search={search} size={size} />
            </div>
          ) : null}
          {selects && selects.length > 0 ? (
            <SelectFields
              selects={selects}
              native
              className="min-w-[min(100%,10rem)] flex-1"
            />
          ) : null}
        </div>
        {chips && chips.length > 0 ? (
          <div className="flex flex-wrap items-start gap-2">
            <ChipButtons groups={chips} size={size} />
            {dateRange ? <Dates dateRange={dateRange} /> : null}
            {clearButton}
          </div>
        ) : clearButton}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-3">
        {search ? <SearchField search={search} size={size} /> : null}
        {hasExtra ? (
          <Button variant="secondary" size={size} className="sm:hidden" onClick={() => setOpen(true)}>
            Filtros ({activeCount})
          </Button>
        ) : null}
        <div className="hidden min-w-0 flex-wrap items-end gap-3 sm:flex">
          <ExtraFilters selects={selects} chips={chips} dateRange={dateRange} size={size} />
          {clearButton}
        </div>
      </div>
      {sheet}
    </div>
  )
}
