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

export function saveList(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin espacio o en modo privado, la lista sigue en memoria.
  }
}
