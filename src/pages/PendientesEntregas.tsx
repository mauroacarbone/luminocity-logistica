import { useMemo, useRef, useState } from 'react'
import { ServerDown, Spinner } from '../components/LoadState'
import { confirm } from '../lib/alerts'
import type { PickingStatus } from '../lib/pickingApi'
import {
  batchRowsFromPreview,
  pickingTemplateCsv,
  previewPickingWorkbook,
  type PickingLine,
  type PickingPreview,
} from '../lib/pickingSheet'
import { usePicking } from '../state/PickingContext'

type Mode = 'lista' | 'picking'
type StatusFilter = 'todos' | PickingStatus
type ImportMode = 'replace' | 'merge'

type PickingOrder = {
  key: string
  invoice: string
  client: string
  seller: string
  date?: string
  lines: PickingLine[]
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_preparacion', label: 'En preparación' },
  { value: 'preparado', label: 'Preparado' },
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

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
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
  const header = columns.map((column) => escapeCsv(column.label)).join(',')
  const body = rows.map((line) =>
    columns.map((column) => escapeCsv(cellValue(line, column.id))).join(','),
  )
  const blob = new Blob([[header, ...body].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'picking-datos.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function groupLines(lines: PickingLine[]) {
  const groups = new Map<string, PickingOrder>()
  for (const line of lines) {
    const key = `${line.invoice}::${line.client}`
    const current = groups.get(key)
    if (current) {
      current.lines.push(line)
      if (!current.date && line.date) current.date = line.date
      if (!current.seller && line.seller) current.seller = line.seller
    } else {
      groups.set(key, {
        key,
        invoice: line.invoice,
        client: line.client,
        seller: line.seller,
        date: line.date,
        lines: [line],
      })
    }
  }
  return [...groups.values()]
}

function progressOf(order: PickingOrder) {
  const ready = order.lines.filter((line) => line.ready).length
  const total = order.lines.length
  const pct = total === 0 ? 0 : Math.round((ready / total) * 100)
  return { ready, total, pct }
}

function subtitle(order: PickingOrder, ready: number, total: number) {
  return [order.seller, 'Luminocity', order.date, `${ready}/${total} productos listos`]
    .filter(Boolean)
    .join(' · ')
}

function downloadTemplate() {
  const blob = new Blob([pickingTemplateCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-picking.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function PendientesEntregas() {
  const {
    lines,
    loading,
    error: loadError,
    legacyOffer,
    refresh,
    toggleLine,
    uploadLegacy,
    dismissLegacy,
    applyBatch,
  } = usePicking()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('lista')
  const [seller, setSeller] = useState('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
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

  const filteredLines = useMemo(() => {
    const needle = searchApplied.trim().toLowerCase()
    return lines.filter((line) => {
      if (statusFilter !== 'todos' && lineStatus(line) !== statusFilter) return false
      if (mode === 'lista' && seller !== 'todos' && line.seller !== seller) return false
      return matchesSearch(line, needle)
    })
  }, [lines, mode, searchApplied, seller, statusFilter])

  const orders = useMemo(() => groupLines(filteredLines), [filteredLines])
  const dataColumns = useMemo(() => columnsFromLines(filteredLines), [filteredLines])
  const visibleColumns = dataColumns.filter((column) => visibleColumnIds.includes(column.id))

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

  async function onToggle(id: string) {
    setError('')
    const result = await toggleLine(id)
    if (!result.ok) setError(result.message)
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

          {orders.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'Cargá un Excel con las columnas Factura, Cliente, Vendedor, Producto y Cantidad.'
                : 'Ningún pedido coincide con el filtro.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {orders.map((order) => {
                const progress = progressOf(order)
                return (
                  <article key={order.key} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {order.invoice} — {order.client}
                        </p>
                        <p className="mt-1 text-sm text-lumi-muted">
                          {subtitle(order, progress.ready, progress.total)}
                        </p>
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
                        {progress.pct === 100 ? (
                          <span className="rounded-full bg-[#e5f6ea] px-2 py-0.5 text-xs font-medium text-[#1d7a3a]">
                            Completo
                          </span>
                        ) : (
                          <span className="text-xs text-lumi-muted">{progress.pct}%</span>
                        )}
                        <button
                          type="button"
                          className="text-sm hover:underline"
                          onClick={() => openDetail(order.key)}
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

          {orders.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'No hay productos para preparar.'
                : 'Ningún pedido coincide con la búsqueda.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {orders.map((order) => {
                const progress = progressOf(order)
                const open = expanded === order.key
                return (
                  <article key={order.key} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : order.key)}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">
                          {order.invoice} — {order.client}
                        </span>
                        <span className="mt-1 block text-sm text-lumi-muted">
                          {subtitle(order, progress.ready, progress.total)}
                        </span>
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
                          {progress.pct === 100 ? 'Completo' : `${progress.pct}%`}
                        </span>
                        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                      </span>
                    </button>
                    {open && (
                      <div className="flex flex-col gap-2 border-t border-lumi-line px-4 py-3">
                        {order.lines.map((line) => (
                          <div
                            key={line.id}
                            className={`flex items-center justify-between gap-4 rounded-xl px-3 py-3 ${
                              line.ready ? 'bg-[#e5f6ea]' : 'bg-[#f7f4ea]'
                            }`}
                          >
                            <div>
                              <p className="font-medium">{line.product}</p>
                              <p className="text-sm text-lumi-muted">
                                Cantidad pedida: {line.quantity}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={`shrink-0 text-sm font-medium disabled:opacity-50 ${
                                line.ready ? 'text-[#1d7a3a]' : 'text-lumi-muted'
                              }`}
                              aria-pressed={line.ready}
                              disabled={busy}
                              onClick={() => void onToggle(line.id)}
                            >
                              {line.ready ? '✓ Listo' : 'Pendiente'}
                            </button>
                          </div>
                        ))}
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

            <div className="mt-3 flex flex-wrap gap-2">
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
                    {filteredLines.map((line) => (
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
