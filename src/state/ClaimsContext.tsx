import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { type Claim, type ClaimFile, type ClaimProduct, type ClaimStatus, type RepairStep } from '../data/claims'
import {
  addClaimNote as apiAddNote,
  asClaim,
  asClaimsList,
  createClaim,
  getClaim,
  importClaims,
  isClaim,
  listClaims,
  openRepair as apiOpenRepair,
  repairContact as apiRepairContact,
  repairStep as apiRepairStep,
  takeRepair as apiTakeRepair,
  updateRepair as apiUpdateRepair,
  patchClaimStatus,
} from '../lib/claimsApi'
import { loadList } from '../lib/localStore'
import { useAuth } from './AuthContext'

const CLAIMS_KEY = 'luminocity.claims.v1'
const CLAIMS_ROLES = new Set(['vendedor', 'deposito', 'tecnico', 'encargado_deposito', 'admin'])
const IMPORT_MAX = 200
const IMPORT_BYTES = 10 * 1024 * 1024

export type NewClaim = {
  client: string
  invoices: string[]
  phone: string
  email: string
  seller: string
  motive: string
  description: string
  products: ClaimProduct[]
  photos: ClaimFile[]
  attachment?: ClaimFile
  intake?: {
    invoice: string
    client: string
    product: string
    coverage: 'garantia' | 'cobro'
    intakeAt: string
    intakeCondition: string
    intakeAccessories?: string
  }
}

export type ClaimActionResult =
  | { ok: true; id: string }
  | { ok: false; message: string }

type ClaimsContextValue = {
  claims: Claim[]
  loading: boolean
  error: string
  notice: string
  legacyOffer: Claim[] | null
  dismissNotice: () => void
  refresh: () => Promise<void>
  addClaim: (input: NewClaim) => Promise<ClaimActionResult>
  setStatus: (id: string, status: ClaimStatus) => Promise<ClaimActionResult>
  addNote: (id: string, note: string) => Promise<ClaimActionResult>
  answerRepair: (id: string, to: 'aceptado' | 'rechazado') => Promise<ClaimActionResult>
  recordRepairContact: (
    id: string,
    body: {
      channel: 'whatsapp' | 'llamada'
      kind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo'
      result?: string
      phoneKind?: 'movil' | 'fijo'
    },
  ) => Promise<ClaimActionResult>
  openRepair: (
    id: string,
    body: {
      invoice: string
      client: string
      product: string
      coverage: 'garantia' | 'cobro'
      intakeAt: string
      intakeCondition: string
      intakeAccessories?: string
    },
  ) => Promise<ClaimActionResult>
  takeRepair: (id: string, technicianId?: string) => Promise<ClaimActionResult>
  moveRepair: (
    id: string,
    to: RepairStep,
    extra?: { finalNote?: string; finalCost?: number },
  ) => Promise<ClaimActionResult>
  updateRepair: (
    id: string,
    body: {
      product?: string
      coverage?: 'garantia' | 'cobro'
      diagnosis?: string
      amount?: number
      etaDate?: string
      phoneKind?: 'movil' | 'fijo'
      intakeCondition?: string
      intakeAccessories?: string
    },
  ) => Promise<ClaimActionResult>
  ensureClaimFiles: (
    id: string,
  ) => Promise<{ ok: true; id: string; claim: Claim } | { ok: false; message: string }>
  uploadLegacy: () => Promise<{ ok: true; message: string } | { ok: false; message: string }>
  dismissLegacy: () => void
}

const ClaimsContext = createContext<ClaimsContextValue | null>(null)

function upsertClaim(list: Claim[], claim: Claim) {
  const index = list.findIndex((item) => item.id === claim.id)
  if (index < 0) return [claim, ...list]
  const next = [...list]
  next[index] = claim
  return next
}

function hasFileDataUrl(claim: Claim) {
  return Boolean(claim.photos?.some((photo) => photo.dataUrl) || claim.attachment?.dataUrl)
}

function mergeListedClaim(previous: Claim | undefined, row: Claim): Claim {
  if (!previous) return row
  const next = { ...row }
  const rowHasPhotos = Boolean(row.photos?.some((photo) => photo.dataUrl))
  if (!rowHasPhotos && previous.photos?.some((photo) => photo.dataUrl)) {
    next.photos = previous.photos
  }
  if (!row.attachment?.dataUrl && previous.attachment?.dataUrl) {
    next.attachment = previous.attachment
  }
  return next
}

