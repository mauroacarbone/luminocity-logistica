/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAND_NAME?: string
  readonly VITE_BRAND_LOGO?: string
  readonly VITE_BRAND_FAVICON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
