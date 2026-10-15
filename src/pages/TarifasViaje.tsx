import { useEffect, useState, type FormEvent } from 'react'
import { Page, PageHeader } from '../components/ui'
import { listTripRates, saveTripRate, type TripRate } from '../lib/tripRatesApi'
import { businessToday } from '../lib/schedule'
import { formatIsoDate } from '../lib/week'
import { useCatalog } from '../state/CatalogContext'

function formatArs(amount: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function parseMoney(value: string) {
  const text = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!text) return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN
  return Number(text)
}

function readSaved(value: unknown): TripRate | null {
  if (!value || typeof value !== 'object') return null
  const rate = value as Record<string, unknown>
  if (typeof rate.id !== 'string' || typeof rate.zone !== 'string' || typeof rate.effectiveFrom !== 'string') return null
  if (typeof rate.perTrip !== 'number' || !Number.isFinite(rate.perTrip)) return null
  if (rate.perKm != null && (typeof rate.perKm !== 'number' || !Number.isFinite(rate.perKm))) return null
  return {
    id: rate.id,
    zone: rate.zone,
    effectiveFrom: rate.effectiveFrom,
    perTrip: rate.perTrip,
    perKm: rate.perKm ?? null,
  }
}

function currentRate(rates: TripRate[], zone: string, today: string) {
  return rates
    .filter((rate) => rate.zone === zone && rate.effectiveFrom <= today)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]
}

export function TarifasViaje() {
  const { zones } = useCatalog()
  const today = businessToday()
  const [rates, setRates] = useState<TripRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void listTripRates().then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError('')
      setRates(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const catalogNames = zones.map((zone) => zone.name.trim()).filter(Boolean)
  const extra = rates.map((rate) => rate.zone).filter((zone) => !catalogNames.includes(zone))
  const names = [...new Set([...catalogNames, ...extra])]

  return (
    <Page width="narrow">
      <PageHeader
        title="Tarifas de viaje"
        subtitle="Monto por zona, con la fecha desde la que rige. Los viajes anteriores no cambian."
      />
      <p className="mt-3 text-sm text-muted">
        Si un viaje pasa por más de una zona, cobra la tarifa vigente que da el monto más alto. El monto por km es
        opcional y se multiplica por los km del viaje. Una vigencia anterior a hoy solo afecta a los viajes que todavía
        no se cerraron.
      </p>
      {error && (
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-danger shadow-sm">{error}</p>
      )}
      {loading ? (
        <p className="mt-4 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-muted shadow-sm">
          Cargando tarifas…
        </p>
      ) : names.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-surface px-5 py-8 text-center text-sm text-muted shadow-sm">
          Todavía no hay zonas de entrega.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {names.map((zone) => (
            <ZoneRate
              key={zone}
              zone={zone}
              today={today}
              rates={rates.filter((rate) => rate.zone === zone)}
              onSaved={(rate) => {
                setRates((current) => {
                  const rest = current.filter((item) => item.id !== rate.id)
                  return [...rest, rate].sort((left, right) => {
                    const byZone = left.zone.localeCompare(right.zone, 'es')
                    if (byZone !== 0) return byZone
                    return right.effectiveFrom.localeCompare(left.effectiveFrom)
                  })
                })
              }}
            />
          ))}
        </div>
      )}
    </Page>
  )
}

function ZoneRate({
  zone,
  today,
  rates,
  onSaved,
}: {
  zone: string
  today: string
  rates: TripRate[]
  onSaved: (rate: TripRate) => void
}) {
  const active = currentRate(rates, zone, today)
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [perTrip, setPerTrip] = useState(active ? String(active.perTrip) : '')
  const [perKm, setPerKm] = useState(active?.perKm == null ? '' : String(active.perKm))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trip = parseMoney(perTrip)
    if (trip == null || Number.isNaN(trip)) {
      setError('El monto por viaje tiene que ser un número mayor o igual a 0.')
      setNotice('')
      return
    }
    const kmText = perKm.trim()
    const km = kmText ? parseMoney(kmText) : null
    if (kmText && (km == null || Number.isNaN(km))) {
      setError('El monto por km tiene que ser un número mayor o igual a 0, o quedar vacío.')
      setNotice('')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('La fecha de vigencia no es válida.')
      setNotice('')
      return
    }
    setBusy(true)
    setError('')
    const result = await saveTripRate({ zone, effectiveFrom, perTrip: trip, perKm: km })
    setBusy(false)
    if (!result.ok) {
      setNotice('')
      setError(result.message)
      return
    }
    const saved = readSaved(result.data)
    if (!saved) {
      setError('No se pudo leer la tarifa guardada.')
      return
    }
    onSaved(saved)
    setNotice(`Vigente desde el ${formatIsoDate(effectiveFrom)}`)
  }

  return (
    <article className="rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{zone}</h2>
      <p className="mt-1 text-sm text-muted">
        {active
          ? `Hoy rige ${formatArs(active.perTrip)} por viaje${
              active.perKm == null ? '' : ` y ${formatArs(active.perKm)} por km`
            }, desde el ${formatIsoDate(active.effectiveFrom)}.`
          : 'Todavía no hay una tarifa vigente.'}
      </p>
      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm">
          Vigente desde
          <input
            type="date"
            value={effectiveFrom}
            className="mt-1 block min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base"
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Monto por viaje (ARS)
          <input
            inputMode="decimal"
            value={perTrip}
            placeholder="0"
            className="mt-1 block min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base"
            onChange={(event) => setPerTrip(event.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Monto por km (ARS, opcional)
          <input
            inputMode="decimal"
            value={perKm}
            placeholder="Vacío si no se usa"
            className="mt-1 block min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base"
            onChange={(event) => setPerKm(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50 sm:col-span-2"
          disabled={busy}
        >
          {busy ? 'Guardando…' : 'Guardar tarifa'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      {notice && <p className="mt-2 text-sm font-semibold text-success">{notice}</p>}
      {rates.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
          {rates
            .slice()
            .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))
            .map((rate) => (
              <li key={rate.id}>
                Desde {formatIsoDate(rate.effectiveFrom)}: {formatArs(rate.perTrip)} por viaje
                {rate.perKm == null ? '' : ` · ${formatArs(rate.perKm)} por km`}
              </li>
            ))}
        </ul>
      )}
    </article>
  )
}
