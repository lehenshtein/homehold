import { apiFetch, getToken, setToken, clearToken } from './api';

export interface CurrentUser {
  username: string;
  role: string;
  isGuest: boolean;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout(): void {
  clearToken();
}

export async function login(username: string, password: string): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(token);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchMe(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/user/me');
}

// Admin-only — backend rejects this with 403 for non-admins.
export async function createUser(username: string, password: string): Promise<void> {
  await apiFetch('/user', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}
