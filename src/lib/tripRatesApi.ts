import { apiRequest, type ApiFailure } from './api'

export type TripRate = {
  id: string
  zone: string
  effectiveFrom: string
  perTrip: number
  perKm: number | null
}

export type TripRateInput = {
  zone: string
  effectiveFrom: string
  perTrip: number
  perKm: number | null
}

function isTripRate(value: unknown): value is TripRate {
  if (!value || typeof value !== 'object') return false
  const rate = value as Record<string, unknown>
  return (
    typeof rate.id === 'string' &&
    rate.id.length > 0 &&
    typeof rate.zone === 'string' &&
    rate.zone.trim().length > 0 &&
    typeof rate.effectiveFrom === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(rate.effectiveFrom) &&
    typeof rate.perTrip === 'number' &&
    Number.isFinite(rate.perTrip) &&
    rate.perTrip >= 0 &&
    (rate.perKm === null || (typeof rate.perKm === 'number' && Number.isFinite(rate.perKm) && rate.perKm >= 0))
  )
}

export async function listTripRates(): Promise<{ ok: true; data: TripRate[] } | ApiFailure> {
  const result = await apiRequest('/api/trip-rates', 'GET', undefined, 'No se pudieron cargar las tarifas.')
  if (!result.ok) return result
  if (!Array.isArray(result.data) || !result.data.every(isTripRate)) {
    return { ok: false, status: 500, message: 'No se pudieron leer las tarifas.' }
  }
  return { ok: true, data: result.data }
}

export function saveTripRate(input: TripRateInput) {
  return apiRequest('/api/trip-rates', 'PUT', input, 'No se pudo guardar la tarifa.')
}
