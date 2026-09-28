import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import {
  COURIER_TRANSPORTERS,
  DELIVERY_ZONES,
  OWN_TRANSPORTERS,
  PROPERTY_TYPES,
  SELLERS,
  TIME_WINDOWS,
  type DeliveryZone,
} from '../data/catalog'
import { saveList } from '../lib/localStore'

const CATALOG_KEY = 'luminocity.catalog.v1'

export type Catalog = {
  sellers: string[]
  ownTransporters: string[]
  courierTransporters: string[]
  zones: DeliveryZone[]
  propertyTypes: string[]
  timeWindows: string[]
}

type CatalogContextValue = Catalog & {
  transporters: string[]
  save: (patch: Partial<Catalog>) => boolean
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

function seedCatalog(): Catalog {
  return {
    sellers: [...SELLERS],
    ownTransporters: [...OWN_TRANSPORTERS],
    courierTransporters: [...COURIER_TRANSPORTERS],
    zones: DELIVERY_ZONES.map((zone) => ({ ...zone })),
    propertyTypes: [...PROPERTY_TYPES],
    timeWindows: [...TIME_WINDOWS],
  }
}

function unionNames(lists: readonly (readonly string[])[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const list of lists) {
    for (const name of list) {
      if (seen.has(name)) continue
      seen.add(name)
      next.push(name)
    }
  }
  return next
}

function transporterLists(record: Record<string, unknown>) {
  if (isStringList(record.ownTransporters) && isStringList(record.courierTransporters)) {
    return {
      ownTransporters: record.ownTransporters,
      courierTransporters: record.courierTransporters,
    }
  }
  const legacy = isStringList(record.transporters) ? record.transporters : []
  const known = new Set([...OWN_TRANSPORTERS, ...COURIER_TRANSPORTERS])
  const extras = legacy.filter((name) => !known.has(name))
  return {
    ownTransporters: [...OWN_TRANSPORTERS, ...extras],
    courierTransporters: [...COURIER_TRANSPORTERS],
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

function isStoredCatalog(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const catalog = value as Record<string, unknown>
  return (
    isStringList(catalog.sellers) &&
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
    if (!isStoredCatalog(parsed)) {
      localStorage.removeItem(CATALOG_KEY)
      return seedCatalog()
    }
    const lists = transporterLists(parsed)
    return {
      sellers: parsed.sellers as string[],
      ownTransporters: lists.ownTransporters,
      courierTransporters: lists.courierTransporters,
      zones: (parsed.zones as DeliveryZone[]).map((zone) => ({ name: zone.name, days: zone.days })),
      propertyTypes: parsed.propertyTypes as string[],
      timeWindows: parsed.timeWindows as string[],
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
    <CatalogContext.Provider
      value={{
        ...catalog,
        transporters: unionNames([catalog.ownTransporters, catalog.courierTransporters]),
        save,
      }}
    >
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
