import { BRAND } from './brand'

/** Aplica nombre, favicon y colores opcionales de la marca al documento. */
export function applyBrand() {
  document.title = BRAND.name

  const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (icon) icon.href = BRAND.faviconUrl

  const colors = BRAND.colors
  if (!colors) return
  for (const [key, value] of Object.entries(colors)) {
    if (value) document.documentElement.style.setProperty(`--${key}`, value)
  }
}
