import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { OrderStepper } from '../components/OrderStepper'
import { ServerDown, Spinner } from '../components/LoadState'
import { STATUS_PILL, type Order } from '../data/orders'
import { askPackages, confirm, error as showError, success } from '../lib/alerts'
import { buildCsv, downloadCsvFile } from '../lib/csv'
import {
  matchOrdersByInvoice,
  normalizeInvoiceKey,
  type InvoiceMatch,
} from '../lib/invoiceKey'
import type { PickingStatus } from '../lib/pickingApi'
import {
  batchRowsFromPreview,
  pickingTemplateCsv,
  previewPickingWorkbook,
  type PickingLine,
  type PickingPreview,
} from '../lib/pickingSheet'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { usePicking } from '../state/PickingContext'

const ORDER_LINK_BATCH = 50

const MODAL_ROW_LIMIT = 500

type Mode = 'lista' | 'picking'
type StatusFilter = 'todos' | PickingStatus | 'sin_pedido'
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
  { value: 'en_preparacion', label: 'En preparación' },
  { value: 'preparado', label: 'Preparado' },
  { value: 'sin_pedido', label: 'Sin pedido' },
]

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
  if (line.product.toLowerCase().includes(needle)) return true
  if (line.seller.toLowerCase().includes(needle)) return true
  if (line.raw) {
    for (const value of Object.values(line.raw)) {
      if (String(value).toLowerCase().includes(needle)) return true
    }
  }
  return false
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

function progressOf(group: PickingGroup) {
  const total = group.lines.length
  const complete = group.lines.filter(isLineComplete).length
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100)
  const missing = group.lines
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

function subtitle(group: PickingGroup) {
  return [group.seller, 'Luminocity', group.date].filter(Boolean).join(' · ')
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
    return <p className="mt-2 text-sm text-lumi-muted">Comprobante en varios pedidos</p>
  }
  return <p className="mt-2 text-sm text-lumi-muted">Sin pedido</p>
}

