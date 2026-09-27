import { createContext, useContext, useState, type ReactNode } from 'react'
import type { PickingLine } from '../lib/pickingSheet'

type PickingContextValue = {
  lines: PickingLine[]
  loadLines: (lines: PickingLine[]) => void
  toggleLine: (id: string) => void
}

const PickingContext = createContext<PickingContextValue | null>(null)

export function PickingProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<PickingLine[]>([])

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
