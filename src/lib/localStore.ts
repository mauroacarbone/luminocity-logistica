export function loadList<T>(key: string, isItem: (value: unknown) => value is T): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isItem)) {
      localStorage.removeItem(key)
      return []
    }
    return parsed
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      // El navegador puede bloquear el almacenamiento.
    }
    return []
  }
}

function isQuotaError(error: unknown) {
  if (error instanceof RangeError) return true
  if (typeof error !== 'object' || error === null) return false
  const name = 'name' in error ? String(error.name) : ''
  const code = 'code' in error ? Number(error.code) : Number.NaN
  const message = 'message' in error ? String(error.message) : ''
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    /quota/i.test(message)
  )
}

export function saveList(key: string, value: unknown): 'ok' | 'quota' | 'error' {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return 'ok'
  } catch (error) {
    return isQuotaError(error) ? 'quota' : 'error'
  }
}
