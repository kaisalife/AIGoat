/// <reference types="vite/client" />

// `import.meta.env` 的类型。dev 构建才有 DEV / PROD。
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
