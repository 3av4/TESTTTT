"use client";

/**
 * مزوّد الجلسة: يجلب /api/auth/me، ويدير الدخول عبر تلجرام أو كلمة سر المدير.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loginWithTelegram: (payload: Record<string, unknown>) => Promise<User>;
  loginAsAdmin: (password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data, error: swrError, isLoading, mutate } = useSWR<User>("/auth/me", fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 60_000,
    onErrorRetry: (err, _key, config, revalidate, opts) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return;
      setTimeout(() => revalidate(opts), 5000);
    },
  });

  useEffect(() => {
    if (swrError instanceof ApiError && (swrError.status === 401 || swrError.status === 403)) {
      setUser(null);
      setLoading(false);
      setError(swrError.status === 403 ? swrError.message : null);
      return;
    }
    if (data) {
      setUser(data);
      setLoading(false);
      setError(null);
    } else if (!isLoading) {
      setUser(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [data, swrError, isLoading]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const loginWithTelegram = useCallback(
    async (payload: Record<string, unknown>) => {
      const result = await api.post<{ user: User }>("/auth/telegram", payload);
      setUser(result.user);
      await mutate(result.user, { revalidate: true });
      return result.user;
    },
    [mutate],
  );

  const loginAsAdmin = useCallback(
    async (password: string) => {
      const result = await api.post<{ user: User }>("/auth/admin-login", { password });
      setUser(result.user);
      await mutate(result.user, { revalidate: true });
      return result.user;
    },
    [mutate],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // حتى لو فشل الطلب نمسح الجلسة محلياً
    }
    setUser(null);
    await mutate(undefined, { revalidate: false });
  }, [mutate]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAdmin: Boolean(user?.isAdmin || user?.role === "admin"),
      loading,
      error,
      refresh,
      loginWithTelegram,
      loginAsAdmin,
      logout,
    }),
    [user, loading, error, refresh, loginWithTelegram, loginAsAdmin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
