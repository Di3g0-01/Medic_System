import { institutions, users } from "../mocks/data";
import type { Institution, User } from "../types";
import { mockResponse } from "./api";

export interface Session {
  user: User;
  institution: Institution;
}

export const authService = {
  async login(username: string, password: string): Promise<Session> {
    const user = users.find((item) => item.username === username && !item.blocked);
    if (!user || password !== "demo123") throw new Error("Usuario o contraseña incorrectos");
    return mockResponse({
      user,
      institution: institutions.find((item) => item.id === user.institutionId)!,
    });
  },
  async restore(): Promise<Session | null> {
    const userId = localStorage.getItem("red-clinica-user");
    const user = users.find((item) => item.id === userId);
    if (!user) return null;
    return mockResponse({
      user,
      institution: institutions.find((item) => item.id === user.institutionId)!,
    });
  },
  persist(session: Session | null) {
    if (session) localStorage.setItem("red-clinica-user", session.user.id);
    else localStorage.removeItem("red-clinica-user");
  },
};
