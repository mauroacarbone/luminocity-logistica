import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OrderDetail } from '../components/OrderDetail'
import { ServerDown } from '../components/LoadState'
import { Badge, Button, Drawer, EmptyState, FilterBar, Input, KpiCard, ListBox, Page, PageHeader, Spinner, Table } from '../components/ui'
import { CLAIM_STATUS_LABEL, type ClaimStatus } from '../data/claims'
import { STATUS_PILL, type OrderStatus } from '../data/orders'
import { canOpen } from '../lib/access'
import { downloadCsvFile, toCsv } from '../lib/csv'
import { isOrderPriority, PRIORITY_LABEL } from '../lib/priority'
import { businessOffset, businessToday } from '../lib/schedule'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import {
  getClaimsReport,
  getDeliveriesReport,
  getDriversReport,
  getPickupsReport,
  type ClaimMotiveRow,
  type ClaimStatusRow,
  type ClaimsReport,
  type DayReport,
  type DeliveriesReport,
  type DriversReport,
  type GroupReport,
  type LateOrder,
  type OpenClaimRow,
  type OverduePickup,
  type PickupDay,
  type PickupsReport,
  type SlotDay,
} from '../lib/reportsApi'

type Preset = 'hoy' | '7' | 'mes' | 'anterior' | 'personalizado'

type ReportData = {
  deliveries: DeliveriesReport
  drivers: DriversReport
  claims: ClaimsReport
  pickups: PickupsReport
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'anterior', label: 'Mes anterior' },
  { value: 'personalizado', label: 'Personalizado' },
]

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

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

