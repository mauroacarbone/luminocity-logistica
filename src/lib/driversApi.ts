import { apiRequest, type ApiFailure } from './api'

export type DriverFix = {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

export type LiveDriver = {
  id: string
  name: string
  carrierName: string
  lat: number
  lng: number
  accuracy: number | null
  timestamp: number
  updatedAt: string
  traveling: number
}

export function postDriverLocation(point: DriverFix) {
  return apiRequest('/api/drivers/location', 'POST', point, 'No se pudo guardar la ubicación.')
}

export function clearDriverLocation() {
  return apiRequest('/api/drivers/location', 'DELETE', undefined, 'No se pudo borrar la ubicación.')
}

function isLiveDriver(value: unknown): value is LiveDriver {
  if (!value || typeof value !== 'object') return false
  const driver = value as Record<string, unknown>
  return (
    typeof driver.id === 'string' &&
    driver.id.length > 0 &&
    typeof driver.name === 'string' &&
    driver.name.trim().length > 0 &&
    typeof driver.carrierName === 'string' &&
    driver.carrierName.trim().length > 0 &&
    typeof driver.lat === 'number' &&
    Number.isFinite(driver.lat) &&
    typeof driver.lng === 'number' &&
    Number.isFinite(driver.lng) &&
    (driver.accuracy === null || (typeof driver.accuracy === 'number' && Number.isFinite(driver.accuracy))) &&
    typeof driver.timestamp === 'number' &&
    Number.isFinite(driver.timestamp) &&
    typeof driver.updatedAt === 'string' &&
    typeof driver.traveling === 'number' &&
    Number.isInteger(driver.traveling) &&
    driver.traveling > 0
  )
}

export async function fetchDriverLocations(): Promise<{ ok: true; data: LiveDriver[] } | ApiFailure> {
  const result = await apiRequest(
    '/api/drivers/locations',
    'GET',
    undefined,
    'No se pudieron cargar los choferes.',
  )
  if (!result.ok) return result
  if (!Array.isArray(result.data) || !result.data.every(isLiveDriver)) {
    return { ok: false, status: 500, message: 'No se pudieron leer las ubicaciones.' }
  }
  return { ok: true, data: result.data }
}
