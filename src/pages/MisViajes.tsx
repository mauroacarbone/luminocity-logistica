import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, FilterBar, Page, PageHeader } from '../components/ui'
import { isSession, type Session } from '../lib/authStore'
import { buildCsv, downloadCsvFile } from '../lib/csv'
import { listDriverTrips, type DriverTrip } from '../lib/routeSheetsApi'
import { businessToday, clockTime } from '../lib/schedule'
import { listUsers } from '../lib/usersApi'
import { formatIsoDate } from '../lib/week'
import { useAuth } from '../state/AuthContext'

type TripTab = 'pendientes' | 'finalizados'

function monthBounds(today: string) {
  const [year, month] = today.split('-')
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, '0')}` }
}

function formatArs(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatKm(km: number) {
  return `${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(km)} km`
}

function scheduleLabel(trip: DriverTrip) {
  const start = clockTime(trip.startedAt ?? undefined)
  const end = clockTime(trip.closedAt ?? undefined)
  if (trip.status === 'planificada') return 'Sin iniciar'
  if (trip.status === 'en_curso') return start ? `Desde ${start}` : 'En curso'
  if (start && end) return `${start} – ${end}`
  if (end) return `Fin ${end}`
  return 'Sin horario'
}

function stopCount(trip: DriverTrip) {
  const delivered = `${trip.delivered} entregada${trip.delivered === 1 ? '' : 's'}`
  const pending = `${trip.undelivered} sin entregar`
  return `${delivered} · ${pending}`
}

function csvNumber(value: number) {
  return new Intl.NumberFormat('es-AR', {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(value)
}

function exportFinished(trips: DriverTrip[], from: string, to: string) {
  const rows: Array<Array<string | number>> = [
    ['chofer', 'fecha', 'franja', 'zonas', 'entregados', 'no_entregados', 'km', 'estimado', 'monto'],
    ...trips.map((trip) => [
      trip.driverName,
      trip.date,
      trip.slot,
      (trip.zones.length > 0 ? trip.zones : ['Sin zona']).join(' · '),
      trip.delivered,
      trip.undelivered,
      csvNumber(trip.km),
      trip.kmEstimated ? 'sí' : 'no',
      trip.delivered < 1 || trip.amount == null ? '' : csvNumber(trip.amount),
    ]),
  ]
  downloadCsvFile(buildCsv(rows), `viajes-${from}-${to}.csv`)
}

export function MisViajes() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const manager = user?.role === 'encargado_deposito' || user?.role === 'admin'
  const driverId = manager ? (params.get('chofer')?.trim() ?? '') : ''
  const today = businessToday()
  const initial = monthBounds(today)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [tab, setTab] = useState<TripTab>('pendientes')
  const [trips, setTrips] = useState<DriverTrip[]>([])
  const [drivers, setDrivers] = useState<Session[]>([])
  const [loading, setLoading] = useState(!manager || driverId.length > 0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!manager) return
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled || !result.ok || !Array.isArray(result.data)) return
      setDrivers(
        result.data
          .filter((item) => isSession(item) && item.role === 'chofer')
          .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      )
    })
    return () => {
      cancelled = true
    }
  }, [manager])

  useEffect(() => {
    if (!user) return
    if (manager && !driverId) return
    let cancelled = false
    void listDriverTrips(from, to, manager ? driverId : undefined).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setError(result.message)
        setTrips([])
        return
      }
      setError('')
      setTrips(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [driverId, from, manager, to, user])

  const pending = trips.filter((trip) => trip.status !== 'cerrada')
  const finished = trips.filter((trip) => trip.status === 'cerrada')
  const visible = tab === 'pendientes' ? pending : finished

  const summary = useMemo(() => {
    const byZone = new Map<string, number>()
    let count = 0
    let km = 0
    let estimated = false
    let pay = 0
    let priced = false
    for (const trip of finished) {
      if (trip.delivered < 1) continue
      count += 1
      km += trip.km
      if (trip.kmEstimated) estimated = true
      if (typeof trip.amount === 'number') {
        priced = true
        pay += trip.amount
      }
      const zones = trip.zones.length > 0 ? trip.zones : ['Sin zona']
      for (const zone of zones) byZone.set(zone, (byZone.get(zone) ?? 0) + 1)
    }
    return {
      count,
      km,
      estimated,
      pay,
      priced,
      zones: [...byZone.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'es')),
    }
  }, [finished])

  const month = monthBounds(today)

  function changeRange(nextFrom: string, nextTo: string) {
    if (nextFrom === from && nextTo === to) return
    setLoading(true)
    setFrom(nextFrom)
    setTo(nextTo)
  }

  return (
    <Page>
      <PageHeader
        title={manager ? 'Viajes del chofer' : 'Mis viajes'}
        subtitle="Pendientes, finalizados y kilómetros del período"
        actions={
          manager ? (
            <Button
              variant="primary"
              size="lg"
              disabled={finished.length === 0}
              onClick={() => exportFinished(finished, from, to)}
            >
              Exportar CSV
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        className="no-print"
        size="lg"
        selects={
          manager
            ? [
                {
                  id: 'chofer',
                  label: 'Chofer',
                  value: driverId,
                  onChange: (next) => {
                    if (!next) {
                      setParams({})
                      setTrips([])
                      setError('')
                      setLoading(false)
                      return
                    }
                    setLoading(true)
                    setParams({ chofer: next })
                  },
                  options: [
                    { value: '', label: 'Elegí un chofer' },
                    ...drivers.map((driver) => ({ value: driver.id, label: driver.name })),
                    ...(driverId && !drivers.some((driver) => driver.id === driverId)
                      ? [{ value: driverId, label: 'Chofer seleccionado' }]
                      : []),
                  ],
                },
              ]
            : undefined
        }
        dateRange={{
          from,
          to,
          shortcuts: ['hoy', 'semana', 'mes'],
          onChange: ({ from: nextFrom, to: nextTo }) => changeRange(nextFrom, nextTo),
        }}
        activeCount={(from !== month.from || to !== month.to ? 1 : 0) + (manager && driverId ? 1 : 0)}
        onClear={() => {
          const datesChanged = from !== month.from || to !== month.to
          if (datesChanged) {
            setFrom(month.from)
            setTo(month.to)
          }
          if (manager && driverId) {
            setParams({})
            setTrips([])
            setError('')
            setLoading(false)
          } else if (datesChanged) {
            setLoading(true)
          }
        }}
      />

      <div className={`mt-4 grid gap-2 ${summary.priced ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <article className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
          <p className="text-sm text-lumi-muted">Viajes realizados</p>
          <p className="text-2xl font-semibold">{summary.count}</p>
        </article>
        <article className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
          <p className="text-sm text-lumi-muted">Km del período</p>
          <p className="text-2xl font-semibold">{formatKm(summary.km)}</p>
          {summary.estimated && <p className="text-sm text-lumi-muted">Incluye tramos estimados</p>}
        </article>
        {summary.priced && (
          <article className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
            <p className="text-sm text-lumi-muted">Total a cobrar</p>
            <p className="text-2xl font-semibold">{formatArs(summary.pay)}</p>
          </article>
        )}
        <article className="rounded-2xl bg-surface px-4 py-3 shadow-sm">
          <p className="text-sm text-lumi-muted">Viajes por lejanía</p>
          {summary.zones.length === 0 ? (
            <p className="mt-1 text-sm text-lumi-muted">Sin viajes finalizados</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {summary.zones.map(([zone, count]) => (
                <li key={zone}>
                  <Badge tone="neutral">
                    {zone} · {count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="view-toggle no-print mt-4" role="tablist" aria-label="Viajes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pendientes'}
          className={tab === 'pendientes' ? 'active min-h-12 flex-1' : 'min-h-12 flex-1'}
          onClick={() => setTab('pendientes')}
        >
          Pendientes
          <span>{pending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'finalizados'}
          className={tab === 'finalizados' ? 'active min-h-12 flex-1' : 'min-h-12 flex-1'}
          onClick={() => setTab('finalizados')}
        >
          Finalizados
          <span>{finished.length}</span>
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-lumi-danger shadow-sm">
          {error}
        </p>
      )}
      {manager && !driverId ? (
        <p className="mt-4 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
          Elegí un chofer para ver sus viajes.
        </p>
      ) : loading ? (
        <p className="mt-4 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
          Cargando viajes…
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-lumi-muted shadow-sm">
          {tab === 'pendientes' ? 'No hay viajes pendientes en este período.' : 'No hay viajes finalizados en este período.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function TripCard({ trip }: { trip: DriverTrip }) {
  const zones = trip.zones.length > 0 ? trip.zones : ['Sin zona']
  return (
    <article className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {formatIsoDate(trip.date)} · {trip.slot}
        </h2>
        {trip.status === 'cerrada' && trip.delivered < 1 && <Badge tone="neutral">Sin entregas</Badge>}
        <p className="text-base font-semibold">
          {formatKm(trip.km)}
          {trip.kmEstimated ? ' · estimado' : ''}
          {trip.amount != null ? ` · ${formatArs(trip.amount)}` : ''}
        </p>
      </div>
      <p className="mt-2 text-base">{stopCount(trip)}</p>
      <p className="mt-1 text-base text-lumi-muted">{scheduleLabel(trip)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {zones.map((zone) => (
          <Badge key={zone} tone="neutral">
            {zone}
          </Badge>
        ))}
      </div>
    </article>
  )
}
