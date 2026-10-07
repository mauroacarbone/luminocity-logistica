import { apiRequest, type ApiResult } from './api'
import { loadToken, rememberSessionNotice } from './authStore'

export type PickingStatus = 'pendiente' | 'en_preparacion' | 'preparado'

export type PickingRow = {
  id: string
  createdAt: string
  updatedAt: string
  cliente: string
  comprobante: string
  articulo: string
  cantidad: number
  vendedor: string
  raw: Record<string, string | number | boolean>
  status?: PickingStatus
  pickedQty?: number
  orderId?: string
}

export type PickingBatchRow = {
  cliente: string
  comprobante: string
  articulo: string
  cantidad: number
  vendedor: string
  raw: Record<string, string | number | boolean>
  status?: PickingStatus
  pickedQty?: number
  orderId?: string
}

export type PickingBatchSummary = {
  created: number
  updated: number
  removed: number
}

export type PickingBatchError = {
  index: number
  message: string
}

export type PickingBatchFailure = {
  ok: false
  status: number
  message: string
  errors?: PickingBatchError[]
}

export type PickingBatchResult =
  | { ok: true; data: PickingBatchSummary }
  | PickingBatchFailure

const STATUSES = new Set<PickingStatus>(['pendiente', 'en_preparacion', 'preparado'])

function messageFrom(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || !('message' in data)) return fallback
  const message = data.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function errorsFrom(data: unknown): PickingBatchError[] | undefined {
  if (!data || typeof data !== 'object' || !('errors' in data)) return undefined
  const errors = data.errors
  if (!Array.isArray(errors)) return undefined
  const list = errors.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.index !== 'number' || typeof row.message !== 'string') return []
    return [{ index: row.index, message: row.message }]
  })
  return list.length > 0 ? list : undefined
}

export function isPickingRow(value: unknown): value is PickingRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id) return false
  if (typeof row.cliente !== 'string') return false
  if (typeof row.comprobante !== 'string') return false
  if (typeof row.articulo !== 'string') return false
  if (typeof row.cantidad !== 'number' || !Number.isFinite(row.cantidad)) return false
  if (typeof row.vendedor !== 'string') return false
  if (!row.raw || typeof row.raw !== 'object' || Array.isArray(row.raw)) return false
  if (row.status !== undefined && (typeof row.status !== 'string' || !STATUSES.has(row.status as PickingStatus))) {
    return false
  }
  return true
}

export function listPicking() {
  return apiRequest('/api/picking', 'GET', undefined, 'No se pudo cargar el picking.')
}

export function patchPicking(id: string, fields: Record<string, unknown>) {
  return apiRequest(
    `/api/picking/${encodeURIComponent(id)}`,
    'PATCH',
    fields,
    'No se pudo actualizar la fila de picking.',
  )
}

export function deletePicking(id: string) {
  return apiRequest(
    `/api/picking/${encodeURIComponent(id)}`,
    'DELETE',
    undefined,
    'No se pudo borrar la fila de picking.',
  )
}

export async function batchPicking(
  mode: 'replace' | 'merge',
  rows: PickingBatchRow[],
): Promise<PickingBatchResult> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401, message: 'Tenés que iniciar sesión.' }

  let response: Response
  try {
    response = await fetch('/api/picking/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode, rows }),
    })
  } catch {
    return { ok: false, status: 0, message: 'No se pudo conectar con el servidor.' }
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = messageFrom(data, 'No se pudo importar el picking.')
    if (response.status === 401) {
      const code =
        data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
          ? data.code
          : ''
      if (code === 'USER_INACTIVE' || code === 'SESSION_REVOKED') rememberSessionNotice(message)
    }
    return {
      ok: false,
      status: response.status,
      message,
      errors: errorsFrom(data),
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, status: 500, message: 'No se pudo importar el picking.' }
  }
  const summary = data as Record<string, unknown>
  if (
    typeof summary.created !== 'number' ||
    typeof summary.updated !== 'number' ||
    typeof summary.removed !== 'number'
  ) {
    return { ok: false, status: 500, message: 'No se pudo importar el picking.' }
  }
  return {
    ok: true,
    data: {
      created: summary.created,
      updated: summary.updated,
      removed: summary.removed,
    },
  }
}

export async function batchPickingChunks(
  mode: 'replace' | 'merge',
  rows: PickingBatchRow[],
  chunkSize = 500,
): Promise<PickingBatchResult & { excelOffset?: number }> {
  if (rows.length === 0) {
    return { ok: false, status: 400, message: 'No hay filas para importar.' }
  }
  let created = 0
  let updated = 0
  let removed = 0
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
    const chunkMode = mode === 'replace' && start === 0 ? 'replace' : 'merge'
    const result = await batchPicking(chunkMode, chunk)
    if (!result.ok) {
      return {
        ...result,
        errors: result.errors?.map((item) => ({
          index: item.index + start,
          message: item.message,
        })),
        excelOffset: start,
      }
    }
    created += result.data.created
    updated += result.data.updated
    removed += result.data.removed
  }
  return { ok: true, data: { created, updated, removed } }
}

export function asPickingList(result: ApiResult): PickingRow[] | null {
  if (!result.ok || !Array.isArray(result.data)) return null
  if (!result.data.every(isPickingRow)) return null
  return result.data
}
