/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API base, e.g. https://api.example.com/api. Inlined at build time. */
  readonly VITE_API_URL?: string;
  /** 'off' publishes a service worker that removes itself, and registers none. Inlined at build time. */
  readonly VITE_SERVICE_WORKER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
