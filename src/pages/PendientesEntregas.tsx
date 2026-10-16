import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { OrderFlowButtons } from '../components/OrderFlowButtons'
import { OrderStepper } from '../components/OrderStepper'
import { PriorityChip } from '../components/PriorityChip'
import { ServerDown, Spinner } from '../components/LoadState'
import { Badge, Button, Drawer, EmptyState, FilterBar, ListBox, Modal, Page, PageHeader, Select, statusTone, Table, type TableColumn } from '../components/ui'
import { BRAND } from '../config/brand'
import { DISPATCH_LABEL, isDispatchType } from '../data/catalog'
import { STATUS_PILL, type Order, type OrderStatus } from '../data/orders'
import { normalizeName } from '../lib/access'
import { askPackages, confirm, error as showError, success } from '../lib/alerts'
import { buildCsv, downloadCsvFile, toCsv } from '../lib/csv'
import {
  matchOrdersByInvoice,
  normalizeInvoiceKey,
  type InvoiceMatch,
} from '../lib/invoiceKey'
import { statusPillFor } from '../lib/orderFlow'
import type { PickingStatus } from '../lib/pickingApi'
import {
  batchRowsFromPreview,
  pickingTemplateCsv,
  previewPickingWorkbook,
  type PickingLine,
  type PickingPreview,
  type PickingPreviewRow,
} from '../lib/pickingSheet'
import { compareOpenPriority, PRIORITY_LABEL, priorityOf } from '../lib/priority'
import { businessToday } from '../lib/schedule'
import { addDays, formatIsoDate, parseIso, startOfWeek, toIso } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'

const ORDER_LINK_BATCH = 50

const MODAL_ROW_LIMIT = 500

const OPEN_STATUSES: OrderStatus[] = ['pendiente', 'preparado', 'asignado', 'en-viaje']

type Mode = 'lista' | 'picking'
type StatusFilter =
  | 'todos'
  | 'pendiente'
  | 'preparado'
  | 'asignado'
  | 'en-viaje'
  | 'atrasados'
  | 'sin_picking'
  | 'sin_pedido'
type FechaFilter = 'hoy' | 'semana' | 'todos'
type ImportMode = 'replace' | 'merge'

type PickingGroup = {
  key: string
  invoice: string
  client: string
  seller: string
  date?: string
  lines: PickingLine[]
  link: InvoiceMatch
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'preparado', label: 'Preparado' },
  { value: 'asignado', label: 'Asignado/Despachado' },
  { value: 'en-viaje', label: 'En viaje' },
  { value: 'atrasados', label: 'Atrasados' },
  { value: 'sin_picking', label: 'Sin picking' },
  { value: 'sin_pedido', label: 'Sin pedido' },
]

const FECHA_CHIPS: { value: FechaFilter; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'todos', label: 'Todos' },
]

const STATUS_VALUES = new Set<StatusFilter>(STATUS_CHIPS.map((chip) => chip.value))
const FECHA_VALUES = new Set<FechaFilter>(FECHA_CHIPS.map((chip) => chip.value))

function parseStatusFilter(value: string | null): StatusFilter {
  if (value && STATUS_VALUES.has(value as StatusFilter)) return value as StatusFilter
  return 'todos'
}

function parseFechaFilter(value: string | null): FechaFilter {
  if (value && FECHA_VALUES.has(value as FechaFilter)) return value as FechaFilter
  return 'semana'
}

const FIXED_COLUMNS: { id: string; label: string }[] = [
  { id: 'cliente', label: 'cliente' },
  { id: 'comprobante', label: 'comprobante' },
  { id: 'articulo', label: 'artículo' },
  { id: 'cantidad', label: 'cantidad' },
  { id: 'vendedor', label: 'vendedor' },
  { id: 'status', label: 'status' },
]

function lineStatus(line: PickingLine): PickingStatus {
  return line.status ?? 'pendiente'
}

function matchesSearch(line: PickingLine, needle: string) {
  if (!needle) return true
  if (line.client.toLowerCase().includes(needle)) return true
  if (line.invoice.toLowerCase().includes(needle)) return true
  const invoiceKey = normalizeInvoiceKey(line.invoice)
  const needleKey = normalizeInvoiceKey(needle)
  if (invoiceKey && needleKey && invoiceKey.includes(needleKey)) return true
  if (line.product.toLowerCase().includes(needle)) return true
  if (line.seller.toLowerCase().includes(needle)) return true
  if (line.orderId?.toLowerCase().includes(needle)) return true
  if (line.raw) {
    for (const value of Object.values(line.raw)) {
      if (String(value).toLowerCase().includes(needle)) return true
    }
  }
  return false
}

function matchesOrderSearch(order: Order, needle: string, orderLines: PickingLine[]) {
  if (!needle) return true
  if (order.id.toLowerCase().includes(needle)) return true
  if (order.client.toLowerCase().includes(needle)) return true
  if ((order.phone ?? '').toLowerCase().includes(needle)) return true
  const needleKey = normalizeInvoiceKey(needle)
  for (const invoice of order.invoices ?? []) {
    if (invoice.toLowerCase().includes(needle)) return true
    const key = normalizeInvoiceKey(invoice)
    if (key && needleKey && key.includes(needleKey)) return true
  }
  for (const line of orderLines) {
    if (matchesSearch(line, needle)) return true
  }
  return false
}

function matchesFecha(
  deliveryDate: string | undefined,
  filter: FechaFilter,
  today: string,
  weekFrom: string,
  weekTo: string,
) {
  if (deliveryDate && deliveryDate < today) return true
  if (filter === 'todos') return true
  if (!deliveryDate) return false
  if (filter === 'hoy') return deliveryDate === today
  if (filter === 'semana') return deliveryDate >= weekFrom && deliveryDate <= weekTo
  return true
}

function sellerKey(value: string | undefined) {
  return normalizeName(value)
}

function cellValue(line: PickingLine, columnId: string) {
  switch (columnId) {
    case 'cliente':
      return line.client
    case 'comprobante':
      return line.invoice
    case 'articulo':
      return line.product
    case 'cantidad':
      return String(line.quantity)
    case 'vendedor':
      return line.seller
    case 'status':
      return lineStatus(line)
    default: {
      if (!columnId.startsWith('raw:')) return ''
      const key = columnId.slice(4)
      const value = line.raw?.[key]
      return value === undefined || value === null ? '' : String(value)
    }
  }
}

