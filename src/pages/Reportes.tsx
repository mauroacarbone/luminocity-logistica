import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { ServerDown } from '../components/LoadState'
import { Badge, Button, Drawer, EmptyState, FilterBar, Input, KpiCard, ListBox, Page, PageHeader, Spinner, Table } from '../components/ui'
import { STATUS_PILL, type OrderStatus } from '../data/orders'
import { canOpen } from '../lib/access'
import { downloadCsvFile, toCsv } from '../lib/csv'
import { buildReportModel, cellText, sectionCsv, type ModelRow, type ReportModel, type ReportSectionModel, type ReportSource } from '../lib/reportModel'
import { businessOffset, businessToday } from '../lib/schedule'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { getClaimsReport, getDeliveriesReport, getDriversReport, getPickupsReport } from '../lib/reportsApi'

type Preset = 'hoy' | '7' | 'mes' | 'anterior' | 'personalizado'

type ReportData = ReportSource

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'anterior', label: 'Mes anterior' },
  { value: 'personalizado', label: 'Personalizado' },
]

function iso(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1))
  const end = new Date(Date.UTC(year, monthIndex + 1, 0))
  return { from: iso(start), to: iso(end) }
}

function rangeFor(preset: Exclude<Preset, 'personalizado'>) {
  const today = businessToday()
  const [year, month] = today.split('-').map(Number)
  if (preset === 'hoy') return { from: today, to: today }
  if (preset === '7') return { from: businessOffset(-6), to: today }
  if (preset === 'mes') return monthRange(year, month - 1)
  return monthRange(year, month - 2)
}

function presetOf(from: string, to: string): Preset {
  const presets: Exclude<Preset, 'personalizado'>[] = ['hoy', '7', 'mes', 'anterior']
  for (const preset of presets) {
    const range = rangeFor(preset)
    if (range.from === from && range.to === to) return preset
  }
  return 'personalizado'
}

function defaultRange() {
  return { from: businessOffset(-29), to: businessToday() }
}

function periodEmpty(data: ReportData) {
  return (
    data.deliveries.byDay.length === 0 &&
    data.deliveries.late.length === 0 &&
    data.drivers.totals.closedTrips === 0 &&
    data.drivers.totals.pendingTrips === 0 &&
    data.claims.total === 0 &&
    data.pickups.byDay.length === 0 &&
    data.pickups.overdue.length === 0
  )
}

const SECTIONS = [
  { id: 'entregas', label: 'Entregas' },
  { id: 'franja', label: 'Franja' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'zonas', label: 'Zonas' },
  { id: 'prioridad', label: 'Prioridad' },
  { id: 'choferes', label: 'Choferes' },
  { id: 'reclamos', label: 'Reclamos' },
  { id: 'retiros', label: 'Retiros' },
] as const

function totalFooter(section: ReportSectionModel) {
  if (section.total.mode === 'caption') {
    return (
      <tr>
        <td colSpan={section.columns.length} className="border-t border-border px-4 py-3 text-sm font-semibold text-text">
          {section.total.text}
        </td>
      </tr>
    )
  }
  return section.total.lines.map((line) => (
    <tr key={line.label}>
      {line.cells.map((cell) => {
        const column = section.columns.find((item) => item.key === cell.key)
        const align = column?.align === 'right' ? 'text-right tabular-nums' : ''
        return (
          <td key={cell.key} className={`border-t border-border px-4 py-3 text-[15px] font-semibold text-text ${align}`}>
            {cell.text}
          </td>
        )
      })}
    </tr>
  ))
}

function TotalCards({ section }: { section: ReportSectionModel }) {
  if (section.total.mode === 'caption') {
    return <p className="border-t border-border px-4 py-3 text-sm font-semibold text-text">{section.total.text}</p>
  }
  return section.total.lines.map((line) => (
    <article key={line.label} className="border-t border-border px-4 py-3 font-semibold">
      {line.cells.map((cell) => {
        const column = section.columns.find((item) => item.key === cell.key)
        if (!column || cell.text === '') return null
        return (
          <p
            key={cell.key}
            className={column.align === 'right' ? 'text-right text-sm tabular-nums text-text' : 'text-sm text-text'}
          >
            {column.key === section.columns[0]?.key ? (
              cell.text
            ) : (
              <>
                <span className="font-normal text-muted">{column.header}: </span>
                {cell.text}
              </>
            )}
          </p>
        )
      })}
    </article>
  ))
}

function cellNode(section: ReportSectionModel, row: ModelRow, key: string) {
  const column = section.columns.find((item) => item.key === key)
  if (!column) return null
  const text = cellText(column, row)
  if (column.key === 'estado' && row.pending) return <Badge tone="info">{text}</Badge>
  return text
}

