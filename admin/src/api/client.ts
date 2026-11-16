const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

const ACCESS_KEY = 'bb_admin_access';
const REFRESH_KEY = 'bb_admin_refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  tokens.set(data.accessToken, data.refreshToken);
  return true;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  retry?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, retry = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (tokens.access) headers.authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && retry && tokens.refresh) {
    if (await refreshAccessToken()) {
      return api<T>(path, { ...options, retry: false });
    }
    tokens.clear();
    onUnauthorized?.();
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = json.error ?? {};
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? 'Ошибка запроса', err.details);
  }
  return json as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiPost = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const apiPut = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const apiPatch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const apiDelete = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
