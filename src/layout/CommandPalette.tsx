import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui'
import { statusTone } from '../components/ui/tones'
import { canOpen } from '../lib/access'
import { focusables } from '../lib/focus'
import { normalizeInvoiceKey } from '../lib/invoiceKey'
import { statusPillFor } from '../lib/orderFlow'
import { compareOpenPriority } from '../lib/priority'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { NavIcon } from './NavIcon'
import { visibleNav, type NavItem } from './nav'

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
}

function orderMatches(order: {
  id: string
  client: string
  phone?: string
  invoices?: string[]
}, query: string) {
  const q = fold(query.trim())
  if (!q) return false
  if (fold(order.id).includes(q)) return true
  if (fold(order.client).includes(q)) return true
  if (order.phone && fold(order.phone).includes(q)) return true
  const invKey = normalizeInvoiceKey(query)
  if (
    (order.invoices ?? []).some((invoice) => {
      if (fold(invoice).includes(q)) return true
      return invKey.length > 0 && normalizeInvoiceKey(invoice) === invKey
    })
  ) {
    return true
  }
  return false
}

type PageResult = { kind: 'page'; key: string; item: NavItem }
type OrderResult = { kind: 'order'; key: string; orderId: string; client: string; statusLabel: string; status: Parameters<typeof statusTone>[0]; date: string }
type Result = PageResult | OrderResult

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { user } = useAuth()
  const { orders } = useOrders()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const inputId = useId()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [active, setActive] = useState(0)

  const role = user?.role
  const canSearchOrders = Boolean(role && canOpen(role, '/pedidos'))

  const results = useMemo(() => {
    if (!role) return [] as Result[]
    const { standalone, groups } = visibleNav(role)
    const pages = [...standalone, ...groups.flatMap((g) => g.items)]
    const q = fold(deferredQuery.trim())
    const pageResults: PageResult[] = pages
      .filter((item) => !q || fold(item.label).includes(q))
      .map((item) => ({ kind: 'page', key: `page:${item.to}`, item }))

    const orderResults: OrderResult[] = []
    if (canSearchOrders && deferredQuery.trim()) {
      const matched = orders
        .filter((order) => orderMatches(order, deferredQuery))
        .sort((left, right) => {
          const byPriority = compareOpenPriority(left, right)
          if (byPriority !== 0) return byPriority
          return (right.deliveryDate || '').localeCompare(left.deliveryDate || '')
        })
        .slice(0, 8)
      for (const order of matched) {
        orderResults.push({
          kind: 'order',
          key: `order:${order.id}`,
          orderId: order.id,
          client: order.client,
          status: order.status,
          statusLabel: statusPillFor(order, order.status),
          date: order.deliveryDate ? formatIsoDate(order.deliveryDate) : '',
        })
      }
    }

    return [...pageResults, ...orderResults]
  }, [role, deferredQuery, orders, canSearchOrders])

  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1)

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const items = focusables(root)
      if (items.length === 0) return
      const current = document.activeElement as HTMLElement | null
      const index = current ? items.indexOf(current) : -1
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          items[items.length - 1]?.focus()
        }
        return
      }
      if (index === items.length - 1 || index === -1) {
        event.preventDefault()
        items[0]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const activeOptionId = results[activeIndex] ? `${listId}-${activeIndex}` : undefined

  function go(result: Result) {
    if (result.kind === 'page') navigate(result.item.to)
    else navigate(`/pedidos/${result.orderId}`)
    onClose()
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (results.length === 0) return
      setActive((i) => {
        const cur = results.length === 0 ? 0 : Math.min(i, results.length - 1)
        return (cur + 1) % results.length
      })
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      setActive((i) => {
        const cur = results.length === 0 ? 0 : Math.min(i, results.length - 1)
        return cur <= 0 ? results.length - 1 : cur - 1
      })
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      if (results.length > 0) setActive(results.length - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[activeIndex]
      if (result) go(result)
    }
  }

  const pageResults = results.filter((r): r is PageResult => r.kind === 'page')
  const orderResults = results.filter((r): r is OrderResult => r.kind === 'order')

  return (
    <div
      className="command-palette-root"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className="command-palette"
      >
        <div className="command-palette-input-row">
          <svg className="command-palette-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            className="command-palette-input"
            placeholder="Buscar páginas o pedidos…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            autoComplete="off"
          />
        </div>

        <div id={listId} role="listbox" className="command-palette-list" aria-label="Resultados">
          {results.length === 0 ? (
            <p className="command-palette-empty" role="status">
              Sin resultados para “{query.trim() || '…'}”
            </p>
          ) : (
            <>
              {pageResults.length > 0 ? (
                <div className="command-palette-section">
                  <p className="command-palette-section-title">Páginas</p>
                  {pageResults.map((result) => {
                    const index = results.indexOf(result)
                    const selected = index === activeIndex
                    return (
                      <button
                        key={result.key}
                        type="button"
                        id={`${listId}-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={selected}
                        className={
                          selected
                            ? 'command-palette-option is-active'
                            : 'command-palette-option'
                        }
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(result)}
                      >
                        <NavIcon name={result.item.icon} />
                        <span>{result.item.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {orderResults.length > 0 ? (
                <div className="command-palette-section">
                  <p className="command-palette-section-title">Pedidos</p>
                  {orderResults.map((result) => {
                    const index = results.indexOf(result)
                    const selected = index === activeIndex
                    return (
                      <button
                        key={result.key}
                        type="button"
                        id={`${listId}-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={selected}
                        className={
                          selected
                            ? 'command-palette-option is-active'
                            : 'command-palette-option'
                        }
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(result)}
                      >
                        <span className="command-palette-order">
                          <span className="command-palette-order-id">{result.orderId}</span>
                          <span className="command-palette-order-client">{result.client}</span>
                        </span>
                        <Badge tone={statusTone(result.status)} size="sm">
                          {result.statusLabel}
                        </Badge>
                        {result.date ? (
                          <span className="command-palette-order-date">{result.date}</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>

        <p className="command-palette-help">
          ↑↓ para moverte · Enter para abrir · Esc para cerrar
        </p>
      </div>
    </div>
  )
}

type SearchTriggerProps = {
  onOpen: () => void
  compact?: boolean
}

export function SearchTrigger({ onOpen, compact = false }: SearchTriggerProps) {
  if (compact) {
    return (
      <button type="button" className="topbar-search-btn" aria-label="Buscar" onClick={onOpen}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M16 16l4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    )
  }

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  return (
    <button type="button" className="topnav-search" onClick={onOpen} aria-label="Buscar">
      <svg className="topnav-search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M16 16l4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="topnav-search-label">Buscar…</span>
      <kbd className="topnav-search-kbd">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}