function ReportSection({
  section,
  from,
  to,
  onRowClick,
}: {
  section: ReportSectionModel
  from: string
  to: string
  onRowClick?: (row: ModelRow) => void
}) {
  const file = `reporte-${section.csvId}-${from}_${to}.csv`
  return (
    <section id={section.id} className="flex scroll-mt-24 flex-col gap-2">
      <h2 className="text-lg font-semibold text-text">{section.title}</h2>
      <ListBox
        view={
          <Button variant="secondary" onClick={() => downloadCsvFile(toCsv(sectionCsv(section)), file)}>
            Exportar CSV
          </Button>
        }
      >
        {section.rows.length === 0 ? (
          <EmptyState variant="plain" title="Sin datos" />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table
                bare
                columns={section.columns.map((column) => ({
                  key: column.key,
                  header: column.header,
                  align: column.align,
                  cell: (row: ModelRow) => cellNode(section, row, column.key),
                }))}
                rows={section.rows}
                rowKey={(row) => row.rowId}
                onRowClick={onRowClick}
                footer={totalFooter(section)}
              />
            </div>
            <div className="flex flex-col lg:hidden">
              {section.rows.map((row) => {
                const cells = (as: 'p' | 'span') =>
                  section.columns.map((column) => {
                    const Tag = as
                    return (
                      <Tag
                        key={column.key}
                        className={`block ${column.align === 'right' ? 'text-right text-sm tabular-nums text-text' : 'text-sm text-text'}`}
                      >
                        <span className="text-muted">{column.header}: </span>
                        {cellNode(section, row, column.key)}
                      </Tag>
                    )
                  })
                if (!onRowClick) {
                  return (
                    <article key={row.rowId} className="border-b border-border px-4 py-3 last:border-b-0">
                      {cells('p')}
                    </article>
                  )
                }
                return (
                  <button
                    key={row.rowId}
                    type="button"
                    className="w-full cursor-pointer border-b border-border px-4 py-3 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    aria-label={`Abrir pedido ${row.rowId}`}
                    onClick={() => onRowClick(row)}
                  >
                    {cells('span')}
                  </button>
                )
              })}
              <TotalCards section={section} />
            </div>
          </>
        )}
      </ListBox>
    </section>
  )
}

