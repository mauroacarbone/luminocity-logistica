/** Lee un token CSS de `:root`; si falta, usa el fallback. */
export function cssVar(name: string, fallback = '') {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
