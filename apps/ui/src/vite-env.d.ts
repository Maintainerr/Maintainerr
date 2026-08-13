/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// @lingui/vite-plugin compiles .po catalogs into modules at build time.
declare module '*.po' {
  export const messages: Record<string, string>
}