function columnsFromLines(rows: PickingLine[]) {
  const rawKeys = new Set<string>()
  for (const line of rows) {
    if (!line.raw) continue
    for (const key of Object.keys(line.raw)) rawKeys.add(key)
  }
  const sortedRaw = [...rawKeys].sort((a, b) => a.localeCompare(b, 'es'))
  return [
    ...FIXED_COLUMNS,
    ...sortedRaw.map((key) => ({ id: `raw:${key}`, label: key })),
  ]
}

function downloadCsv(
  rows: PickingLine[],
  columns: { id: string; label: string }[],
) {
  const table = [
    columns.map((column) => column.label),
    ...rows.map((line) => columns.map((column) => cellValue(line, column.id))),
  ]
  downloadCsvFile(buildCsv(table), 'picking-datos.csv')
}

function groupLines(lines: PickingLine[], pedidos: Order[]): PickingGroup[] {
  const groups = new Map<string, PickingGroup>()
  for (const line of lines) {
    const key = normalizeInvoiceKey(line.invoice) || line.invoice
    const current = groups.get(key)
    if (current) {
      current.lines.push(line)
      if (!current.date && line.date) current.date = line.date
      if (!current.seller && line.seller) current.seller = line.seller
      if (!current.client && line.client) current.client = line.client
    } else {
      groups.set(key, {
        key,
        invoice: line.invoice,
        client: line.client,
        seller: line.seller,
        date: line.date,
        lines: [line],
        link: matchOrdersByInvoice(pedidos, line.invoice),
      })
    }
  }
  return [...groups.values()]
}

function pickedOf(line: PickingLine) {
  if (line.status === 'preparado' && typeof line.pickedQty !== 'number') return line.quantity
  return typeof line.pickedQty === 'number' ? line.pickedQty : 0
}

function isLineComplete(line: PickingLine) {
  if (line.status === 'preparado') return true
  return pickedOf(line) >= line.quantity
}

function currentPickedQty(line: PickingLine) {
  return typeof line.pickedQty === 'number' ? line.pickedQty : 0
}

function progressOfLines(orderLines: PickingLine[]) {
  const total = orderLines.length
  const complete = orderLines.filter(isLineComplete).length
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100)
  const missing = orderLines
    .filter((line) => !isLineComplete(line))
    .map((line) => ({
      id: line.id,
      product: line.product,
      missing: line.quantity - pickedOf(line),
    }))
  return {
    complete,
    total,
    pct,
    missing,
    readyToPrepare: total > 0 && complete === total,
  }
}

function progressOf(group: PickingGroup) {
  return progressOfLines(group.lines)
}

function isOverdueOrder(order: Order, today: string) {
  return Boolean(order.deliveryDate) && order.deliveryDate < today
}

function overdueDays(deliveryDate: string, today: string) {
  if (!deliveryDate || deliveryDate >= today) return 0
  const ms = parseIso(today).getTime() - parseIso(deliveryDate).getTime()
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)))
}

function compareListaOrders(left: Order, right: Order, today: string) {
  const byPriority = compareOpenPriority(left, right)
  if (byPriority !== 0) return byPriority
  const leftOverdue = isOverdueOrder(left, today) ? 0 : 1
  const rightOverdue = isOverdueOrder(right, today) ? 0 : 1
  if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
  const byDate = (left.deliveryDate || '').localeCompare(right.deliveryDate || '')
  if (byDate !== 0) return byDate
  return left.id.localeCompare(right.id)
}

function groupForOrder(order: Order, orderLines: PickingLine[]): PickingGroup {
  const invoice = order.invoices?.[0] ?? orderLines[0]?.invoice ?? order.id
  const key = normalizeInvoiceKey(invoice) || invoice
  return {
    key,
    invoice,
    client: order.client,
    seller: order.seller ?? '',
    date: order.deliveryDate,
    lines: orderLines,
    link: { kind: 'one', order },
  }
}

function subtitle(group: PickingGroup) {
  return [group.seller, BRAND.name, group.date].filter(Boolean).join(' · ')
}

function OrderLinkBlock({ link }: { link: InvoiceMatch }) {
  if (link.kind === 'one') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Link className="order-link font-semibold" to={`/pedidos/${link.order.id}`}>
          {link.order.id}
        </Link>
        <span>{link.order.client}</span>
        <OrderStepper order={link.order} variant="compact" />
      </div>
    )
  }
  if (link.kind === 'many') {
    return <p className="mt-2 text-sm text-muted">Comprobante en varios pedidos</p>
  }
  return <p className="mt-2 text-sm text-muted">Sin pedido</p>
}

