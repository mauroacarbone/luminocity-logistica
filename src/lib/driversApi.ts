import { apiRequest, type ApiFailure } from './api'

export type DriverFix = {
  lat: number
  lng: number
  accuracy: number | null
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

export type AssignableDriver = {
  id: string
  name: string
  email: string
  phone: string
  active: boolean
  trialDriver: boolean
}

function asAssignableDriver(value: unknown): AssignableDriver | null {
  if (!value || typeof value !== 'object') return null
  const driver = value as Record<string, unknown>
  if (typeof driver.id !== 'string' || !driver.id) return null
  if (typeof driver.name !== 'string' || !driver.name.trim()) return null
  if (typeof driver.active !== 'boolean') return null
  return {
    id: driver.id,
    name: driver.name.trim(),
    email: typeof driver.email === 'string' ? driver.email : '',
    phone: typeof driver.phone === 'string' ? driver.phone : '',
    active: driver.active,
    trialDriver: driver.trialDriver === true,
  }
}

export async function listAssignableDrivers(): Promise<{ ok: true; data: AssignableDriver[] } | ApiFailure> {
  const result = await apiRequest('/api/drivers', 'GET', undefined, 'No se pudieron cargar los choferes.')
  if (!result.ok) return result
  if (!Array.isArray(result.data)) {
    return { ok: false, status: 500, message: 'No se pudieron cargar los choferes.' }
  }
  return { ok: true, data: result.data.flatMap((item) => {
    const driver = asAssignableDriver(item)
    return driver ? [driver] : []
  }) }
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
