// Backend calls go through /api — in prod nginx proxies /api/* on
// homehold.website to the backend (same origin, no CORS involved); in dev
// Vite's server.proxy does the same thing (see vite.config.ts).
const API_BASE = '/api';

const TOKEN_KEY = 'homehold_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ApiErrorBody {
  message?: string;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = token;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as ApiErrorBody).message || `Request failed (${res.status})`);
  }
  return data as T;
}
