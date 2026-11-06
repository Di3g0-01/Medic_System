/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API REST, p. ej. http://localhost:4000/api */
  readonly VITE_API_URL?: string;
  /** "false" para usar la API real; cualquier otro valor (o ausente) usa los mocks. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
