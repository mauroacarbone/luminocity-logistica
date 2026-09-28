import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadList, saveList } from '../lib/localStore'
import type { PickingLine } from '../lib/pickingSheet'

const PICKING_KEY = 'luminocity.picking.v1'

type PickingContextValue = {
  lines: PickingLine[]
  loadLines: (lines: PickingLine[]) => void
  toggleLine: (id: string) => void
}

const PickingContext = createContext<PickingContextValue | null>(null)

function isPickingLine(value: unknown): value is PickingLine {
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

export function PickingProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<PickingLine[]>(() => loadList(PICKING_KEY, isPickingLine).items)

  useEffect(() => {
    saveList(PICKING_KEY, lines)
  }, [lines])

  function loadLines(next: PickingLine[]) {
    setLines(next)
  }

  function toggleLine(id: string) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ready: !line.ready } : line)),
    )
  }

  return (
    <PickingContext.Provider value={{ lines, loadLines, toggleLine }}>
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
