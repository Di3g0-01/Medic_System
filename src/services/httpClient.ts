/**
 * Cliente HTTP único del frontend: URL base (VITE_API_URL), token JWT y manejo
 * central de errores. Con VITE_USE_MOCKS distinto de "false" los servicios
 * siguen usando los datos de src/mocks (modo demostración, p. ej. Figma Make).
 */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
const TOKEN_KEY = "red-clinica-token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string | null) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)),
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Evento global con el mensaje de un error de escritura (lo muestra AppLayout). */
export const API_ERROR_EVENT = "red-clinica:api-error";

function notify(error: ApiError, method: Method) {
  if (method !== "GET" || error.status === 0) window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: error.message }));
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const error = new ApiError("No se pudo conectar con el servidor", 0, "NETWORK");
    notify(error, method);
    throw error;
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) tokenStore.set(null);
    const error = new ApiError(payload?.error ?? `Error ${response.status}`, response.status, payload?.code);
    notify(error, method);
    throw error;
  }
  return payload as T;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

/**
 * Información restringida: el backend responde 403 a roles sin permiso. Las
 * pantallas que piden todo el expediente reciben una lista vacía (el dato
 * nunca sale del servidor; la UI ya muestra "acceso restringido").
 */
export async function listOrEmpty<T>(promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [];
    throw error;
  }
}

/** 404 → undefined, como hacían los mocks con `find`. */
export async function orUndefined<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export const enc = encodeURIComponent;
