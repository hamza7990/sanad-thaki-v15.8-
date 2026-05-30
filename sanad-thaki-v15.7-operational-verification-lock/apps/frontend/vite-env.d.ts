/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_NAME_AR: string;
  readonly VITE_DEFAULT_LOCALE: string;
  readonly VITE_ENABLE_SSE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
