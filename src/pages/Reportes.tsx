import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ServerDown } from '../components/LoadState'
import { EmptyState, FilterBar, Input, KpiCard, Page, PageHeader, Spinner } from '../components/ui'
import { businessOffset, businessToday } from '../lib/schedule'
import {
  getClaimsReport,
  getDeliveriesReport,
  getDriversReport,
  getPickupsReport,
  type ClaimsReport,
  type DeliveriesReport,
  type DriversReport,
  type PickupsReport,
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

export function Reportes() {
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
    </Page>
  )
}