function GroupPickingSummary({ group }: { group: PickingGroup }) {
  const progress = progressOf(group)
  return (
    <div className="mt-2 text-sm">
      <p>
        {progress.complete} de {progress.total} artículos completos
      </p>
      {progress.readyToPrepare ? (
        <p className="mt-1 font-medium text-success">Listo para preparar</p>
      ) : progress.missing.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-muted">
          {progress.missing.map((item) => (
            <li key={item.id}>
              {item.product}: faltan {item.missing}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

type LinesByInvoice = Map<string, PickingLine[]>

function linesForOrder(byInvoice: LinesByInvoice, order: Order) {
  const keys = new Set(
    (order.invoices ?? []).map((invoice) => normalizeInvoiceKey(invoice)).filter(Boolean),
  )
  if (keys.size === 0) return []
  const result: PickingLine[] = []
  for (const key of keys) {
    const rows = byInvoice.get(key)
    if (rows) result.push(...rows)
  }
  return result
}

/** Completud de todos los comprobantes del pedido (sobre todas las filas). */
function orderPickingState(byInvoice: LinesByInvoice, order: Order, groupKey: string) {
  const invoices = order.invoices ?? []
  if (invoices.length === 0) {
    return { allComplete: false, missingOther: false }
  }
  let allComplete = true
  let missingOther = false
  for (const invoice of invoices) {
    const key = normalizeInvoiceKey(invoice)
    const invLines = byInvoice.get(key) ?? []
    if (invLines.length === 0) {
      allComplete = false
      if (key !== groupKey) missingOther = true
      continue
    }
    if (!invLines.every(isLineComplete)) {
      allComplete = false
      if (key !== groupKey) missingOther = true
    }
  }
  return { allComplete, missingOther }
}

function downloadTemplate() {
  downloadCsvFile(pickingTemplateCsv(), 'plantilla-picking.csv')
}

export function PendientesEntregas() {
  const { user } = useAuth()
  const { sellers: catalogSellers } = useCatalog()
  const { orders: pedidos, transitionOrder } = useOrders()
  const {
    lines,
    loading,
    error: loadError,
    canWrite,
    legacyOffer,
    refresh,
    patchLine,
    uploadLegacy,
    dismissLegacy,
    applyBatch,
  } = usePicking()
  const canLinkOrders = user?.role === 'encargado_deposito' || user?.role === 'admin'
  const isVendedor = user?.role === 'vendedor'
  const lockedSeller = isVendedor ? (user?.sellerName?.trim() ?? '') : ''
  const fileRef = useRef<HTMLInputElement>(null)
  const linkingRef = useRef(new Set<string>())
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('lista')
  const [searchDraft, setSearchDraft] = useState(() => searchParams.get('q') ?? '')
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [preparingKey, setPreparingKey] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<PickingPreview | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [excelByIndex, setExcelByIndex] = useState<number[][]>([])
  const [showAllData, setShowAllData] = useState(false)
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([])
  const [flowBusy, setFlowBusy] = useState(false)
  const [alignedId, setAlignedId] = useState<string | null>(null)

  const today = businessToday()
  const weekStart = startOfWeek(parseIso(businessToday()))
  const weekFrom = toIso(weekStart)
  const weekTo = toIso(addDays(weekStart, 6))

  const statusFilter = parseStatusFilter(searchParams.get('estado'))
  const fechaFilter = parseFechaFilter(searchParams.get('fecha'))
  const searchApplied = searchParams.get('q') ?? ''
  const sellerFromUrl = searchParams.get('vendedor') ?? 'todos'
  const seller = isVendedor ? lockedSeller : sellerFromUrl

  function patchParams(updates: Record<string, string | null>) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        for (const [key, value] of Object.entries(updates)) {
          const isDefault =
            value == null ||
            value === '' ||
            value === 'todos' ||
            (key === 'fecha' && value === 'semana')
          if (isDefault) params.delete(key)
          else params.set(key, value)
        }
        if (isVendedor) params.delete('vendedor')
        return params
      },
      { replace: true },
    )
  }

  const openOrders = useMemo(
    () => pedidos.filter((order) => OPEN_STATUSES.includes(order.status)),
    [pedidos],
  )

  const sellers = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const name of catalogSellers) {
      const key = sellerKey(name)
      if (key && !byKey.has(key)) byKey.set(key, name.trim())
    }
    for (const order of openOrders) {
      const key = sellerKey(order.seller)
      if (key && !byKey.has(key)) byKey.set(key, order.seller!.trim())
    }
    for (const line of lines) {
      const key = sellerKey(line.seller)
      if (key && !byKey.has(key)) byKey.set(key, line.seller.trim())
    }
    return [...byKey.values()].sort((left, right) => left.localeCompare(right, 'es'))
  }, [catalogSellers, lines, openOrders])

  const linesByOrderId = useMemo(() => {
    const map = new Map<string, PickingLine[]>()
    for (const line of lines) {
      if (!line.orderId) continue
      const bucket = map.get(line.orderId)
      if (bucket) bucket.push(line)
      else map.set(line.orderId, [line])
    }
    return map
  }, [lines])

  const linesByInvoice = useMemo(() => {
    const map: LinesByInvoice = new Map()
    for (const line of lines) {
      const key = normalizeInvoiceKey(line.invoice)
      if (!key) continue
      const bucket = map.get(key)
      if (bucket) bucket.push(line)
      else map.set(key, [line])
    }
    return map
  }, [lines])

  const linesByOpenOrder = useMemo(() => {
    const map = new Map<string, PickingLine[]>()
    const claimed = new Set<string>()
    for (const order of openOrders) {
      const joined: PickingLine[] = []
      for (const line of linesByOrderId.get(order.id) ?? []) {
        if (claimed.has(line.id)) continue
        claimed.add(line.id)
        joined.push(line)
      }
      for (const line of linesForOrder(linesByInvoice, order)) {
        if (line.orderId && line.orderId !== order.id) continue
        if (claimed.has(line.id)) continue
        claimed.add(line.id)
        joined.push(line)
      }
      map.set(order.id, joined)
    }
    return { map, claimed }
  }, [openOrders, linesByOrderId, linesByInvoice])

  const orphanLines = useMemo(
    () => lines.filter((line) => !linesByOpenOrder.claimed.has(line.id)),
    [lines, linesByOpenOrder],
  )

  const filteredOpenOrders = useMemo(() => {
    const needle = searchApplied.trim().toLowerCase()
    const sellerNorm = seller === 'todos' ? '' : sellerKey(seller)
    return openOrders
      .filter((order) => {
        if (statusFilter === 'sin_pedido') return false
        const orderLines = linesByOpenOrder.map.get(order.id) ?? []
        if (sellerNorm && sellerKey(order.seller) !== sellerNorm) return false
        if (statusFilter === 'atrasados') {
          if (!isOverdueOrder(order, today)) return false
        } else if (statusFilter === 'sin_picking') {
          if (orderLines.length > 0) return false
        } else if (statusFilter !== 'todos' && order.status !== statusFilter) {
          return false
        }
        if (!matchesFecha(order.deliveryDate, fechaFilter, today, weekFrom, weekTo)) {
          return false
        }
        return matchesOrderSearch(order, needle, orderLines)
      })
      .sort((left, right) => compareListaOrders(left, right, today))
  }, [
    fechaFilter,
    linesByOpenOrder,
    openOrders,
    searchApplied,
    seller,
    statusFilter,
    today,
    weekFrom,
    weekTo,
  ])

  const filteredOrphans = useMemo(() => {
    if (statusFilter === 'sin_picking') return []
    if (
      statusFilter !== 'todos' &&
      statusFilter !== 'sin_pedido' &&
      statusFilter !== 'atrasados'
    ) {
      return []
    }
    const needle = searchApplied.trim().toLowerCase()
    const sellerNorm = seller === 'todos' ? '' : sellerKey(seller)
    return orphanLines.filter((line) => {
      if (sellerNorm && sellerKey(line.seller) !== sellerNorm) return false
      if (statusFilter === 'atrasados') {
        if (!line.date || line.date >= today) return false
      }
      if (!matchesFecha(line.date, fechaFilter, today, weekFrom, weekTo)) return false
      return matchesSearch(line, needle)
    })
  }, [fechaFilter, orphanLines, searchApplied, seller, statusFilter, today, weekFrom, weekTo])

  const filteredLines = useMemo(() => {
    const needle = searchApplied.trim().toLowerCase()
    const sellerNorm = seller === 'todos' ? '' : sellerKey(seller)
    return lines.filter((line) => {
      const claimed = linesByOpenOrder.claimed.has(line.id)
      if (statusFilter === 'sin_pedido' && claimed) return false
      if (statusFilter === 'sin_picking') return false
      const linkedOrder = line.orderId
        ? (openOrders.find((item) => item.id === line.orderId) ??
          pedidos.find((item) => item.id === line.orderId))
        : (() => {
            const match = matchOrdersByInvoice(pedidos, line.invoice)
            return match.kind === 'one' ? match.order : undefined
          })()
      const date = linkedOrder?.deliveryDate ?? line.date
      if (statusFilter === 'atrasados') {
        if (!date || date >= today) return false
      } else if (
        statusFilter !== 'todos' &&
        statusFilter !== 'sin_pedido' &&
        OPEN_STATUSES.includes(statusFilter as OrderStatus)
      ) {
        if (!linkedOrder || linkedOrder.status !== statusFilter) return false
      }
      if (sellerNorm && sellerKey(line.seller) !== sellerNorm) {
        if (!linkedOrder || sellerKey(linkedOrder.seller) !== sellerNorm) return false
      }
      if (!matchesFecha(date, fechaFilter, today, weekFrom, weekTo)) return false
      return matchesSearch(line, needle)
    })
  }, [
    fechaFilter,
    lines,
    linesByOpenOrder,
    openOrders,
    pedidos,
    searchApplied,
    seller,
    statusFilter,
    today,
    weekFrom,
    weekTo,
  ])

  const groups = useMemo(() => groupLines(filteredLines, pedidos), [filteredLines, pedidos])
  const orphanGroups = useMemo(
    () => groupLines(filteredOrphans, pedidos),
    [filteredOrphans, pedidos],
  )
  const dataColumns = useMemo(() => columnsFromLines(filteredLines), [filteredLines])
  const visibleColumns = dataColumns.filter((column) => visibleColumnIds.includes(column.id))
  const modalLines = filteredLines.slice(0, MODAL_ROW_LIMIT)
  const modalTruncated = filteredLines.length > MODAL_ROW_LIMIT

  useEffect(() => {
    if (!canLinkOrders || lines.length === 0 || pedidos.length === 0) return
    let cancelled = false
    const pending = lines
      .filter((line) => {
        if (linkingRef.current.has(line.id)) return false
        const match = matchOrdersByInvoice(pedidos, line.invoice)
        return match.kind === 'one' && line.orderId !== match.order.id
      })
      .slice(0, ORDER_LINK_BATCH)
    if (pending.length === 0) return

    void (async () => {
      for (const line of pending) {
        if (cancelled) return
        const match = matchOrdersByInvoice(pedidos, line.invoice)
        if (match.kind !== 'one' || line.orderId === match.order.id) continue
        linkingRef.current.add(line.id)
        const result = await patchLine(line.id, { orderId: match.order.id })
        linkingRef.current.delete(line.id)
        if (!result.ok && !cancelled) setError(result.message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canLinkOrders, lines, patchLine, pedidos])

  function openAllData() {
    setVisibleColumnIds(dataColumns.map((column) => column.id))
    setShowAllData(true)
  }

  function toggleColumn(columnId: string) {
    setVisibleColumnIds((current) =>
      current.includes(columnId)
        ? current.filter((id) => id !== columnId)
        : [...current, columnId],
    )
  }

  async function onFile(file: File) {
    setError('')
    setMessage('')
    try {
      const next = previewPickingWorkbook(await file.arrayBuffer())
      setPreview(next)
      setExcelByIndex(next.valid.map((row) => row.excelRows))
      setImportMode('merge')
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el archivo.')
    }
  }

  async function confirmImport() {
    if (!preview || preview.valid.length === 0) {
      setError('No hay filas válidas para importar.')
      return
    }
    if (importMode === 'replace') {
      const accepted = await confirm(
        'Reemplazar todo',
        'Se borran las filas de picking del server y se cargan solo las del archivo.',
        { peligro: true },
      )
      if (!accepted) return
    }
    setBusy(true)
    setError('')
    const rows = batchRowsFromPreview(preview.valid)
    const result = await applyBatch(importMode, rows)
    setBusy(false)
    if (!result.ok) {
      const details =
        result.errors
          ?.map((item) => {
            const excel = excelByIndex[item.index]?.[0]
            return excel ? `Fila ${excel}: ${item.message}` : item.message
          })
          .join(' · ') ?? ''
      setError(details ? `${result.message} ${details}` : result.message)
      return
    }
    setPreview(null)
    patchParams({ grupo: null })
    setMessage(
      `Importación: ${result.created} creadas, ${result.updated} actualizadas, ${result.removed} borradas.`,
    )
  }

  function qtyDraftFor(line: PickingLine) {
    if (Object.prototype.hasOwnProperty.call(qtyDrafts, line.id)) return qtyDrafts[line.id]!
    return String(pickedOf(line))
  }

  function setQtyDraft(id: string, value: string) {
    setQtyDrafts((current) => ({ ...current, [id]: value }))
  }

  function clearQtyDraft(id: string) {
    setQtyDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, id)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  async function savePickedQty(line: PickingLine, raw: string) {
    setError('')
    if (line.status === 'preparado') {
      clearQtyDraft(line.id)
      return
    }
    const trimmed = String(raw).trim()
    if (trimmed === '') {
      clearQtyDraft(line.id)
      return
    }
    const parsed = Number(trimmed)
    if (trimmed.includes(',') || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      clearQtyDraft(line.id)
      setError('La cantidad pickeada tiene que ser un número entero.')
      return
    }
    if (parsed < 0 || parsed > line.quantity) {
      clearQtyDraft(line.id)
      setError(`La cantidad pickeada tiene que estar entre 0 y ${line.quantity}.`)
      return
    }
    if (currentPickedQty(line) === parsed) {
      clearQtyDraft(line.id)
      return
    }
    const nextStatus: PickingStatus = parsed > 0 ? 'en_preparacion' : 'pendiente'
    setSavingId(line.id)
    const result = await patchLine(line.id, { pickedQty: parsed, status: nextStatus })
    setSavingId(null)
    clearQtyDraft(line.id)
    if (!result.ok) setError(result.message)
  }

  async function markComplete(line: PickingLine) {
    if (line.status === 'preparado') return
    setQtyDraft(line.id, String(line.quantity))
    await savePickedQty(line, String(line.quantity))
  }

  async function markOrderPrepared(group: PickingGroup) {
    if (group.link.kind !== 'one') return
    const order = group.link.order
    if (order.status !== 'pendiente' && order.status !== 'preparado') return

    const orderLines = linesForOrder(linesByInvoice, order)
    const { allComplete } = orderPickingState(linesByInvoice, order, group.key)
    if (!allComplete || orderLines.length === 0) return

    let packages: number | null = null
    if (order.status === 'pendiente') {
      packages = await askPackages('Marcar preparado', 'Indicá la cantidad de bultos.')
      if (packages == null) return
      setPreparingKey(group.key)
      setError('')
      const result = await transitionOrder(order.id, {
        to: 'preparado',
        via: 'picking',
        packages,
      })
      if (result.status === 'not-saved') {
        setPreparingKey(null)
        await showError(result.message)
        return
      }
    } else {
      setPreparingKey(group.key)
      setError('')
    }

    let failed = 0
    for (const line of orderLines) {
      if (line.status === 'preparado' && line.orderId === order.id) continue
      const result = await patchLine(line.id, { status: 'preparado', orderId: order.id })
      if (!result.ok) failed += 1
    }
    setPreparingKey(null)
    if (failed > 0) {
      setError(
        `No se pudieron marcar ${failed} fila${failed === 1 ? '' : 's'}. Podés reintentar.`,
      )
      return
    }
    const bultos = packages ?? order.packages ?? 0
    const bultosText = bultos === 1 ? '1 bulto' : `${bultos} bultos`
    await success(`Pedido ${order.id} preparado con ${bultosText}.`)
  }

  function prepareBlock(group: PickingGroup) {
    if (!canWrite) return null
    if (group.link.kind !== 'one') return null
    const order = group.link.order
    if (
      order.status === 'asignado' ||
      order.status === 'en-viaje' ||
      order.status === 'entregado'
    ) {
      return (
        <p className="mt-2 text-sm text-muted">
          Pedido {STATUS_PILL[order.status]}
        </p>
      )
    }
    if (order.status !== 'pendiente' && order.status !== 'preparado') return null

    const orderLines = linesForOrder(linesByInvoice, order)
    const allRowsPrepared =
      orderLines.length > 0 && orderLines.every((line) => line.status === 'preparado')
    if (order.status === 'preparado' && allRowsPrepared) {
      return (
        <span className="status-pill status-preparado mt-2 inline-flex">Preparado</span>
      )
    }

    const groupComplete = group.lines.length > 0 && group.lines.every(isLineComplete)
    const { allComplete, missingOther } = orderPickingState(linesByInvoice, order, group.key)

    if (!allComplete) {
      if (groupComplete && missingOther) {
        return (
          <p className="mt-2 text-sm text-muted">
            Faltan filas de otro comprobante del pedido
          </p>
        )
      }
      return null
    }

    return (
      <Button
        variant="secondary"
        size="lg"
        className="mt-2"
        disabled={preparingKey === group.key || busy}
        onClick={() => void markOrderPrepared(group)}
      >
        {order.status === 'preparado' ? 'Marcar filas preparadas' : 'Marcar preparado'}
      </Button>
    )
  }

  async function onUploadLegacy() {
    setBusy(true)
    setError('')
    const result = await uploadLegacy()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage(result.message)
  }

  function openPedido(id: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('pedido', id)
        next.delete('grupo')
        return next
      },
      { state: { fromList: true } },
    )
  }

  function openGrupo(key: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('grupo', key)
        next.delete('pedido')
        return next
      },
      { state: { fromList: true } },
    )
  }

  function openDetail(key: string) {
    setMode('picking')
    openGrupo(key)
  }

  const closeFromList = useCallback(() => {
    if (location.state && typeof location.state === 'object' && (location.state as { fromList?: boolean }).fromList) {
      navigate(-1)
      return
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('pedido')
        next.delete('grupo')
        return next
      },
      { replace: true },
    )
  }, [location.state, navigate, setSearchParams])

  const openId = searchParams.get('pedido')
  const grupoId = searchParams.get('grupo')
  const openOrder =
    filteredOpenOrders.find((order) => order.id === openId) ??
    (openId ? openOrders.find((order) => order.id === openId) ?? null : null)
  const openGroup =
    groups.find((group) => group.key === grupoId) ??
    orphanGroups.find((group) => group.key === grupoId) ??
    null

  if (!loading && openId && alignedId !== openId) {
    const found = openOrders.find((order) => order.id === openId)
    if (found) {
      setAlignedId(openId)
      if (mode !== 'lista') setMode('lista')
      if (!filteredOpenOrders.some((order) => order.id === openId)) {
        setSearchDraft('')
        patchParams({ q: null, estado: null, fecha: null, vendedor: null })
      }
    }
  }

  useEffect(() => {
    if (loading || !openId) return
    if (!pedidos.some((order) => order.id === openId)) closeFromList()
  }, [loading, openId, pedidos, closeFromList])

  useEffect(() => {
    if (!openId || alignedId !== openId || mode !== 'lista') return
    if (!filteredOpenOrders.some((order) => order.id === openId)) closeFromList()
  }, [openId, alignedId, mode, filteredOpenOrders, closeFromList])

  useEffect(() => {
    if (loading || !grupoId) return
    if (!openGroup) closeFromList()
  }, [loading, grupoId, openGroup, closeFromList])

  function exportFilteredCsv() {
    const header = [
      'Pedido',
      'Cliente',
      'Vendedor',
      'Estado',
      'Prioridad',
      'Fecha entrega',
      'Días de atraso',
      'Despacho',
      'Comprobantes',
      'Artículos completos',
      'Faltantes',
    ]
    const table: string[][] = [header]

    for (const order of filteredOpenOrders) {
      const orderLines = linesByOpenOrder.map.get(order.id) ?? []
      const progress = progressOfLines(orderLines)
      const days = overdueDays(order.deliveryDate, today)
      const invoices =
        (order.invoices ?? []).length > 0
          ? (order.invoices ?? []).join(', ')
          : [...new Set(orderLines.map((line) => line.invoice).filter(Boolean))].join(', ')
      const dispatch = isDispatchType(order.dispatchType)
        ? DISPATCH_LABEL[order.dispatchType]
        : (order.dispatchType ?? '')
      table.push([
        order.id,
        order.client,
        order.seller ?? '',
        statusPillFor(order, order.status),
        PRIORITY_LABEL[priorityOf(order)],
        order.deliveryDate ? formatIsoDate(order.deliveryDate) : '',
        days > 0 ? String(days) : '0',
        dispatch,
        invoices,
        orderLines.length > 0 ? `${progress.complete}/${progress.total}` : '',
        progress.missing.map((item) => `${item.product}: ${item.missing}`).join(', '),
      ])
    }

    for (const group of orphanGroups) {
      const progress = progressOf(group)
      const days =
        group.date && group.date < today ? overdueDays(group.date, today) : 0
      table.push([
        'Sin pedido',
        group.client,
        group.seller,
        '',
        '',
        group.date ? formatIsoDate(group.date) : '',
        days > 0 ? String(days) : '0',
        '',
        group.invoice,
        `${progress.complete}/${progress.total}`,
        progress.missing.map((item) => `${item.product}: ${item.missing}`).join(', '),
      ])
    }

    downloadCsvFile(toCsv(table), `pendientes-${today}.csv`)
  }

  if (loading && lines.length === 0) {
    return (
      <Page>
        <Spinner label="Cargando picking…" />
      </Page>
    )
  }

  if (loadError && lines.length === 0) {
    return (
      <Page>
        <ServerDown message={loadError} onRetry={() => void refresh()} />
      </Page>
    )
  }

  const listaColumns: TableColumn<Order>[] = [
    {
      key: 'id',
      header: 'N°',
      cell: (order) => (
        <Link
          className="font-medium text-accent hover:underline"
          to={`/pedidos/${order.id}`}
          onClick={(event) => event.stopPropagation()}
        >
          {order.id}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', cell: (order) => order.client },
    { key: 'priority', header: 'Prioridad', cell: (order) => <PriorityChip order={order} /> },
    {
      key: 'status',
      header: 'Estado',
      cell: (order) => <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>,
    },
    {
      key: 'date',
      header: 'Entrega',
      cell: (order) => (order.deliveryDate ? formatIsoDate(order.deliveryDate) : '—'),
    },
    {
      key: 'picking',
      header: 'Picking',
      align: 'right',
      cell: (order) => {
        const orderLines = linesByOpenOrder.map.get(order.id) ?? []
        if (orderLines.length === 0) return 'Sin picking'
        const progress = progressOfLines(orderLines)
        return progress.readyToPrepare ? 'Listo' : `${progress.pct}%`
      },
    },
  ]

  const pickingColumns: TableColumn<PickingGroup>[] = [
    { key: 'invoice', header: 'Comprobante', cell: (group) => group.invoice },
    { key: 'client', header: 'Cliente', cell: (group) => group.client },
    { key: 'seller', header: 'Vendedor', cell: (group) => group.seller || '—' },
    {
      key: 'date',
      header: 'Fecha',
      cell: (group) => (group.date ? formatIsoDate(group.date) : '—'),
    },
    {
      key: 'progress',
      header: 'Avance',
      align: 'right',
      cell: (group) => {
        const progress = progressOf(group)
        return progress.readyToPrepare ? 'Listo' : `${progress.pct}%`
      },
    },
  ]

  const previewColumns: TableColumn<PickingPreviewRow>[] = [
    { key: 'fila', header: 'Fila', cell: (row) => row.excelRows.join(', ') },
    { key: 'cliente', header: 'Cliente', cell: (row) => row.cliente },
    { key: 'comprobante', header: 'Comprobante', cell: (row) => row.comprobante },
    { key: 'articulo', header: 'Artículo', cell: (row) => row.articulo },
    { key: 'cantidad', header: 'Cantidad', align: 'right', cell: (row) => row.cantidad },
    { key: 'vendedor', header: 'Vendedor', cell: (row) => row.vendedor || '—' },
    {
      key: 'notas',
      header: 'Notas',
      cell: (row) => (row.combinedFrom > 1 ? `${row.combinedFrom} filas combinadas` : '—'),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Pendientes de Entregas"
        subtitle="Lista de pedidos y modo picking con stock de Clanbox"
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" size="lg" onClick={downloadTemplate}>
                Descargar plantilla
              </Button>
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => fileRef.current?.click()}>
                Cargar Excel al Sheet
              </Button>
            </>
          ) : undefined
        }
      />
      {canWrite && (
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onFile(file)
            event.target.value = ''
          }}
        />
      )}

      {legacyOffer && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <p className="text-sm">Hay datos guardados en este navegador</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => void onUploadLegacy()}>
              Subirlos
            </Button>
            <Button variant="ghost" size="lg" disabled={busy} onClick={dismissLegacy}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-4 rounded-xl bg-success-soft px-4 py-2 text-sm text-success">{message}</p>
      )}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <ListBox
        className="mt-6"
        counters={[
          {
            key: 'lista',
            label: 'Lista',
            count: filteredOpenOrders.length,
            active: mode === 'lista',
            onClick: () => setMode('lista'),
          },
          {
            key: 'picking',
            label: 'Picking',
            count: groups.length,
            active: mode === 'picking',
            onClick: () => setMode('picking'),
          },
        ]}
        filters={
          <FilterBar
            size="lg"
            search={{
              value: searchDraft,
              label: 'Buscar',
              srOnly: true,
              placeholder: 'Número, cliente, comprobante o teléfono',
              onChange: setSearchDraft,
              onSubmit: (value) => {
                setSearchDraft(value)
                patchParams({ q: value.trim() || null })
              },
            }}
            chips={[
              {
                id: 'estado',
                label: 'Estado',
                value: statusFilter,
                options: STATUS_CHIPS,
                onChange: (value) => patchParams({ estado: value }),
              },
              {
                id: 'fecha',
                label: 'Fecha',
                value: fechaFilter,
                options: FECHA_CHIPS,
                onChange: (value) => patchParams({ fecha: value }),
              },
            ]}
            selects={[
              {
                id: 'vendedor',
                label: 'Vendedor',
                value: isVendedor ? lockedSeller : seller || 'todos',
                disabled: isVendedor,
                onChange: (value) => patchParams({ vendedor: value }),
                options: isVendedor
                  ? [{ value: lockedSeller, label: lockedSeller || 'Sin vendedor asignado' }]
                  : [{ value: 'todos', label: 'Todos' }, ...sellers.map((name) => ({ value: name, label: name }))],
              },
            ]}
            activeCount={
              (searchApplied.trim() || searchDraft.trim() ? 1 : 0) +
              (statusFilter !== 'todos' ? 1 : 0) +
              (fechaFilter !== 'semana' ? 1 : 0) +
              (!isVendedor && seller !== 'todos' ? 1 : 0)
            }
            onClear={() => {
              setSearchDraft('')
              patchParams({ q: null, estado: null, fecha: null, vendedor: null })
            }}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <p className="text-sm text-muted">
            {mode === 'lista'
              ? `${filteredOpenOrders.length} pedidos · ${filteredOrphans.length} sin pedido`
              : `${filteredLines.length} de ${lines.length} filas`}
          </p>
          {mode === 'lista' && (
            <>
              <Button
                variant="ghost"
                size="lg"
                disabled={busy || loading}
                onClick={() => {
                  void refresh().then((count) => {
                    setMessage(
                      count === 0
                        ? 'Todavía no hay filas de picking.'
                        : `Lista actualizada: ${count} filas.`,
                    )
                  })
                }}
              >
                Actualizar lista
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={filteredOpenOrders.length === 0 && orphanGroups.length === 0}
                onClick={exportFilteredCsv}
              >
                Exportar CSV
              </Button>
            </>
          )}
          <Button variant="ghost" size="lg" onClick={openAllData}>
            Ver todos los datos
          </Button>
        </div>

        {mode === 'lista' ? (
          filteredOpenOrders.length === 0 && orphanGroups.length === 0 ? (
            <EmptyState
              variant="plain"
              title={
                openOrders.length === 0 && orphanLines.length === 0
                  ? 'No hay pedidos pendientes'
                  : 'Ningún pedido coincide con el filtro.'
              }
            />
          ) : (
            <>
              {filteredOpenOrders.length > 0 && lines.length === 0 && (
                <EmptyState
                  variant="plain"
                  title="Todavía no se importó el Excel de picking"
                  action={
                    canWrite ? (
                      <Button
                        variant="primary"
                        size="lg"
                        disabled={busy}
                        onClick={() => fileRef.current?.click()}
                      >
                        Cargar Excel al Sheet
                      </Button>
                    ) : undefined
                  }
                />
              )}
              {filteredOpenOrders.length > 0 && (
                <>
                  <div className="hidden lg:block">
                    <Table
                      bare
                      columns={listaColumns}
                      rows={filteredOpenOrders}
                      rowKey={(order) => order.id}
                      onRowClick={(order) => openPedido(order.id)}
                    />
                  </div>
                  <div className="flex flex-col lg:hidden">
                    {filteredOpenOrders.map((order) => (
                      <article
                        key={order.id}
                        className="cursor-pointer border-b border-border px-4 py-3 last:border-b-0"
                        onClick={() => openPedido(order.id)}
                      >
                        <button
                          type="button"
                          className="rounded-md font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(event) => {
                            event.stopPropagation()
                            openPedido(order.id)
                          }}
                        >
                          N° {order.id}
                        </button>
                        <p className="mt-1 font-semibold">{order.client}</p>
                        <div className="mt-2">
                          <Badge tone={statusTone(order.status)}>{statusPillFor(order, order.status)}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="lg"
                          className="mt-3"
                          onClick={(event) => {
                            event.stopPropagation()
                            openPedido(order.id)
                          }}
                        >
                          Ver pedido
                        </Button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {orphanGroups.length > 0 && (
                <section className="px-4 py-4">
                  <h2 className="text-sm font-semibold text-text">Filas sin pedido</h2>
                  <div className="mt-2 overflow-hidden rounded-md border border-border">
                    {orphanGroups.map((group) => {
                      const progress = progressOf(group)
                      return (
                        <button
                          key={group.key}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-2"
                          onClick={() => openGrupo(group.key)}
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold">
                              {group.invoice} — {group.client}
                            </span>
                            {subtitle(group) ? (
                              <span className="mt-1 block text-sm text-muted">{subtitle(group)}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted">
                            {progress.readyToPrepare ? 'Listo' : `${progress.pct}%`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )
        ) : groups.length === 0 ? (
          <EmptyState
            variant="plain"
            title={
              lines.length === 0
                ? 'No hay productos para preparar.'
                : 'Ningún pedido coincide con la búsqueda.'
            }
          />
        ) : (
          <>
            <p className="border-b border-border px-4 py-3 text-sm text-muted">
              Sin URL de Clanbox configurada — configurala en Configuración para ver stock real.
            </p>
            <div className="hidden lg:block">
              <Table
                bare
                columns={pickingColumns}
                rows={groups}
                rowKey={(group) => group.key}
                onRowClick={(group) => openGrupo(group.key)}
              />
            </div>
            <div className="flex flex-col lg:hidden">
              {groups.map((group) => {
                const progress = progressOf(group)
                return (
                  <article
                    key={group.key}
                    className="cursor-pointer border-b border-border px-4 py-3 last:border-b-0"
                    onClick={() => openGrupo(group.key)}
                  >
                    <p className="font-semibold">
                      {group.invoice} — {group.client}
                    </p>
                    {subtitle(group) ? <p className="mt-1 text-sm text-muted">{subtitle(group)}</p> : null}
                    <p className="mt-1 text-sm tabular-nums text-muted">
                      {progress.readyToPrepare ? 'Listo' : `${progress.pct}%`}
                    </p>
                    <Button
                      variant="ghost"
                      size="lg"
                      className="mt-3"
                      onClick={(event) => {
                        event.stopPropagation()
                        openGrupo(group.key)
                      }}
                    >
                      Ver detalle
                    </Button>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </ListBox>

      <Drawer
        open={Boolean(openOrder) && !grupoId}
        onClose={closeFromList}
        title={openOrder?.id ?? 'Pedido'}
        subtitle={openOrder ? openOrder.client.toUpperCase() : undefined}
        footer={
          openOrder ? (
            <div className="flex w-full flex-col gap-2">
              {(() => {
                const orderLines = linesByOpenOrder.map.get(openOrder.id) ?? []
                const hasPicking = orderLines.length > 0
                const prepareGroup = hasPicking
                  ? groupForOrder(openOrder, linesForOrder(linesByInvoice, openOrder))
                  : null
                return (
                  <>
                    {hasPicking && prepareGroup ? prepareBlock(prepareGroup) : null}
                    {!hasPicking && user && canWrite ? (
                      <OrderFlowButtons
                        order={openOrder}
                        role={user.role}
                        via="picking"
                        busy={flowBusy}
                        onBusy={setFlowBusy}
                        transition={transitionOrder}
                        layout="compact"
                      />
                    ) : null}
                    {hasPicking ? (
                      <Button
                        variant="ghost"
                        size="lg"
                        onClick={() =>
                          openDetail(
                            normalizeInvoiceKey(orderLines[0]?.invoice ?? '') || openOrder.id,
                          )
                        }
                      >
                        Ver detalle
                      </Button>
                    ) : null}
                  </>
                )
              })()}
            </div>
          ) : null
        }
      >
        {openOrder ? <OrderDetail order={openOrder} compact /> : null}
      </Drawer>

      <Drawer
        open={Boolean(openGroup)}
        onClose={closeFromList}
        title={openGroup ? `${openGroup.invoice} — ${openGroup.client}` : 'Picking'}
        subtitle={openGroup ? subtitle(openGroup) : undefined}
        footer={openGroup ? prepareBlock(openGroup) : null}
      >
        {openGroup ? (
          <div className="flex flex-col gap-3">
            <OrderLinkBlock link={openGroup.link} />
            <GroupPickingSummary group={openGroup} />
            <div className="flex flex-col gap-2">
              {openGroup.lines.map((line) => {
                const complete = isLineComplete(line)
                const prepared = line.status === 'preparado'
                const saving = savingId === line.id
                return (
                  <div
                    key={line.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3 ${
                      complete ? 'bg-success-soft' : 'bg-surface'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{line.product}</p>
                      <p className="text-sm text-muted">Cantidad pedida: {line.quantity}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {canWrite ? (
                        <>
                          <label className="text-sm">
                            <span className="sr-only">Cantidad pickeada</span>
                            <input
                              type="number"
                              min={0}
                              max={line.quantity}
                              step={1}
                              value={qtyDraftFor(line)}
                              disabled={prepared || saving}
                              className="w-20 rounded-xl border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-60"
                              onChange={(event) => setQtyDraft(line.id, event.target.value)}
                              onBlur={() => void savePickedQty(line, qtyDraftFor(line))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  ;(event.target as HTMLInputElement).blur()
                                }
                              }}
                            />
                          </label>
                          <Button
                            variant="secondary"
                            size="lg"
                            disabled={prepared || complete || saving}
                            onClick={() => void markComplete(line)}
                          >
                            Completo
                          </Button>
                        </>
                      ) : (
                        <p className="text-sm text-muted">
                          {pickedOf(line)} / {line.quantity}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Drawer>

      {preview && (
        <Modal
          onClose={() => {
            if (busy) return
            setPreview(null)
          }}
          labelledBy="picking-preview-title"
          className="grid place-items-center bg-overlay p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="picking-preview-title" className="text-xl font-semibold">
                  Vista previa de importación
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {preview.valid.length} válidas · {preview.discarded.length} descartadas ·{' '}
                  {preview.valid.filter((row) => row.combinedFrom > 1).length} combinadas
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm">
                  Modo
                  <Select
                    className="mt-1"
                    size="lg"
                    value={importMode}
                    onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  >
                    <option value="merge">Combinar</option>
                    <option value="replace">Reemplazar todo</option>
                  </Select>
                </label>
                <Button variant="ghost" size="lg" disabled={busy} onClick={() => setPreview(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busy || preview.valid.length === 0}
                  onClick={() => void confirmImport()}
                >
                  Confirmar importación
                </Button>
              </div>
            </div>
            {preview.valid.length > 0 && (
              <div className="mt-4 min-h-0">
                <Table
                  maxHeight="60vh"
                  columns={previewColumns}
                  rows={preview.valid}
                  rowKey={(row) => `${row.comprobante}-${row.articulo}-${row.excelRows.join('-')}`}
                />
              </div>
            )}
            {preview.discarded.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-text">Filas descartadas</h3>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
                  {preview.discarded.map((row) => (
                    <li key={`${row.excelRow}-${row.message}`}>
                      Fila {row.excelRow}: {row.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showAllData && (
        <Modal
          onClose={() => setShowAllData(false)}
          labelledBy="picking-all-data-title"
          className="grid place-items-center bg-overlay p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="picking-all-data-title" className="text-xl font-semibold">
                  Todos los datos
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {filteredLines.length} filas filtradas · columnas de raw y campos del picking
                </p>
                {modalTruncated && (
                  <p className="mt-1 text-sm text-muted">
                    Mostrando {MODAL_ROW_LIMIT} de {filteredLines.length}; el CSV exporta todas
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={visibleColumns.length === 0}
                  onClick={() => downloadCsv(filteredLines, visibleColumns)}
                >
                  Exportar CSV
                </Button>
                <Button variant="ghost" size="lg" onClick={() => setShowAllData(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
            <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-auto">
              {dataColumns.map((column) => {
                const active = visibleColumnIds.includes(column.id)
                return (
                  <button
                    key={column.id}
                    type="button"
                    className={active ? 'zone-chip active' : 'zone-chip'}
                    aria-pressed={active}
                    onClick={() => toggleColumn(column.id)}
                  >
                    {column.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 min-h-0">
              {filteredLines.length === 0 ? (
                <EmptyState variant="plain" title="Ninguna fila coincide con el filtro." />
              ) : visibleColumns.length === 0 ? (
                <EmptyState variant="plain" title="Elegí al menos una columna para ver la tabla." />
              ) : (
                <Table
                  maxHeight="60vh"
                  columns={visibleColumns.map((column) => ({
                    key: column.id,
                    header: column.label,
                    cell: (line: PickingLine) => cellValue(line, column.id) || '—',
                  }))}
                  rows={modalLines}
                  rowKey={(line) => line.id}
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </Page>
  )
}
