import { institutions, users } from "../mocks/data";
import type { Institution, User } from "../types";
import { mockResponse } from "./api";
import { http, tokenStore, USE_MOCKS } from "./httpClient";

export interface Session {
  user: User;
  institution: Institution;
  /** JWT emitido por la API (ausente en modo demostración). */
  token?: string;
}

const MOCK_USER_KEY = "red-clinica-user";

const mock = {
  async login(username: string, password: string): Promise<Session> {
    const user = users.find((item) => item.username === username && !item.blocked);
    if (!user || password !== "demo123") throw new Error("Usuario o contraseña incorrectos");
    return mockResponse({
      user,
      institution: institutions.find((item) => item.id === user.institutionId)!,
    });
  },
  async restore(): Promise<Session | null> {
    const userId = localStorage.getItem(MOCK_USER_KEY);
    const user = users.find((item) => item.id === userId);
    if (!user) return null;
    return mockResponse({
      user,
      institution: institutions.find((item) => item.id === user.institutionId)!,
    });
  },
  persist(session: Session | null) {
    if (session) localStorage.setItem(MOCK_USER_KEY, session.user.id);
    else localStorage.removeItem(MOCK_USER_KEY);
  },
};

const api: typeof mock = {
  async login(username, password) {
    const { token, user, institution } = await http.post<Required<Session>>("/auth/login", { username, password });
    return { token, user, institution };
  },
  /** Restaura con el token guardado; si expiró o el usuario fue bloqueado, no hay sesión. */
  async restore() {
    const token = tokenStore.get();
    if (!token) return null;
    try {
      const { user, institution } = await http.get<Session>("/auth/me");
      return { user, institution, token };
    } catch {
      tokenStore.set(null);
      return null;
    }
  },
  /** Se guarda el token JWT, no el id de usuario. */
  persist(session) {
    tokenStore.set(session?.token ?? null);
  },
};

export const authService = USE_MOCKS ? mock : api;