function mergeClaimsList(previous: Claim[], rows: Claim[]) {
  const prevById = new Map(previous.map((claim) => [claim.id, claim]))
  return rows.map((row) => mergeListedClaim(prevById.get(row.id), row))
}

function readLegacy() {
  return loadList(CLAIMS_KEY, isClaim).items
}

function clearLegacyKey() {
  try {
    localStorage.removeItem(CLAIMS_KEY)
  } catch {
    // Si no se puede borrar, el aviso no vuelve porque ya se ofreció.
  }
}

function packClaimBatches(
  claims: Claim[],
): { batches: Claim[][] } | { error: string } {
  for (const claim of claims) {
    const alone = new Blob([JSON.stringify({ claims: [claim] })]).size
    if (alone > IMPORT_BYTES) {
      return { error: `El reclamo ${claim.id} es demasiado grande para subir.` }
    }
  }
  const batches: Claim[][] = []
  let current: Claim[] = []
  for (const claim of claims) {
    const next = [...current, claim]
    const size = new Blob([JSON.stringify({ claims: next })]).size
    if (current.length > 0 && (next.length > IMPORT_MAX || size > IMPORT_BYTES)) {
      batches.push(current)
      current = [claim]
    } else {
      current = next
    }
  }
  if (current.length > 0) batches.push(current)
  return { batches }
}

