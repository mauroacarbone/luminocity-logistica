import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { loadList } from '../lib/localStore'
import {
  asPickingList,
  batchPickingChunks,
  isPickingRow,
  listPicking,
  patchPicking,
  type PickingBatchRow,
  type PickingRow,
} from '../lib/pickingApi'
import type { PickingLine } from '../lib/pickingSheet'
import { useAuth } from './AuthContext'

const PICKING_KEY = 'luminocity.picking.v1'
const PICKING_ROLES = new Set(['deposito', 'encargado_deposito', 'admin'])

type LegacyLine = {
  id: string
  invoice: string
  client: string
  seller: string
  product: string
  quantity: number
  ready: boolean
  date?: string
}

type PickingContextValue = {
  lines: PickingLine[]
  loading: boolean
  error: string
  legacyOffer: LegacyLine[] | null
  refresh: () => Promise<void>
  toggleLine: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>
  uploadLegacy: () => Promise<{ ok: true; message: string } | { ok: false; message: string }>
  dismissLegacy: () => void
  applyBatch: (
    mode: 'replace' | 'merge',
    rows: PickingBatchRow[],
  ) => Promise<
    | { ok: true; created: number; updated: number; removed: number }
    | { ok: false; message: string; errors?: { index: number; message: string }[] }
  >
}

const PickingContext = createContext<PickingContextValue | null>(null)

function isLegacyLine(value: unknown): value is LegacyLine {
  if (!value || typeof value !== 'object') return false
  const line = value as Record<string, unknown>
  return (
    typeof line.id === 'string' &&
    line.id.length > 0 &&
    typeof line.invoice === 'string' &&
    typeof line.client === 'string' &&
    typeof line.seller === 'string' &&
    typeof line.product === 'string' &&
    typeof line.quantity === 'number' &&
    Number.isFinite(line.quantity) &&
    typeof line.ready === 'boolean' &&
    (line.date === undefined || typeof line.date === 'string')
  )
}

function lineFromRow(row: PickingRow): PickingLine {
  const ready =
    row.status === 'preparado' ||
    (typeof row.pickedQty === 'number' && row.pickedQty >= row.cantidad)
  return {
    id: row.id,
    invoice: row.comprobante,
    client: row.cliente,
    seller: row.vendedor,
    product: row.articulo,
    quantity: row.cantidad,
    ready,
    status: row.status,
    raw: row.raw,
  }
}

function batchFromLegacy(line: LegacyLine): PickingBatchRow {
  return {
    cliente: line.client,
    comprobante: line.invoice,
    articulo: line.product,
    cantidad: line.quantity,
    vendedor: line.seller,
    status: line.ready ? 'preparado' : 'pendiente',
    raw: {
      Factura: line.invoice,
      Cliente: line.client,
      Vendedor: line.seller,
      Producto: line.product,
      Cantidad: line.quantity,
      ...(line.date ? { Fecha: line.date } : {}),
    },
  }
}

function clearLegacyKey() {
  try {
    localStorage.removeItem(PICKING_KEY)
  } catch {
    // Si no se puede borrar, el aviso no vuelve porque ya se ofreció.
  }
}

function readLegacy(): LegacyLine[] {
  return loadList(PICKING_KEY, isLegacyLine).items
}

export function PickingProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [lines, setLines] = useState<PickingLine[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [legacyOffer, setLegacyOffer] = useState<LegacyLine[] | null>(null)
  const [legacyShown, setLegacyShown] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const userId = user?.id ?? null
  const canUse = Boolean(user && PICKING_ROLES.has(user.role))
  const trackKey = canUse ? userId : null
  const [trackedKey, setTrackedKey] = useState(trackKey)

  if (trackKey !== trackedKey) {
    setTrackedKey(trackKey)
    setLines([])
    setError('')
    setLegacyOffer(null)
    setStatus(trackKey ? 'loading' : 'idle')
  }

  const loading = Boolean(trackKey) && status !== 'ready' && status !== 'error'

  const refresh = useCallback(async () => {
    setError('')
    setStatus('loading')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!trackKey) return
    let cancelled = false
    void listPicking().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        setLines([])
        setError(result.message)
        setStatus('error')
        return
      }
      const rows = asPickingList(result)
      if (!rows) {
        setLines([])
        setError('No se pudo leer el picking.')
        setStatus('error')
        return
      }
      setLines(rows.map(lineFromRow))
      setStatus('ready')
      if (!legacyShown && rows.length === 0) {
        const legacy = readLegacy()
        if (legacy.length > 0) setLegacyOffer(legacy)
      }
    })
    return () => {
      cancelled = true
    }
  }, [attempt, legacyShown, logout, trackKey])

  async function toggleLine(id: string) {
    const current = lines.find((line) => line.id === id)
    if (!current) return { ok: false as const, message: 'No existe esa fila de picking.' }
    const nextReady = !current.ready
    const result = await patchPicking(id, {
      status: nextReady ? 'preparado' : 'pendiente',
      pickedQty: nextReady ? current.quantity : 0,
    })
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false as const, message: result.message }
    }
    if (!isPickingRow(result.data)) {
      return { ok: false as const, message: 'No se pudo actualizar la fila de picking.' }
    }
    const row = result.data
    setLines((list) => list.map((line) => (line.id === id ? lineFromRow(row) : line)))
    return { ok: true as const }
  }

  async function uploadLegacy() {
    if (!legacyOffer || legacyOffer.length === 0) {
      return { ok: false as const, message: 'No hay datos locales para subir.' }
    }
    const result = await batchPickingChunks('merge', legacyOffer.map(batchFromLegacy))
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false as const, message: result.message }
    }
    clearLegacyKey()
    setLegacyOffer(null)
    setLegacyShown(true)
    await refresh()
    return {
      ok: true as const,
      message: `Se subieron ${result.data.created + result.data.updated} filas del navegador.`,
    }
  }

  function dismissLegacy() {
    setLegacyOffer(null)
    setLegacyShown(true)
  }

  async function applyBatch(mode: 'replace' | 'merge', rows: PickingBatchRow[]) {
    const result = await batchPickingChunks(mode, rows)
    if (!result.ok) {
      if (result.status === 401) logout()
      return {
        ok: false as const,
        message: result.message,
        errors: result.errors,
      }
    }
    clearLegacyKey()
    setLegacyOffer(null)
    setLegacyShown(true)
    await refresh()
    return {
      ok: true as const,
      created: result.data.created,
      updated: result.data.updated,
      removed: result.data.removed,
    }
  }

  return (
    <PickingContext.Provider
      value={{
        lines,
        loading,
        error,
        legacyOffer,
        refresh,
        toggleLine,
        uploadLegacy,
        dismissLegacy,
        applyBatch,
      }}
    >
      {children}
    </PickingContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePicking() {
  const value = useContext(PickingContext)
  if (!value) throw new Error('usePicking debe usarse dentro de PickingProvider')
  return value
}