function GroupPickingSummary({ group }: { group: PickingGroup }) {
  const progress = progressOf(group)
  return (
    <div className="mt-2 text-sm">
      <p>
        {progress.complete} de {progress.total} artículos completos
      </p>
      {progress.readyToPrepare ? (
        <p className="mt-1 font-medium text-[#1d7a3a]">Listo para preparar</p>
      ) : progress.missing.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-lumi-muted">
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
  const { orders: pedidos, transitionOrder } = useOrders()
  const {
    lines,
    loading,
    error: loadError,
    legacyOffer,
    refresh,
    patchLine,
    uploadLegacy,
    dismissLegacy,
    applyBatch,
  } = usePicking()
  const canLinkOrders = user?.role === 'encargado_deposito' || user?.role === 'admin'
  const fileRef = useRef<HTMLInputElement>(null)
  const linkingRef = useRef(new Set<string>())
  const [mode, setMode] = useState<Mode>('lista')
  const [seller, setSeller] = useState('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
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

  const sellers = useMemo(
    () => [...new Set(lines.map((line) => line.seller).filter(Boolean))].sort(),
    [lines],
  )

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

  const filteredLines = useMemo(() => {
    const needle = searchApplied.trim().toLowerCase()
    return lines.filter((line) => {
      if (statusFilter === 'sin_pedido') {
        if (matchOrdersByInvoice(pedidos, line.invoice).kind !== 'none') return false
      } else if (statusFilter !== 'todos' && lineStatus(line) !== statusFilter) {
        return false
      }
      if (mode === 'lista' && seller !== 'todos' && line.seller !== seller) return false
      return matchesSearch(line, needle)
    })
  }, [lines, mode, pedidos, searchApplied, seller, statusFilter])

  const groups = useMemo(() => groupLines(filteredLines, pedidos), [filteredLines, pedidos])
  const dataColumns = useMemo(() => columnsFromLines(filteredLines), [filteredLines])
  const visibleColumns = dataColumns.filter((column) => visibleColumnIds.includes(column.id))
  const modalLines = filteredLines.slice(0, MODAL_ROW_LIMIT)
  const modalTruncated = filteredLines.length > MODAL_ROW_LIMIT

  useEffect(() => {
    if (!showAllData) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowAllData(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAllData])

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

  function applySearch() {
    setSearchApplied(searchDraft)
  }

  function clearSearch() {
    setSearchDraft('')
    setSearchApplied('')
  }

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
    setExpanded(null)
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
    if (group.link.kind !== 'one') return null
    const order = group.link.order
    if (
      order.status === 'asignado' ||
      order.status === 'en-viaje' ||
      order.status === 'entregado'
    ) {
      return (
        <p className="mt-2 text-sm text-lumi-muted">
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
          <p className="mt-2 text-sm text-lumi-muted">
            Faltan filas de otro comprobante del pedido
          </p>
        )
      }
      return null
    }

    return (
      <button
        type="button"
        className="mt-2 rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
        disabled={preparingKey === group.key || busy}
        onClick={() => void markOrderPrepared(group)}
      >
        {order.status === 'preparado' ? 'Marcar filas preparadas' : 'Marcar preparado'}
      </button>
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

  function openDetail(key: string) {
    setMode('picking')
    setExpanded(key)
  }

  if (loading && lines.length === 0) {
    return (
      <section className="page">
        <Spinner label="Cargando picking…" />
      </section>
    )
  }

  if (loadError && lines.length === 0) {
    return (
      <section className="page">
        <ServerDown message={loadError} onRetry={() => void refresh()} />
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header row">
        <div>
          <h1>Pendientes de Entregas</h1>
          <p>Lista de pedidos y modo picking con stock de Clanbox</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-lumi-line bg-white px-4 py-2 text-sm shadow-sm"
            onClick={downloadTemplate}
          >
            Descargar plantilla
          </button>
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Cargar Excel al Sheet
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onFile(file)
            event.target.value = ''
          }}
        />
      </header>

      <div className="mt-6 flex gap-1 border-b border-lumi-line">
        {(['lista', 'picking'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`border-b-2 px-3 py-2 text-sm ${
              mode === item
                ? 'border-lumi-yellow font-semibold text-lumi-ink'
                : 'border-transparent text-lumi-muted'
            }`}
            onClick={() => setMode(item)}
          >
            {item === 'lista' ? 'Lista' : 'Picking'}
          </button>
        ))}
      </div>

      {legacyOffer && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <p className="text-sm">Hay datos guardados en este navegador</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => void onUploadLegacy()}
            >
              Subirlos
            </button>
            <button
              type="button"
              className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={dismissLegacy}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="mt-4 rounded-xl bg-[#e5f6ea] px-4 py-2 text-sm text-[#1d7a3a]">{message}</p>
      )}
      {error && <p className="mt-4 text-sm text-lumi-danger">{error}</p>}

      {preview && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Vista previa de importación</h2>
              <p className="mt-1 text-sm text-lumi-muted">
                {preview.valid.length} válidas · {preview.discarded.length} descartadas ·{' '}
                {preview.valid.filter((row) => row.combinedFrom > 1).length} combinadas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                Modo
                <select
                  value={importMode}
                  onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  className="ml-2 rounded-xl border border-lumi-line px-3 py-1.5"
                >
                  <option value="merge">Combinar</option>
                  <option value="replace">Reemplazar todo</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
                disabled={busy || preview.valid.length === 0}
                onClick={() => void confirmImport()}
              >
                Confirmar importación
              </button>
            </div>
          </div>

          {preview.valid.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-lumi-line text-lumi-muted">
                    <th className="px-2 py-2 font-medium">Fila</th>
                    <th className="px-2 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">Comprobante</th>
                    <th className="px-2 py-2 font-medium">Artículo</th>
                    <th className="px-2 py-2 font-medium">Cantidad</th>
                    <th className="px-2 py-2 font-medium">Vendedor</th>
                    <th className="px-2 py-2 font-medium">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.map((row) => (
                    <tr key={`${row.comprobante}-${row.articulo}-${row.excelRows.join('-')}`} className="border-b border-lumi-line/70">
                      <td className="px-2 py-2">{row.excelRows.join(', ')}</td>
                      <td className="px-2 py-2">{row.cliente}</td>
                      <td className="px-2 py-2">{row.comprobante}</td>
                      <td className="px-2 py-2">{row.articulo}</td>
                      <td className="px-2 py-2">{row.cantidad}</td>
                      <td className="px-2 py-2">{row.vendedor || '—'}</td>
                      <td className="px-2 py-2 text-lumi-muted">
                        {row.combinedFrom > 1 ? `${row.combinedFrom} filas combinadas` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.discarded.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Filas descartadas</h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-lumi-danger">
                {preview.discarded.map((row) => (
                  <li key={`${row.excelRow}-${row.message}`}>
                    Fila {row.excelRow}: {row.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-0 flex-1 text-sm">
            <span className="sr-only">Buscar</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applySearch()
                }
              }}
              placeholder="Cliente, comprobante, artículo, vendedor o dato del Excel"
              className="w-full rounded-xl border border-lumi-line px-3 py-2"
            />
          </label>
          <button
            type="button"
            className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink"
            onClick={applySearch}
          >
            Buscar
          </button>
          {(searchDraft || searchApplied) && (
            <button
              type="button"
              className="rounded-xl border border-lumi-line px-3 py-2 text-sm"
              aria-label="Limpiar búsqueda"
              onClick={clearSearch}
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={statusFilter === chip.value ? 'zone-chip active' : 'zone-chip'}
              aria-pressed={statusFilter === chip.value}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.label}
            </button>
          ))}
          <p className="ml-auto text-sm text-lumi-muted">
            {filteredLines.length} de {lines.length} filas
          </p>
          <button
            type="button"
            className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm"
            onClick={openAllData}
          >
            Ver todos los datos
          </button>
        </div>
        {mode === 'lista' && (
          <label className="mt-3 block text-sm">
            Vendedor
            <select
              value={seller}
              onChange={(event) => setSeller(event.target.value)}
              className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
            >
              <option value="todos">Todos los vendedores</option>
              {sellers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mode === 'lista' ? (
        <>
          <button
            type="button"
            className="mt-3 rounded-xl px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
            disabled={busy || loading}
            onClick={() => {
              void refresh().then(() => {
                setMessage(lines.length === 0 ? 'Todavía no hay filas de picking.' : 'Lista actualizada.')
              })
            }}
          >
            Actualizar lista
          </button>

          {groups.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'Cargá un Excel con las columnas Factura, Cliente, Vendedor, Producto y Cantidad.'
                : 'Ningún pedido coincide con el filtro.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {groups.map((group) => {
                const progress = progressOf(group)
                return (
                  <article key={group.key} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {group.invoice} — {group.client}
                        </p>
                        {subtitle(group) && (
                          <p className="mt-1 text-sm text-lumi-muted">{subtitle(group)}</p>
                        )}
                        <OrderLinkBlock link={group.link} />
                        <GroupPickingSummary group={group} />
                        {prepareBlock(group)}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-[#efeae0]"
                          style={{ width: 96 }}
                        >
                          <div
                            className="h-full bg-lumi-yellow"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                        {progress.readyToPrepare ? (
                          <span className="rounded-full bg-[#e5f6ea] px-2 py-0.5 text-xs font-medium text-[#1d7a3a]">
                            Listo
                          </span>
                        ) : (
                          <span className="text-xs text-lumi-muted">{progress.pct}%</span>
                        )}
                        <button
                          type="button"
                          className="text-sm hover:underline"
                          onClick={() => openDetail(group.key)}
                        >
                          Ver detalle
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-lumi-muted">
            Sin URL de Clanbox configurada — configurala en Configuración para ver stock real.
          </p>

          {groups.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'No hay productos para preparar.'
                : 'Ningún pedido coincide con la búsqueda.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {groups.map((group) => {
                const progress = progressOf(group)
                const open = expanded === group.key
                return (
                  <article key={group.key} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className="border-b border-lumi-line px-4 py-3">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 text-left"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : group.key)}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {group.invoice} — {group.client}
                          </span>
                          {subtitle(group) && (
                            <span className="mt-1 block text-sm text-lumi-muted">{subtitle(group)}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span
                            className="h-1.5 overflow-hidden rounded-full bg-[#efeae0]"
                            style={{ width: 96 }}
                          >
                            <span
                              className="block h-full bg-lumi-yellow"
                              style={{ width: `${progress.pct}%` }}
                            />
                          </span>
                          <span className="text-xs text-lumi-muted">
                            {progress.readyToPrepare ? 'Listo' : `${progress.pct}%`}
                          </span>
                          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                        </span>
                      </button>
                      <OrderLinkBlock link={group.link} />
                      <GroupPickingSummary group={group} />
                      {prepareBlock(group)}
                    </div>
                    {open && (
                      <div className="flex flex-col gap-2 px-4 py-3">
                        {group.lines.map((line) => {
                          const complete = isLineComplete(line)
                          const prepared = line.status === 'preparado'
                          const saving = savingId === line.id
                          return (
                            <div
                              key={line.id}
                              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 ${
                                complete ? 'bg-[#e5f6ea]' : 'bg-[#f7f4ea]'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-medium">{line.product}</p>
                                <p className="text-sm text-lumi-muted">
                                  Cantidad pedida: {line.quantity}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <label className="text-sm">
                                  <span className="sr-only">Cantidad pickeada</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={line.quantity}
                                    step={1}
                                    value={qtyDraftFor(line)}
                                    disabled={prepared || saving}
                                    className="w-20 rounded-xl border border-lumi-line bg-white px-2 py-1.5 text-sm disabled:opacity-60"
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
                                <button
                                  type="button"
                                  className="rounded-xl border border-lumi-line bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                                  disabled={prepared || complete || saving}
                                  onClick={() => void markComplete(line)}
                                >
                                  Completo
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      {showAllData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="picking-all-data-title"
          className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white p-4 shadow-lg sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="picking-all-data-title" className="text-xl font-semibold">
                  Todos los datos
                </h2>
                <p className="mt-1 text-sm text-lumi-muted">
                  {filteredLines.length} filas filtradas · columnas de raw y campos del picking
                </p>
                {modalTruncated && (
                  <p className="mt-1 text-sm text-lumi-muted">
                    Mostrando {MODAL_ROW_LIMIT} de {filteredLines.length}; el CSV exporta todas
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-lumi-yellow px-3 py-1.5 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
                  disabled={visibleColumns.length === 0}
                  onClick={() => downloadCsv(filteredLines, visibleColumns)}
                >
                  Exportar CSV
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-lumi-line px-3 py-1.5 text-sm"
                  onClick={() => setShowAllData(false)}
                >
                  Cerrar
                </button>
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

            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              {filteredLines.length === 0 ? (
                <p className="py-8 text-center text-sm text-lumi-muted">
                  Ninguna fila coincide con el filtro.
                </p>
              ) : visibleColumns.length === 0 ? (
                <p className="py-8 text-center text-sm text-lumi-muted">
                  Elegí al menos una columna para ver la tabla.
                </p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-lumi-line text-lumi-muted">
                      {visibleColumns.map((column) => (
                        <th key={column.id} className="whitespace-nowrap px-2 py-2 font-medium">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modalLines.map((line) => (
                      <tr key={line.id} className="border-b border-lumi-line/70">
                        {visibleColumns.map((column) => (
                          <td key={column.id} className="whitespace-nowrap px-2 py-2">
                            {cellValue(line, column.id) || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