export function ClaimsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [claims, setClaims] = useState<Claim[]>([])
  const [status, setLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [legacyOffer, setLegacyOffer] = useState<Claim[] | null>(null)
  const [legacyShown, setLegacyShown] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const localChanges = useRef(0)
  const loadGeneration = useRef(0)
  const userId = user?.id ?? null
  const canUse = Boolean(user && CLAIMS_ROLES.has(user.role))
  const trackKey = canUse ? userId : null
  const [trackedKey, setTrackedKey] = useState(trackKey)

  if (trackKey !== trackedKey) {
    setTrackedKey(trackKey)
    setClaims([])
    setError('')
    setNotice('')
    setLegacyOffer(null)
    setLegacyShown(false)
    setLoadStatus(trackKey ? 'loading' : 'idle')
  }

  const loading = Boolean(trackKey) && status !== 'ready' && status !== 'error'

  const refresh = useCallback(async () => {
    setError('')
    setLoadStatus('loading')
    setAttempt((value) => value + 1)
  }, [])

  function bumpLocalChange() {
    localChanges.current += 1
  }

  useEffect(() => {
    localChanges.current = 0
    loadGeneration.current += 1
  }, [trackKey])

  useEffect(() => {
    if (!trackKey) return
    let cancelled = false
    const loadId = loadGeneration.current + 1
    loadGeneration.current = loadId

    async function applyRows(rows: Claim[]) {
      setClaims((previous) => mergeClaimsList(previous, rows))
      setLoadStatus('ready')
      if (!legacyShown && rows.length === 0) {
        const legacy = readLegacy()
        if (legacy.length > 0) setLegacyOffer(legacy)
      }
    }

    async function fetchList(isRetry: boolean) {
      const changesAtStart = localChanges.current
      const result = await listClaims()
      if (cancelled || loadId !== loadGeneration.current) return
      if (!result.ok) {
        if (result.status === 401) {
          logout()
          return
        }
        setClaims([])
        setError(result.message)
        setLoadStatus('error')
        return
      }
      const rows = asClaimsList(result)
      if (!rows) {
        setClaims([])
        setError('No se pudieron leer los reclamos.')
        setLoadStatus('error')
        return
      }
      if (localChanges.current !== changesAtStart) {
        if (!isRetry) {
          await fetchList(true)
          return
        }
        setLoadStatus('ready')
        return
      }
      await applyRows(rows)
    }

    void fetchList(false)
    return () => {
      cancelled = true
    }
  }, [attempt, legacyShown, logout, trackKey])

  async function addClaim(input: NewClaim): Promise<ClaimActionResult> {
    const result = await createClaim({
      client: input.client,
      invoices: input.invoices,
      phone: input.phone,
      email: input.email,
      seller: input.seller,
      motive: input.motive,
      description: input.description,
      products: input.products,
      photos: input.photos,
      attachment: input.attachment,
      intake: input.intake,
    })
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false, message: 'No se pudo guardar el reclamo.' }
    bumpLocalChange()
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true, id: claim.id }
  }

  async function setStatus(id: string, next: ClaimStatus): Promise<ClaimActionResult> {
    const result = await patchClaimStatus(id, next)
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false, message: 'No se pudo cambiar el estado del reclamo.' }
    bumpLocalChange()
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true, id: claim.id }
  }

  async function addNote(id: string, note: string): Promise<ClaimActionResult> {
    const text = note.trim()
    if (!text) return { ok: false, message: 'Escribí una nota.' }
    const result = await apiAddNote(id, text)
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false, message: 'No se pudo guardar la nota.' }
    bumpLocalChange()
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true, id: claim.id }
  }

  async function ensureClaimFiles(
    id: string,
  ): Promise<{ ok: true; id: string; claim: Claim } | { ok: false; message: string }> {
    const current = claims.find((item) => item.id === id)
    if (current && hasFileDataUrl(current)) {
      return { ok: true, id, claim: current }
    }
    const result = await getClaim(id)
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false, message: 'No se pudo cargar el reclamo.' }
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true, id: claim.id, claim }
  }

  async function uploadLegacy() {
    if (!legacyOffer || legacyOffer.length === 0) {
      return { ok: false as const, message: 'No hay reclamos locales para subir.' }
    }
    const packed = packClaimBatches(legacyOffer)
    if ('error' in packed) return { ok: false as const, message: packed.error }
    let imported = 0
    let skipped = 0
    for (const batch of packed.batches) {
      const result = await importClaims(batch)
      if (!result.ok) {
        if (result.status === 401) logout()
        return { ok: false as const, message: result.message }
      }
      imported += result.data.imported
      skipped += result.data.skipped.length
    }
    clearLegacyKey()
    setLegacyOffer(null)
    setLegacyShown(true)
    await refresh()
    const message =
      skipped > 0
        ? `Se subieron ${imported} reclamos (${skipped} salteados).`
        : `Se subieron ${imported} reclamos.`
    setNotice(message)
    return { ok: true as const, message }
  }

  function dismissLegacy() {
    clearLegacyKey()
    setLegacyOffer(null)
    setLegacyShown(true)
  }

  async function adoptClaim(result: Awaited<ReturnType<typeof apiRepairStep>>, fallback: string) {
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false as const, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false as const, message: fallback }
    bumpLocalChange()
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true as const, id: claim.id }
  }

  async function answerRepair(id: string, to: 'aceptado' | 'rechazado') {
    return adoptClaim(await apiRepairStep(id, to), 'No se pudo registrar la respuesta.')
  }

  async function recordRepairContact(
    id: string,
    body: {
      channel: 'whatsapp' | 'llamada'
      kind: 'presupuesto' | 'reenvio' | 'listo' | 'rechazo'
      result?: string
      phoneKind?: 'movil' | 'fijo'
    },
  ) {
    return adoptClaim(await apiRepairContact(id, body), 'No se pudo registrar el aviso.')
  }

  async function openRepair(
    id: string,
    body: {
      invoice: string
      client: string
      product: string
      coverage: 'garantia' | 'cobro'
      intakeAt: string
      intakeCondition: string
      intakeAccessories?: string
    },
  ) {
    return adoptClaim(await apiOpenRepair(id, body), 'No se pudo abrir la reparación.')
  }

  async function takeRepair(id: string, technicianId?: string) {
    return adoptClaim(
      await apiTakeRepair(id, technicianId),
      technicianId ? 'No se pudo reasignar la reparación.' : 'No se pudo levantar la reparación.',
    )
  }

  async function moveRepair(id: string, to: RepairStep, extra?: { finalNote?: string; finalCost?: number }) {
    return adoptClaim(await apiRepairStep(id, to, extra), 'No se pudo actualizar la reparación.')
  }

  async function updateRepair(
    id: string,
    body: {
      product?: string
      coverage?: 'garantia' | 'cobro'
      diagnosis?: string
      amount?: number
      etaDate?: string
      phoneKind?: 'movil' | 'fijo'
      intakeCondition?: string
      intakeAccessories?: string
    },
  ) {
    return adoptClaim(await apiUpdateRepair(id, body), 'No se pudo guardar la reparación.')
  }

  return (
    <ClaimsContext.Provider
      value={{
        claims,
        loading,
        error,
        notice,
        legacyOffer,
        dismissNotice: () => setNotice(''),
        refresh,
        addClaim,
        setStatus,
        addNote,
        answerRepair,
        recordRepairContact,
        openRepair,
        takeRepair,
        moveRepair,
        updateRepair,
        ensureClaimFiles,
        uploadLegacy,
        dismissLegacy,
      }}
    >
      {children}
    </ClaimsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClaims() {
  const value = useContext(ClaimsContext)
  if (!value) throw new Error('useClaims debe usarse dentro de ClaimsProvider')
  return value
}
