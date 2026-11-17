import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "agent" | "escalation_manager";
  region: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: (agentId: number) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const tokenKey = "opsdesk_token";
const userKey = "opsdesk_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(tokenKey);
}

function storeSession(token: string, user: AuthUser): void {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
}

function clearStoredSession(): void {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(userKey);
    if (!stored) return null;
    try { return JSON.parse(stored) as AuthUser; } catch { clearStoredSession(); return null; }
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }
    api.getMe().then((result) => { setUser(result.user); localStorage.setItem(userKey, JSON.stringify(result.user)); }).catch(() => { clearStoredSession(); setUser(null); }).finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (email, password) => { const result = await api.login(email, password); storeSession(result.token, result.user); setUser(result.user); },
    demoLogin: async (agentId) => { const result = await api.demoLogin(agentId); storeSession(result.token, result.user); setUser(result.user); },
    logout: () => { clearStoredSession(); setUser(null); window.location.href = "/login"; }
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
