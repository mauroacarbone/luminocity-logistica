import { isPickingRow, type PickingRow } from './pickingApi'

type ApplyOrderRows = (orderId: string, rows: PickingRow[]) => void

let applyOrderRows: ApplyOrderRows | null = null

export function bindOrderPicking(next: ApplyOrderRows | null) {
  applyOrderRows = next
}

export function publishOrderPicking(orderId: string, rows: unknown) {
  if (!applyOrderRows || !Array.isArray(rows) || !rows.every(isPickingRow)) return
  applyOrderRows(orderId, rows)
}
