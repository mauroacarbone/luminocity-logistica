import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import {
  DELIVERY_ZONES,
  PROPERTY_TYPES,
  SELLERS,
  TIME_WINDOWS,
  TRANSPORTERS,
  type DeliveryZone,
} from '../data/catalog'
import { saveList } from '../lib/localStore'

const CATALOG_KEY = 'luminocity.catalog.v1'

export type Catalog = {
  sellers: string[]
  transporters: string[]
  zones: DeliveryZone[]
  propertyTypes: string[]
  timeWindows: string[]
}

type CatalogContextValue = Catalog & {
  save: (patch: Partial<Catalog>) => boolean
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

function seedCatalog(): Catalog {
  return {
    sellers: [...SELLERS],
    transporters: [...TRANSPORTERS],
    zones: DELIVERY_ZONES.map((zone) => ({ ...zone })),
    propertyTypes: [...PROPERTY_TYPES],
    timeWindows: [...TIME_WINDOWS],
  }
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isFilledString)
}

function isZone(value: unknown): value is DeliveryZone {
  if (!value || typeof value !== 'object') return false
  const zone = value as Record<string, unknown>
  return isFilledString(zone.name) && isFilledString(zone.days)
}

function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false
  const catalog = value as Record<string, unknown>
  return (
    isStringList(catalog.sellers) &&
    isStringList(catalog.transporters) &&
    isStringList(catalog.propertyTypes) &&
    isStringList(catalog.timeWindows) &&
    Array.isArray(catalog.zones) &&
    catalog.zones.every(isZone)
  )
}

function loadCatalog(): Catalog {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (!raw) return seedCatalog()
    const parsed: unknown = JSON.parse(raw)
    if (!isCatalog(parsed)) {
      localStorage.removeItem(CATALOG_KEY)
      return seedCatalog()
    }
    return {
      sellers: parsed.sellers,
      transporters: parsed.transporters,
      zones: parsed.zones.map((zone) => ({ name: zone.name, days: zone.days })),
      propertyTypes: parsed.propertyTypes,
      timeWindows: parsed.timeWindows,
    }
  } catch {
    try {
      localStorage.removeItem(CATALOG_KEY)
    } catch {
      // El navegador puede bloquear el almacenamiento.
    }
    return seedCatalog()
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog>(loadCatalog)
  const catalogRef = useRef(catalog)

  function save(patch: Partial<Catalog>) {
    const next = { ...catalogRef.current, ...patch }
    if (saveList(CATALOG_KEY, next) !== 'ok') return false
    catalogRef.current = next
    setCatalog(next)
    return true
  }

  return (
    <CatalogContext.Provider value={{ ...catalog, save }}>
      {children}
    </CatalogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCatalog() {
  const value = useContext(CatalogContext)
  if (!value) {
    throw new Error('useCatalog debe usarse dentro de CatalogProvider')
  }
  return value
}
