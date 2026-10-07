import { useMemo, useRef, useState } from 'react'
import { ServerDown, Spinner } from '../components/LoadState'
import { parsePickingWorkbook, type PickingLine } from '../lib/pickingSheet'
import type { PickingBatchRow } from '../lib/pickingApi'
import { usePicking } from '../state/PickingContext'

type Mode = 'lista' | 'picking'
type Estado = 'todos' | 'completo' | 'en-curso' | 'pendiente'

type PickingOrder = {
  key: string
  invoice: string
  client: string
  seller: string
  date?: string
  lines: PickingLine[]
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

function matchesEstado(pct: number, estado: Estado) {
  if (estado === 'completo') return pct === 100
  if (estado === 'pendiente') return pct === 0
  if (estado === 'en-curso') return pct > 0 && pct < 100
  return true
}

function subtitle(order: PickingOrder, ready: number, total: number) {
  return [order.seller, 'Luminocity', order.date, `${ready}/${total} productos listos`]
    .filter(Boolean)
    .join(' · ')
}

function batchFromLine(line: PickingLine): PickingBatchRow {
  return {
    cliente: line.client,
    comprobante: line.invoice,
    articulo: line.product,
    cantidad: line.quantity,
    vendedor: line.seller,
    raw: line.raw ?? {
      Factura: line.invoice,
      Cliente: line.client,
      Vendedor: line.seller,
      Producto: line.product,
      Cantidad: line.quantity,
    },
  }
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
  const [estado, setEstado] = useState<Estado>('todos')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const orders = useMemo(() => groupLines(lines), [lines])
  const sellers = useMemo(
    () => [...new Set(orders.map((order) => order.seller).filter(Boolean))].sort(),
    [orders],
  )

  const needle = query.trim().toLowerCase()
  const visible = orders.filter((order) => {
    const progress = progressOf(order)
    if (mode === 'lista' && seller !== 'todos' && order.seller !== seller) return false
    if (mode === 'lista' && !matchesEstado(progress.pct, estado)) return false
    if (!needle) return true
    return (
      order.client.toLowerCase().includes(needle) || order.invoice.toLowerCase().includes(needle)
    )
  })

  async function onFile(file: File) {
    setError('')
    setBusy(true)
    try {
      const loaded = parsePickingWorkbook(await file.arrayBuffer())
      const result = await applyBatch('replace', loaded.map(batchFromLine))
      if (!result.ok) {
        setError(result.message)
        return
      }
      setExpanded(null)
      setMessage(
        `Importación: ${result.created} creadas, ${result.updated} actualizadas, ${result.removed} borradas.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el archivo.')
    } finally {
      setBusy(false)
    }
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
        <button
          type="button"
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm shadow-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Cargar Excel al Sheet
        </button>
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

      {mode === 'lista' ? (
        <>
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
            >
              <label className="text-sm">
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
              <label className="text-sm">
                Estado
                <select
                  value={estado}
                  onChange={(event) => setEstado(event.target.value as Estado)}
                  className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en-curso">En curso</option>
                  <option value="completo">Completo</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              Buscar por cliente o factura
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre del cliente o N° de factura"
                className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
              />
            </label>
          </div>

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

          {visible.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'Cargá un Excel con las columnas Factura, Cliente, Vendedor, Producto y Cantidad.'
                : 'Ningún pedido coincide con el filtro.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {visible.map((order) => {
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por factura o cliente..."
              className="min-w-0 flex-1 rounded-xl border border-lumi-line bg-white px-3 py-2 text-sm"
            />
            <p className="text-sm text-lumi-muted">
              Sin URL de Clanbox configurada — configurala en Configuración para ver stock real.
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
              {lines.length === 0
                ? 'No hay productos para preparar.'
                : 'Ningún pedido coincide con la búsqueda.'}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {visible.map((order) => {
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
    </section>
  )
}
