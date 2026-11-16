import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setUnauthorizedHandler, tokens } from '../api/client';

export interface AdminProfile {
  id: string;
  username: string;
  role: string;
  status: string;
  balance: number;
  avatarSeed: string;
  avatarUrl: string | null;
  telegramUsername: string | null;
  createdAt: string;
}

interface AuthCtx {
  admin: AdminProfile | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string | undefined, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

interface LoginResponse {
  user: AdminProfile;
  accessToken: string;
  refreshToken: string;
  mustChangePassword?: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!tokens.access) {
      setAdmin(null);
      return;
    }
    try {
      const res = await apiGet<{ user: AdminProfile; mustChangePassword?: boolean }>('/me');
      if (res.user.role !== 'admin') {
        tokens.clear();
        setAdmin(null);
        return;
      }
      setAdmin(res.user);
      setMustChangePassword(Boolean(res.mustChangePassword));
    } catch {
      tokens.clear();
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAdmin(null);
    });
    (async () => {
      await refreshProfile();
      setLoading(false);
    })();
  }, [refreshProfile]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiPost<LoginResponse>('/auth/login', { username, password });
    if (res.user.role !== 'admin') {
      throw new Error('Доступ только для администратора');
    }
    tokens.set(res.accessToken, res.refreshToken);
    setAdmin(res.user);
    setMustChangePassword(Boolean(res.mustChangePassword));
  }, []);

  const logout = useCallback(() => {
    const refresh = tokens.refresh;
    tokens.clear();
    setAdmin(null);
    if (refresh) {
      void apiPost('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string | undefined, newPassword: string) => {
      const res = await apiPost<{ accessToken?: string; refreshToken?: string }>(
        '/auth/change-password',
        { currentPassword, newPassword },
      );
      // The server rotates the session; keep the caller signed in.
      if (res.accessToken && res.refreshToken) {
        tokens.set(res.accessToken, res.refreshToken);
      }
      setMustChangePassword(false);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const value = useMemo(
    () => ({ admin, loading, mustChangePassword, login, logout, changePassword, refreshProfile }),
    [admin, loading, mustChangePassword, login, logout, changePassword, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
