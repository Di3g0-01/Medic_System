import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authService, type Session } from "../services/authService";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .restore()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const next = await authService.login(username, password);
    authService.persist(next);
    setSession(next);
  };

  const logout = () => {
    authService.persist(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
