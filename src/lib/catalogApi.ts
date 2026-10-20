import type { Catalog } from '../state/CatalogContext'
import { apiRequest } from './api'

export type CatalogPayload = {
  catalog: Catalog
  empty: boolean
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isZoneList(value: unknown): value is { name: string; days: string }[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== 'object') return false
      const zone = item as Record<string, unknown>
      return typeof zone.name === 'string' && typeof zone.days === 'string'
    })
  )
}

export function parseCatalogPayload(data: unknown): CatalogPayload | null {
  if (!data || typeof data !== 'object') return null
  const body = data as Record<string, unknown>
  const catalog = body.catalog
  if (!catalog || typeof catalog !== 'object') return null
  const record = catalog as Record<string, unknown>
  if (
    !isStringList(record.sellers) ||
    !isStringList(record.ownTransporters) ||
    !isStringList(record.courierTransporters) ||
    !isZoneList(record.zones) ||
    !isStringList(record.propertyTypes) ||
    !isStringList(record.timeWindows) ||
    typeof body.empty !== 'boolean'
  ) {
    return null
  }
  return {
    empty: body.empty,
    catalog: {
      sellers: record.sellers,
      ownTransporters: record.ownTransporters,
      courierTransporters: record.courierTransporters,
      zones: record.zones.map((zone) => ({ name: zone.name, days: zone.days })),
      propertyTypes: record.propertyTypes,
      timeWindows: record.timeWindows,
    },
  }
}

export async function fetchCatalog() {
  return apiRequest('/api/catalog', 'GET', undefined, 'No se pudieron leer los datos maestros.')
}

export async function saveCatalog(patch: Partial<Catalog>) {
  return apiRequest('/api/catalog', 'PUT', patch, 'No se pudieron guardar los datos maestros.')
}

export async function importCatalog(catalog: Catalog | null) {
  return apiRequest(
    '/api/catalog/import',
    'POST',
    catalog ?? { seed: true },
    'No se pudieron cargar los datos maestros.',
  )
}
