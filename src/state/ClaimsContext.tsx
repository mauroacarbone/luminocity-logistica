import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import {
  type Claim,
  type ClaimEvent,
  type ClaimFile,
  type ClaimProduct,
  type ClaimStatus,
} from '../data/claims'
import { loadList, saveList } from '../lib/localStore'

const CLAIMS_KEY = 'luminocity.claims.v1'

const STATUSES = new Set<ClaimStatus>([
  'nuevo',
  'recepcion',
  'pendiente-retiro',
  'enviado-proveedor',
  'reparacion',
  'entregado',
  'cancelado',
])

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

export type ClaimSaveResult =
  | { status: 'saved'; id: string }
  | { status: 'saved-without-files'; id: string }
  | { status: 'not-saved'; id: string }

type ClaimsContextValue = {
  claims: Claim[]
  notice: string
  dismissNotice: () => void
  addClaim: (input: NewClaim) => ClaimSaveResult
  setStatus: (id: string, status: ClaimStatus) => void
  addNote: (id: string, note: string) => void
}

const ClaimsContext = createContext<ClaimsContextValue | null>(null)

function isClaimFile(value: unknown): value is ClaimFile {
  if (!value || typeof value !== 'object') return false
  const file = value as Record<string, unknown>
  return (
    typeof file.name === 'string' &&
    file.name.length > 0 &&
    typeof file.dataUrl === 'string' &&
    file.dataUrl.startsWith('data:')
  )
}

function isProduct(value: unknown): value is ClaimProduct {
  if (!value || typeof value !== 'object') return false
  const product = value as Record<string, unknown>
  return (
    typeof product.name === 'string' &&
    typeof product.quantity === 'number' &&
    Number.isInteger(product.quantity) &&
    product.quantity >= 1
  )
}

function isEvent(value: unknown): value is ClaimEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  if (typeof event.at !== 'string') return false
  if (typeof event.status !== 'string' || !STATUSES.has(event.status as ClaimStatus)) return false
  return event.note === undefined || typeof event.note === 'string'
}

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== 'object') return false
  const claim = value as Record<string, unknown>
  if (typeof claim.id !== 'string' || claim.id.length === 0) return false
  if (typeof claim.client !== 'string') return false
  if (typeof claim.phone !== 'string') return false
  if (typeof claim.email !== 'string') return false
  if (typeof claim.seller !== 'string') return false
  if (typeof claim.motive !== 'string') return false
  if (typeof claim.description !== 'string') return false
  if (typeof claim.attachmentName !== 'string') return false
  if (typeof claim.createdAt !== 'string') return false
  if (claim.resolvedAt !== undefined && typeof claim.resolvedAt !== 'string') return false
  if (typeof claim.status !== 'string' || !STATUSES.has(claim.status as ClaimStatus)) return false
  if (!Array.isArray(claim.invoices) || claim.invoices.some((item) => typeof item !== 'string')) return false
  if (!Array.isArray(claim.products) || !claim.products.every(isProduct)) return false
  if (!Array.isArray(claim.photoNames) || claim.photoNames.some((item) => typeof item !== 'string')) {
    return false
  }
  if (
    claim.photos !== undefined &&
    (!Array.isArray(claim.photos) || claim.photos.length > 5 || !claim.photos.every(isClaimFile))
  ) {
    return false
  }
  if (claim.attachment !== undefined && !isClaimFile(claim.attachment)) return false
  if (!Array.isArray(claim.events) || claim.events.length === 0 || !claim.events.every(isEvent)) return false
  return true
}

function hasStoredFiles(claim: Claim) {
  return Boolean(claim.photos?.some((photo) => photo.dataUrl) || claim.attachment?.dataUrl)
}

function withoutFiles(claim: Claim): Claim {
  return {
    ...claim,
    photos: [],
    photoNames: [],
    attachmentName: '',
    attachment: undefined,
  }
}

export function ClaimsProvider({ children }: { children: ReactNode }) {
  const [stored] = useState(() => loadList(CLAIMS_KEY, isClaim))
  const [claims, setClaims] = useState(stored.items)
  const [notice, setNotice] = useState(
    stored.rejected ? 'No se pudieron leer los reclamos guardados en este navegador.' : '',
  )
  const claimsRef = useRef(claims)

  function commit(next: Claim[], focusId: string): ClaimSaveResult {
    const apply = (list: Claim[], status: ClaimSaveResult['status']) => {
      claimsRef.current = list
      setClaims(list)
      if (status === 'saved-without-files') {
        setNotice(
          'El reclamo se guardó, pero no entraron las fotos ni el adjunto. Probá archivos más chicos.',
        )
      } else if (status === 'not-saved') {
        setNotice('No se pudo guardar el reclamo en este navegador.')
      }
      return { status, id: focusId }
    }

    const written = saveList(CLAIMS_KEY, next)
    if (written === 'ok') return apply(next, 'saved')

    const focus = next.find((claim) => claim.id === focusId)
    if (written === 'quota' && focus && hasStoredFiles(focus)) {
      const stripped = next.map((claim) => (claim.id === focusId ? withoutFiles(claim) : claim))
      if (saveList(CLAIMS_KEY, stripped) === 'ok') return apply(stripped, 'saved-without-files')
    }

    return apply(next, 'not-saved')
  }

  function addClaim(input: NewClaim): ClaimSaveResult {
    const now = new Date().toISOString()
    const id = `R-${String(Math.floor(1000000 + Math.random() * 9000000))}`
    const photos = input.photos.slice(0, 5)
    const claim: Claim = {
      id,
      client: input.client,
      invoices: input.invoices,
      phone: input.phone,
      email: input.email,
      seller: input.seller,
      motive: input.motive,
      description: input.description,
      products: input.products,
      photos,
      photoNames: photos.map((photo) => photo.name),
      attachment: input.attachment,
      attachmentName: input.attachment?.name ?? '',
      status: 'nuevo',
      createdAt: now,
      events: [{ at: now, status: 'nuevo' }],
    }
    return commit([claim, ...claimsRef.current], id)
  }

  function setStatus(id: string, status: ClaimStatus) {
    const now = new Date().toISOString()
    const current = claimsRef.current.find((claim) => claim.id === id)
    if (!current || current.status === status) return
    commit(
      claimsRef.current.map((claim) => {
        if (claim.id !== id) return claim
        return {
          ...claim,
          status,
          resolvedAt: status === 'entregado' ? now : undefined,
          events: [...claim.events, { at: now, status }],
        }
      }),
      id,
    )
  }

  function addNote(id: string, note: string) {
    const text = note.trim()
    if (!text) return
    const now = new Date().toISOString()
    const current = claimsRef.current.find((claim) => claim.id === id)
    if (!current) return
    commit(
      claimsRef.current.map((claim) => {
        if (claim.id !== id) return claim
        return {
          ...claim,
          events: [...claim.events, { at: now, status: claim.status, note: text }],
        }
      }),
      id,
    )
  }

  return (
    <ClaimsContext.Provider
      value={{ claims, notice, dismissNotice: () => setNotice(''), addClaim, setStatus, addNote }}
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
