export type Brand = {
  name: string
  logoUrl: string
  faviconUrl: string
  colors?: Partial<Record<'primary' | 'primary-fg' | 'primary-soft' | 'sidebar-bg', string>>
}

const env = import.meta.env

export const BRAND: Brand = {
  name: env.VITE_BRAND_NAME?.trim() || 'Luminocity',
  logoUrl: env.VITE_BRAND_LOGO?.trim() || '/logo-luminocity.png',
  faviconUrl: env.VITE_BRAND_FAVICON?.trim() || '/logo-luminocity.png',
}
