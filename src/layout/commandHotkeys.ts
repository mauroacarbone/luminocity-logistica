import Swal from 'sweetalert2'

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function shouldIgnorePaletteShortcut(menuOpen: boolean) {
  if (menuOpen) return true
  try {
    if (Swal.isVisible()) return true
  } catch {
    /* ignore */
  }
  return false
}