export function Reportes() {
  const { user } = useAuth()
  const { orders } = useOrders()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const from = searchParams.get('desde') ?? ''
  const to = searchParams.get('hasta') ?? ''
  const requestKey = from && to ? `${from}|${to}|${attempt}` : ''
  const [trackedKey, setTrackedKey] = useState(requestKey)

  if (requestKey !== trackedKey) {
    setTrackedKey(requestKey)
    setLoading(Boolean(requestKey))
    setError('')
    if (requestKey) setData(null)
  }

  const custom = searchParams.get('modo') === 'personalizado'
  const preset = custom || !from || !to ? 'personalizado' : presetOf(from, to)

  useEffect(() => {
    if (searchParams.get('desde') && searchParams.get('hasta')) return
    const range = defaultRange()
    const next = new URLSearchParams(searchParams)
    next.set('desde', range.from)
    next.set('hasta', range.to)
    next.set('modo', 'personalizado')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!from || !to) return
    let cancelled = false
    void Promise.all([
      getDeliveriesReport({ from, to }),
      getDriversReport({ from, to }),
      getClaimsReport({ from, to }),
      getPickupsReport({ from, to }),
    ]).then(([deliveries, drivers, claims, pickups]) => {
      if (cancelled) return
      if (!deliveries.ok || !drivers.ok || !claims.ok || !pickups.ok) {
        const failed = [deliveries, drivers, claims, pickups].find((result) => !result.ok)
        setData(null)
        setError(failed && !failed.ok ? failed.message : 'No se pudieron cargar los reportes.')
        setLoading(false)
        return
      }
      setData({
        deliveries: deliveries.data,
        drivers: drivers.data,
        claims: claims.data,
        pickups: pickups.data,
      })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [from, to, attempt])

  function selectPreset(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === 'personalizado') {
      next.set('modo', 'personalizado')
      setSearchParams(next, { replace: true })
      return
    }
    if (value !== 'hoy' && value !== '7' && value !== 'mes' && value !== 'anterior') return
    const range = rangeFor(value)
    next.delete('modo')
    next.set('desde', range.from)
    next.set('hasta', range.to)
    setSearchParams(next, { replace: true })
  }

  function selectCustom(key: 'desde' | 'hasta', value: string) {
    const next = new URLSearchParams(searchParams)
    next.set('modo', 'personalizado')
    next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  const gerencia = user?.role === 'gerencia'
  const openId = gerencia ? null : searchParams.get('pedido')

  function openPedido(id: string) {
    if (gerencia) return
    const next = new URLSearchParams(searchParams)
    next.set('pedido', id)
    setSearchParams(next)
  }

  function closePedido() {
    const next = new URLSearchParams(searchParams)
    next.delete('pedido')
    setSearchParams(next, { replace: true })
  }

  const openOrder = openId ? (orders.find((order) => order.id === openId) ?? null) : null
  const lateRow = openId && data ? (data.deliveries.late.find((row) => row.id === openId) ?? null) : null
  const empty = data ? periodEmpty(data) : false
  const model = data && from && to ? buildReportModel(data, { from, to }) : null

  return (
    <Page>
      <PageHeader title="Reportes" subtitle="Entregas, choferes y post venta del período" />
      <FilterBar
        chips={[
          {
            id: 'periodo',
            label: 'Período',
            variant: 'segmented',
            value: preset,
            options: PRESETS,
            onChange: selectPreset,
          },
        ]}
      />
      {preset === 'personalizado' ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
            Desde
            <Input type="date" value={from} onChange={(event) => selectCustom('desde', event.target.value)} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
            Hasta
            <Input type="date" value={to} onChange={(event) => selectCustom('hasta', event.target.value)} />
          </label>
        </div>
      ) : null}
      {loading ? (
        <div className="grid place-items-center py-16">
          <Spinner size="lg" label="Cargando reportes" />
        </div>
      ) : null}
      {error ? <ServerDown message={error} onRetry={() => setAttempt((current) => current + 1)} /> : null}
      {!loading && !error && empty ? (
        <EmptyState
          variant="plain"
          title="No hay datos en este período"
          description="Probá con otro rango de fechas."
        />
      ) : null}
      {!loading && !error && model && !empty ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {model.kpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              title={kpi.title}
              value={kpi.value}
              trend={
                kpi.detail
                  ? { direction: 'down', tone: kpi.detailTone ?? 'neutral', label: kpi.detail }
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {!loading && !error && model && !empty ? (
        <ReportTables model={model} onOpenLate={gerencia ? undefined : openPedido} />
      ) : null}
      <Drawer
        open={Boolean(openId)}
        onClose={closePedido}
        title={openId ?? 'Pedido'}
        subtitle={openOrder?.client.toUpperCase()}
      >
        {openOrder ? (
          <div className="flex flex-col gap-4">
            {user && canOpen(user.role, '/pedidos') ? (
              <Link className="text-sm font-medium text-accent hover:underline" to={`/pedidos/${openOrder.id}`}>
                Abrir página completa
              </Link>
            ) : null}
            <OrderDetail order={openOrder} compact />
          </div>
        ) : lateRow ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Cliente</dt>
              <dd>{lateRow.client || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Vendedor</dt>
              <dd>{lateRow.seller || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Zona</dt>
              <dd>{lateRow.zone || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Fecha</dt>
              <dd>{lateRow.date ? formatIsoDate(lateRow.date) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Franja</dt>
              <dd>{lateRow.timeWindow || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Estado</dt>
              <dd>{lateRow.status in STATUS_PILL ? STATUS_PILL[lateRow.status as OrderStatus] : lateRow.status}</dd>
            </div>
          </dl>
        ) : null}
      </Drawer>
    </Page>
  )
}

function ReportTables({
  model,
  onOpenLate,
}: {
  model: ReportModel
  onOpenLate?: (id: string) => void
}) {
  const byId = new Map(model.sections.map((section) => [section.id, section]))
  function block(id: string) {
    const section = byId.get(id)
    if (!section) return null
    return (
      <ReportSection
        key={section.id}
        section={section}
        from={model.period.from}
        to={model.period.to}
        onRowClick={id === 'atrasados' && onOpenLate ? (row) => onOpenLate(row.rowId) : undefined}
      />
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-2 overflow-x-auto lg:hidden" aria-label="Secciones">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            {section.label}
          </a>
        ))}
      </nav>
      {block('entregas')}
      {block('franja')}
      {block('atrasados')}
      {block('vendedores')}
      {block('zonas')}
      {block('prioridad')}
      {block('choferes')}
      <div id="reclamos" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">Reclamos</h2>
        <p className="text-sm text-muted">{model.claimsNote}</p>
        {block('reclamos-estado')}
        {block('reclamos-motivo')}
        {block('reclamos-abiertos')}
      </div>
      <div id="retiros" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">Retiros</h2>
        {block('retiros-dia')}
        {block('retiros-vencidos')}
      </div>
    </div>
  )
}

