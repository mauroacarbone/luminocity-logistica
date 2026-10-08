import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { type Claim, type ClaimFile, type ClaimProduct, type ClaimStatus } from '../data/claims'
import {
  addClaimNote as apiAddNote,
  asClaim,
  asClaimsList,
  createClaim,
  getClaim,
  listClaims,
  patchClaimStatus,
} from '../lib/claimsApi'
import { useAuth } from './AuthContext'

const CLAIMS_ROLES = new Set(['vendedor', 'encargado_deposito', 'admin'])

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
}

export type ClaimActionResult =
  | { ok: true; id: string }
  | { ok: false; message: string }

type ClaimsContextValue = {
  claims: Claim[]
  loading: boolean
  error: string
  notice: string
  dismissNotice: () => void
  refresh: () => Promise<void>
  addClaim: (input: NewClaim) => Promise<ClaimActionResult>
  setStatus: (id: string, status: ClaimStatus) => Promise<ClaimActionResult>
  addNote: (id: string, note: string) => Promise<ClaimActionResult>
  ensureClaimFiles: (
    id: string,
  ) => Promise<{ ok: true; id: string; claim: Claim } | { ok: false; message: string }>
}

const ClaimsContext = createContext<ClaimsContextValue | null>(null)

function upsertClaim(list: Claim[], claim: Claim) {
  const index = list.findIndex((item) => item.id === claim.id)
  if (index < 0) return [claim, ...list]
  const next = [...list]
  next[index] = claim
  return next
}

export function ClaimsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const [claims, setClaims] = useState<Claim[]>([])
  const [status, setLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const userId = user?.id ?? null
  const canUse = Boolean(user && CLAIMS_ROLES.has(user.role))
  const trackKey = canUse ? userId : null
  const [trackedKey, setTrackedKey] = useState(trackKey)

  if (trackKey !== trackedKey) {
    setTrackedKey(trackKey)
    setClaims([])
    setError('')
    setNotice('')
    setLoadStatus(trackKey ? 'loading' : 'idle')
  }

  const loading = Boolean(trackKey) && status !== 'ready' && status !== 'error'

  const refresh = useCallback(async () => {
    setError('')
    setLoadStatus('loading')
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!trackKey) return
    let cancelled = false
    void listClaims().then((result) => {
      if (cancelled) return
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
      setClaims(rows)
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [attempt, logout, trackKey])

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
    })
    if (!result.ok) {
      if (result.status === 401) logout()
      return { ok: false, message: result.message }
    }
    const claim = asClaim(result)
    if (!claim) return { ok: false, message: 'No se pudo guardar el reclamo.' }
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
    setClaims((list) => upsertClaim(list, claim))
    return { ok: true, id: claim.id }
  }

  async function ensureClaimFiles(
    id: string,
  ): Promise<{ ok: true; id: string; claim: Claim } | { ok: false; message: string }> {
    const current = claims.find((item) => item.id === id)
    if (
      current &&
      (current.photos?.some((photo) => photo.dataUrl) || current.attachment?.dataUrl)
    ) {
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

  return (
    <ClaimsContext.Provider
      value={{
        claims,
        loading,
        error,
        notice,
        dismissNotice: () => setNotice(''),
        refresh,
        addClaim,
        setStatus,
        addNote,
        ensureClaimFiles,
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