function deliveredCount(report: DeliveriesReport) {
  return report.byDay.reduce((sum, day) => sum + day.status.entregado, 0)
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

function formatPct(value: number | null) {
  if (value == null) return '—'
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

function formatKm(value: number) {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

function formatCount(value: number) {
  return value.toLocaleString('es-AR')
}

function orderStatusLabel(status: string) {
  return status in STATUS_PILL ? STATUS_PILL[status as OrderStatus] : status
}

function claimStatusLabel(status: string) {
  return status in CLAIM_STATUS_LABEL ? CLAIM_STATUS_LABEL[status as ClaimStatus] : status
}

function priorityLabel(key: string) {
  return isOrderPriority(key) ? PRIORITY_LABEL[key] : key
}

function kmText(km: number, estimated: number) {
  if (estimated > 0) return `${formatKm(km)} (${formatKm(estimated)} estimados)`
  return formatKm(km)
}

function moneyText(amount: number | null, unsealed: number) {
  if (amount == null) return 'Sin monto sellado'
  if (unsealed > 0) return `${money.format(amount)} · ${unsealed} sin monto sellado`
  return money.format(amount)
}

type Column<T> = {
  key: string
  header: string
  align?: 'left' | 'right'
  cell: (row: T) => ReactNode
  text: (row: T) => string | number
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

function ReportSection<T>({
  id,
  title,
  note,
  file,
  rows,
  columns,
  rowKey,
  onRowClick,
}: {
  id: string
  title: string
  note?: string
  file: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
}) {
  const csv = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => column.text(row)))]
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
      </div>
      <ListBox
        view={
          <Button variant="secondary" onClick={() => downloadCsvFile(toCsv(csv), file)}>
            Exportar CSV
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState variant="plain" title="Sin datos" />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table
                bare
                columns={columns.map((column) => ({
                  key: column.key,
                  header: column.header,
                  align: column.align,
                  cell: column.cell,
                }))}
                rows={rows}
                rowKey={rowKey}
                onRowClick={onRowClick}
              />
            </div>
            <div className="flex flex-col lg:hidden">
              {rows.map((row) => (
                <article
                  key={rowKey(row)}
                  className={`border-b border-border px-4 py-3 last:border-b-0 ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <p
                      key={column.key}
                      className={column.align === 'right' ? 'text-right text-sm tabular-nums text-text' : 'text-sm text-text'}
                    >
                      <span className="text-muted">{column.header}: </span>
                      {column.cell(row)}
                    </p>
                  ))}
                </article>
              ))}
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
  const delivered = data ? deliveredCount(data.deliveries) : 0
  const slot = data?.deliveries.slot
  const totals = data?.drivers.totals
  const empty = data ? periodEmpty(data) : false

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
      {!loading && !error && data && !empty ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Entregados" value={delivered.toLocaleString('es-AR')} />
          <KpiCard
            title="% en horario"
            value={formatPct(slot?.pctOnTime ?? null)}
            trend={{
              direction: 'down',
              tone: slot && slot.conDemora > 0 ? 'danger' : 'neutral',
              label: `${slot?.conDemora ?? 0} con demora`,
            }}
          />
          <KpiCard title="Atrasados abiertos" value={(data.deliveries.late.length).toLocaleString('es-AR')} />
          <KpiCard title="Viajes cerrados" value={(totals?.closedTrips ?? 0).toLocaleString('es-AR')} />
          <KpiCard
            title="Km"
            value={formatKm(totals?.km ?? 0)}
            trend={
              totals && totals.kmEstimated > 0
                ? { direction: 'down', tone: 'neutral', label: `${formatKm(totals.kmEstimated)} estimados` }
                : undefined
            }
          />
          <KpiCard
            title="Monto a pagar"
            value={totals?.amount == null ? 'Sin monto sellado' : money.format(totals.amount)}
          />
          <KpiCard
            title="Viajes pendientes"
            value={(totals?.pendingTrips ?? 0).toLocaleString('es-AR')}
            trend={{ direction: 'down', tone: 'neutral', label: 'sin monto' }}
          />
        </div>
      ) : null}
      {!loading && !error && data && !empty ? (
        <ReportTables
          data={data}
          from={from}
          to={to}
          onOpenLate={gerencia ? undefined : openPedido}
        />
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
              <dd>{orderStatusLabel(lateRow.status)}</dd>
            </div>
          </dl>
        ) : null}
      </Drawer>
    </Page>
  )
}

function ReportTables({
  data,
  from,
  to,
  onOpenLate,
}: {
  data: ReportData
  from: string
  to: string
  onOpenLate?: (id: string) => void
}) {
  const file = (section: string) => `reporte-${section}-${from}_${to}.csv`
  const groups = (title: string, id: string, rows: typeof data.deliveries.bySeller, label: string) => (
    <ReportSection
      id={id}
      title={title}
      file={file(id)}
      rows={rows}
      rowKey={(row) => row.key}
      columns={cols<GroupReport>([
        { key: 'key', header: label, text: (row) => (id === 'prioridad' ? priorityLabel(row.key) : row.key), cell: (row) => (id === 'prioridad' ? priorityLabel(row.key) : row.key) },
        countCol('total', 'Total', (row) => row.total),
        countCol('entregados', 'Entregados', (row) => row.entregados),
        countCol('cancelados', 'Cancelados', (row) => row.cancelados),
        countCol('antes', 'Entregado antes', (row) => row.antes),
        countCol('en', 'En horario', (row) => row.enHorario),
        countCol('demora', 'Entregado con demora', (row) => row.conDemora),
        pctCol('pctAntes', '% antes', (row) => row.pctAntes),
        pctCol('pct', '% en horario', (row) => row.pctOnTime),
        pctCol('pctDemora', '% con demora', (row) => row.pctConDemora),
        countCol('sin', 'Sin franja', (row) => row.sinFranja),
      ])}
    />
  )
  const driverRows = data.drivers.drivers.flatMap((driver) => {
    const rows: {
      id: string
      name: string
      course: boolean
      trips: number
      deliveries: string
      undelivered: string
      km: string
      amount: string
    }[] = []
    if (driver.closedTrips > 0 || driver.pendingTrips === 0) {
      rows.push({
        id: `${driver.driverId}-cerrado`,
        name: driver.driverName,
        course: false,
        trips: driver.closedTrips,
        deliveries: formatCount(driver.deliveries),
        undelivered: formatCount(driver.undelivered),
        km: kmText(driver.km, driver.kmEstimated),
        amount: moneyText(driver.amount, driver.unsealed),
      })
    }
    if (driver.pendingTrips > 0) {
      rows.push({
        id: `${driver.driverId}-curso`,
        name: driver.driverName,
        course: true,
        trips: driver.pendingTrips,
        deliveries: '—',
        undelivered: '—',
        km: formatKm(driver.pendingKm),
        amount: driver.pendingEstimated == null ? 'Estimado' : `Estimado ${money.format(driver.pendingEstimated)}`,
      })
    }
    return rows
  })
  const average =
    data.claims.averageCloseHours == null
      ? 'Sin cierres en el período'
      : `Tiempo promedio hasta el cierre: ${formatKm(data.claims.averageCloseHours)} h`

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
      <ReportSection
        id="entregas"
        title="Entregas por día"
        file={file('entregas')}
        rows={data.deliveries.byDay}
        rowKey={(row) => row.date}
        columns={cols<DayReport>([
          { key: 'date', header: 'Fecha', text: (row) => formatIsoDate(row.date), cell: (row) => formatIsoDate(row.date) },
          countCol('pendiente', 'Pendiente', (row) => row.status.pendiente),
          countCol('preparado', 'Preparado', (row) => row.status.preparado),
          countCol('asignado', 'Asignado', (row) => row.status.asignado),
          countCol('viaje', 'En viaje', (row) => row.status['en-viaje']),
          countCol('entregado', 'Entregado', (row) => row.status.entregado),
          countCol('propia', 'Propia', (row) => row.dispatch.propia),
          countCol('correo', 'Correo', (row) => row.dispatch.correo),
          countCol('retiro', 'Retiro', (row) => row.dispatch.retiro),
        ])}
      />
      <ReportSection
        id="franja"
        title="Cumplimiento de franja"
        file={file('franja')}
        rows={data.deliveries.slotByDay}
        rowKey={(row) => row.date}
        columns={cols<SlotDay>([
          { key: 'date', header: 'Fecha', text: (row) => formatIsoDate(row.date), cell: (row) => formatIsoDate(row.date) },
          countCol('antes', 'Entregado antes', (row) => row.antes),
          countCol('en', 'En horario', (row) => row.enHorario),
          countCol('demora', 'Entregado con demora', (row) => row.conDemora),
          countCol('sin', 'Sin franja', (row) => row.sinFranja),
          {
            key: 'pct',
            header: '% en horario',
            align: 'right',
            text: (row) => formatPct(row.pctOnTime),
            cell: (row) => formatPct(row.pctOnTime),
          },
        ])}
      />
      <ReportSection
        id="atrasados"
        title="Atrasados"
        file={file('atrasados')}
        rows={data.deliveries.late}
        rowKey={(row) => row.id}
        onRowClick={onOpenLate ? (row) => onOpenLate(row.id) : undefined}
        columns={cols<LateOrder>([
          { key: 'id', header: 'Pedido', text: (row) => row.id, cell: (row) => row.id },
          { key: 'client', header: 'Cliente', text: (row) => row.client, cell: (row) => row.client },
          { key: 'seller', header: 'Vendedor', text: (row) => row.seller, cell: (row) => row.seller || '—' },
          { key: 'zone', header: 'Zona', text: (row) => row.zone, cell: (row) => row.zone || '—' },
          { key: 'date', header: 'Fecha', text: (row) => formatIsoDate(row.date), cell: (row) => formatIsoDate(row.date) },
          { key: 'slot', header: 'Franja', text: (row) => row.timeWindow, cell: (row) => row.timeWindow || '—' },
          {
            key: 'status',
            header: 'Estado',
            text: (row) => orderStatusLabel(row.status),
            cell: (row) => orderStatusLabel(row.status),
          },
        ])}
      />
      {groups('Por vendedor', 'vendedores', data.deliveries.bySeller, 'Vendedor')}
      {groups('Por zona', 'zonas', data.deliveries.byZone, 'Zona')}
      {groups('Por prioridad', 'prioridad', data.deliveries.byPriority, 'Prioridad')}
      <ReportSection
        id="choferes"
        title="Por chofer"
        file={file('choferes')}
        rows={driverRows}
        rowKey={(row) => row.id}
        columns={cols<(typeof driverRows)[number]>([
          { key: 'name', header: 'Chofer', text: (row) => row.name, cell: (row) => row.name },
          {
            key: 'estado',
            header: 'Estado',
            text: (row) => (row.course ? 'En curso' : 'Cerrado'),
            cell: (row) => (row.course ? <Badge tone="info">En curso</Badge> : 'Cerrado'),
          },
          countCol('trips', 'Viajes', (row) => row.trips),
          { key: 'deliveries', header: 'Entregas', align: 'right', text: (row) => row.deliveries, cell: (row) => row.deliveries },
          { key: 'undelivered', header: 'No entregas', align: 'right', text: (row) => row.undelivered, cell: (row) => row.undelivered },
          { key: 'km', header: 'Km', align: 'right', text: (row) => row.km, cell: (row) => row.km },
          { key: 'amount', header: 'Monto', align: 'right', text: (row) => row.amount, cell: (row) => row.amount },
        ])}
      />
      <div id="reclamos" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">Reclamos</h2>
        <p className="text-sm text-muted">{average}</p>
        <ReportSection
          id="reclamos-estado"
          title="Por estado"
          file={file('reclamos-estado')}
          rows={data.claims.byStatus}
          rowKey={(row) => row.status}
          columns={cols<ClaimStatusRow>([
            { key: 'label', header: 'Estado', text: (row) => row.label, cell: (row) => row.label },
            countCol('count', 'Cantidad', (row) => row.count),
          ])}
        />
        <ReportSection
          id="reclamos-motivo"
          title="Por tipo"
          file={file('reclamos-motivo')}
          rows={data.claims.byMotive}
          rowKey={(row) => row.motive}
          columns={cols<ClaimMotiveRow>([
            { key: 'motive', header: 'Tipo', text: (row) => row.motive, cell: (row) => row.motive },
            countCol('count', 'Cantidad', (row) => row.count),
          ])}
        />
        <ReportSection
          id="reclamos-abiertos"
          title="Abiertos con más de 7 días"
          file={file('reclamos-abiertos')}
          rows={data.claims.openAged}
          rowKey={(row) => row.id}
          columns={cols<OpenClaimRow>([
            { key: 'id', header: 'Reclamo', text: (row) => row.id, cell: (row) => row.id },
            { key: 'client', header: 'Cliente', text: (row) => row.client, cell: (row) => row.client },
            { key: 'motive', header: 'Tipo', text: (row) => row.motive, cell: (row) => row.motive },
            {
              key: 'status',
              header: 'Estado',
              text: (row) => claimStatusLabel(row.status),
              cell: (row) => claimStatusLabel(row.status),
            },
            countCol('days', 'Días', (row) => row.days),
          ])}
        />
      </div>
      <div id="retiros" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">Retiros</h2>
        <ReportSection
          id="retiros-dia"
          title="Por día"
          file={file('retiros')}
          rows={data.pickups.byDay}
          rowKey={(row) => row.date}
          columns={cols<PickupDay>([
            { key: 'date', header: 'Fecha', text: (row) => formatIsoDate(row.date), cell: (row) => formatIsoDate(row.date) },
            countCol('total', 'Total', (row) => row.total),
            countCol('pendiente', 'Pendiente', (row) => row.status.pendiente),
            countCol('preparado', 'Preparado', (row) => row.status.preparado),
            countCol('asignado', 'Asignado', (row) => row.status.asignado),
            countCol('viaje', 'En viaje', (row) => row.status['en-viaje']),
            countCol('entregado', 'Entregado', (row) => row.status.entregado),
          ])}
        />
        <ReportSection
          id="retiros-vencidos"
          title="Pendientes de retiro vencidos"
          file={file('retiros-vencidos')}
          rows={data.pickups.overdue}
          rowKey={(row) => row.id}
          columns={cols<OverduePickup>([
            { key: 'id', header: 'Pedido', text: (row) => row.id, cell: (row) => row.id },
            { key: 'client', header: 'Cliente', text: (row) => row.client, cell: (row) => row.client },
            { key: 'seller', header: 'Vendedor', text: (row) => row.seller, cell: (row) => row.seller || '—' },
            { key: 'date', header: 'Fecha', text: (row) => formatIsoDate(row.date), cell: (row) => formatIsoDate(row.date) },
            {
              key: 'status',
              header: 'Estado',
              text: (row) => orderStatusLabel(row.status),
              cell: (row) => orderStatusLabel(row.status),
            },
          ])}
        />
      </div>
    </div>
  )
}

function cols<T>(columns: Column<T>[]) {
  return columns
}

function countCol<T>(key: string, header: string, value: (row: T) => number): Column<T> {
  return {
    key,
    header,
    align: 'right',
    text: (row) => formatCount(value(row)),
    cell: (row) => formatCount(value(row)),
  }
}

function pctCol<T>(key: string, header: string, value: (row: T) => number | null): Column<T> {
  return {
    key,
    header,
    align: 'right',
    text: (row) => formatPct(value(row)),
    cell: (row) => formatPct(value(row)),
  }
}
