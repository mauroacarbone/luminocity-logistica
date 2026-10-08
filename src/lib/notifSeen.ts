const SEEN_MAX = 200

function keyOf(userId: string) {
  return `luminocity.notifSeen.${userId}`
}

export function loadSeenIds(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyOf(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return []
    return parsed
  } catch {
    return []
  }
}

export function rememberSeenIds(userId: string, ids: string[]) {
  if (ids.length === 0) return
  const next = [...loadSeenIds(userId)]
  for (const id of ids) {
    if (!next.includes(id)) next.push(id)
  }
  while (next.length > SEEN_MAX) next.shift()
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(next))
  } catch {
    // Si el almacenamiento falla, el toast puede volver a mostrarse.
  }
}
