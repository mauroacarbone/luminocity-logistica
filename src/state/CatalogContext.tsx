import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  COURIER_TRANSPORTERS,
  DELIVERY_ZONES,
  OWN_TRANSPORTERS,
  PROPERTY_TYPES,
  SELLERS,
  TIME_WINDOWS,
  type DeliveryZone,
} from '../data/catalog'
import { fetchCatalog, importCatalog, parseCatalogPayload, saveCatalog } from '../lib/catalogApi'
import { useAuth } from './AuthContext'

const CATALOG_KEY = 'luminocity.catalog.v1'

export type Catalog = {
  sellers: string[]
  ownTransporters: string[]
  courierTransporters: string[]
  zones: DeliveryZone[]
  propertyTypes: string[]
  timeWindows: string[]
}

export type CatalogImportOffer = 'browser' | 'seed'

type CatalogContextValue = Catalog & {
  transporters: string[]
  loading: boolean
  error: string
  errorRef: { current: string }
  importOffer: CatalogImportOffer | null
  importing: boolean
  save: (patch: Partial<Catalog>) => Promise<boolean>
  retry: () => Promise<void>
  uploadBrowserCatalog: () => Promise<void>
  loadSeedCatalog: () => Promise<void>
}

const CatalogContext = createContext<CatalogContextValue | null>(null)
const SESSION_DEFAULTS = seedCatalog()

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

/** Lee el catálogo viejo del navegador. No es la fuente de verdad. */
function readBrowserCatalog(): Catalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredCatalog(parsed)) return null
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
    return null
  }
}

function forgetBrowserCatalog() {
  try {
    localStorage.removeItem(CATALOG_KEY)
  } catch {
    // El navegador puede bloquear el almacenamiento.
  }
}

function canImport(role: string | undefined) {
  return role === 'admin' || role === 'encargado_deposito'
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id
  const role = user?.role
  const [catalog, setCatalog] = useState<Catalog>(seedCatalog)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const errorRef = useRef('')
  const [importOffer, setImportOffer] = useState<CatalogImportOffer | null>(null)
  const [importing, setImporting] = useState(false)
  const catalogRef = useRef(catalog)
  const serverEmpty = useRef(false)
  const loadFailed = useRef(false)
  const request = useRef(0)
  const loading = Boolean(userId) && loadedFor !== userId
  const shown = !userId || loading ? SESSION_DEFAULTS : catalog

  const absorbCatalog = useCallback((result: Awaited<ReturnType<typeof fetchCatalog>>, expectedId: string) => {
    setLoadedFor(expectedId)
    if (!result.ok) {
      loadFailed.current = true
      setError(result.message)
      return
    }
    const payload = parseCatalogPayload(result.data)
    if (!payload) {
      loadFailed.current = true
      setError('No se pudieron leer los datos maestros.')
      return
    }
    loadFailed.current = false
    setError('')
    serverEmpty.current = payload.empty
    if (!payload.empty) {
      catalogRef.current = payload.catalog
      setCatalog(payload.catalog)
      setImportOffer(null)
      return
    }
    const local = canImport(role) ? readBrowserCatalog() : null
    const next = local ?? seedCatalog()
    catalogRef.current = next
    setCatalog(next)
    setImportOffer(canImport(role) ? (local ? 'browser' : 'seed') : null)
  }, [role])

  useEffect(() => {
    if (!userId) {
      loadFailed.current = false
      return
    }
    const ticket = ++request.current
    let cancel = false
    void fetchCatalog().then((result) => {
      if (cancel || ticket !== request.current) return
      absorbCatalog(result, userId)
    })
    return () => {
      cancel = true
    }
  }, [userId, role, absorbCatalog])

  async function retry() {
    if (!userId) return
    const ticket = ++request.current
    setLoadedFor(null)
    const result = await fetchCatalog()
    if (ticket !== request.current) return
    absorbCatalog(result, userId)
  }

  function report(message: string) {
    errorRef.current = message
    setError(message)
  }

  function applyPayload(data: unknown) {
    const payload = parseCatalogPayload(data)
    if (!payload) {
      report('No se pudieron leer los datos maestros.')
      return false
    }
    serverEmpty.current = payload.empty
    catalogRef.current = payload.catalog
    setCatalog(payload.catalog)
    report('')
    if (!payload.empty) setImportOffer(null)
    return true
  }

  async function reloadCatalog() {
    if (!userId) return
    const ticket = ++request.current
    const again = await fetchCatalog()
    if (ticket !== request.current) return
    if (!again.ok) {
      absorbCatalog(again, userId)
      return
    }
    if (!applyPayload(again.data) || !serverEmpty.current) return
    const local = canImport(role) ? readBrowserCatalog() : null
    const next = local ?? seedCatalog()
    catalogRef.current = next
    setCatalog(next)
    setImportOffer(canImport(role) ? (local ? 'browser' : 'seed') : null)
  }

  async function save(patch: Partial<Catalog>) {
    if (loadFailed.current) {
      errorRef.current = 'No se pudieron leer los datos maestros. Reintentá antes de guardar.'
      return false
    }
    const next = { ...catalogRef.current, ...patch }
    const viaImport = serverEmpty.current
    const result = viaImport ? await importCatalog(next) : await saveCatalog(patch)
    if (!result.ok) {
      if (result.status === 409) {
        await reloadCatalog()
        errorRef.current = viaImport
          ? 'Otro usuario ya cargó los datos maestros. Revisá la lista y volvé a guardar tu cambio.'
          : result.message
        return false
      }
      errorRef.current = result.message
      return false
    }
    const applied = applyPayload(result.data)
    if (applied && !serverEmpty.current) forgetBrowserCatalog()
    return applied
  }

  async function finishImport(result: Awaited<ReturnType<typeof importCatalog>>) {
    if (!result.ok) {
      if (result.status === 409) {
        const again = await fetchCatalog()
        if (again.ok) applyPayload(again.data)
        forgetBrowserCatalog()
        return
      }
      report(result.message)
      return
    }
    if (applyPayload(result.data)) forgetBrowserCatalog()
  }

  async function uploadBrowserCatalog() {
    const local = readBrowserCatalog()
    if (!local) {
      setImportOffer('seed')
      return
    }
    setImporting(true)
    await finishImport(await importCatalog(local))
    setImporting(false)
  }

  async function loadSeedCatalog() {
    setImporting(true)
    await finishImport(await importCatalog(null))
    setImporting(false)
  }

  return (
    <CatalogContext.Provider
      value={{
        ...shown,
        transporters: unionNames([shown.ownTransporters, shown.courierTransporters]),
        loading,
        error: userId ? error : '',
        errorRef,
        importOffer: userId && !loading ? importOffer : null,
        importing,
        save,
        retry,
        uploadBrowserCatalog,
        loadSeedCatalog,
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
