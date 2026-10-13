/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API base, e.g. https://api.example.com/api. Inlined at build time. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
