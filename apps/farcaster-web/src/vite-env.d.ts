/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly RELEASE_ID: string;
  readonly VITE_FC_API_BASE?: string;
  readonly VITE_RELEASE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
