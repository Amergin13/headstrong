/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_TEST_COPY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
