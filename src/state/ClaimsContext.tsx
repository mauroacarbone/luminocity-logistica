import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  type Claim,
  type ClaimProduct,
  type ClaimStatus,
} from '../data/claims'

export type NewClaim = {
  client: string
  invoices: string[]
  phone: string
  email: string
  seller: string
  motive: string
  description: string
  products: ClaimProduct[]
  photoNames: string[]
  attachmentName: string
}

type ClaimsContextValue = {
  claims: Claim[]
  addClaim: (input: NewClaim) => string
  setStatus: (id: string, status: ClaimStatus) => void
  addNote: (id: string, note: string) => void
}

const ClaimsContext = createContext<ClaimsContextValue | null>(null)

export function ClaimsProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState<Claim[]>([])

  function addClaim(input: NewClaim) {
    const now = new Date().toISOString()
    const id = `R-${String(Math.floor(1000000 + Math.random() * 9000000))}`
    const claim: Claim = {
      ...input,
      id,
      status: 'nuevo',
      createdAt: now,
      events: [{ at: now, status: 'nuevo' }],
    }
    setClaims((current) => [claim, ...current])
    return id
  }

  function setStatus(id: string, status: ClaimStatus) {
    const now = new Date().toISOString()
    setClaims((current) =>
      current.map((claim) => {
        if (claim.id !== id || claim.status === status) return claim
        return {
          ...claim,
          status,
          resolvedAt: status === 'entregado' ? now : undefined,
          events: [...claim.events, { at: now, status }],
        }
      }),
    )
  }

  function addNote(id: string, note: string) {
    const text = note.trim()
    if (!text) return
    const now = new Date().toISOString()
    setClaims((current) =>
      current.map((claim) => {
        if (claim.id !== id) return claim
        return {
          ...claim,
          events: [...claim.events, { at: now, status: claim.status, note: text }],
        }
      }),
    )
  }

  return (
    <ClaimsContext.Provider value={{ claims, addClaim, setStatus, addNote }}>
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
