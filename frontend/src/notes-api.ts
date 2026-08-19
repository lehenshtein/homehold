import { apiFetch } from './api';

export type NoteType = 'note' | 'todo';
export type NoteFilter = 'all' | 'mine' | 'shared';

// Keep this in sync with backend/prisma/schema.prisma's NoteVisibility enum
// and note.lib.ts's VALID_VISIBILITIES.
export type NoteVisibility = 'private' | 'public' | 'guests' | 'users' | 'specific';

export interface VisibilityOption {
  value: NoteVisibility;
  label: string;
  icon: string;
  help: string;
}

export const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { value: 'private', label: 'Private', icon: '🔒', help: 'Only you can see this.' },
  { value: 'public', label: 'Public', icon: '🌍', help: 'Everyone can see this — all registered users and guests.' },
  { value: 'guests', label: 'Guests', icon: '🕶️', help: 'You and the guest account can see this. Hidden from other registered users to keep their feed noise-free.' },
  { value: 'users', label: 'Registered users', icon: '👥', help: 'You and all registered users can see this — not guests.' },
  { value: 'specific', label: 'Specific people', icon: '🎯', help: 'Only you and whoever you pick below can see this.' },
];

export interface RegisteredUser {
  id: string;
  username: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface NoteSummary {
  id: string;
  type: NoteType;
  title: string;
  color: string;
  tags: string[];
  visibility: NoteVisibility;
  ownerUsername: string;
  isMine: boolean;
  isSharedByMe: boolean;
  sharedWithCount: number;
  createdAt: string;
}

export interface TodoItemDto {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteDetail extends NoteSummary {
  content: string | null;
  items: TodoItemDto[];
  // only present when isMine is true (see backend note.lib.ts serializeDetail)
  sharedWith?: RegisteredUser[];
}

export function listNotes(filter: NoteFilter, search = ''): Promise<NoteSummary[]> {
  const params = new URLSearchParams({ filter });
  if (search.trim()) params.set('search', search.trim());
  return apiFetch<NoteSummary[]>(`/note?${params}`);
}

// The caller's own tags with usage counts, most-used first. Fetched once
// per page load and filtered client-side for the type-ahead, so typing a
// tag never fires a request per keystroke.
export function listTags(): Promise<TagCount[]> {
  return apiFetch<TagCount[]>('/note/tags');
}

export function listUsers(): Promise<RegisteredUser[]> {
  return apiFetch<RegisteredUser[]>('/user');
}

export function getNote(id: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${id}`);
}

export function createNote(payload: { type: NoteType; title: string; content?: string; items?: string[]; tags?: string[] }): Promise<NoteDetail> {
  return apiFetch<NoteDetail>('/note', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateNote(id: string, payload: { title?: string; content?: string; tags?: string[] }): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteNote(id: string): Promise<void> {
  return apiFetch(`/note/${id}`, { method: 'DELETE' });
}

export function addItem(noteId: string, text: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${noteId}/items`, { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateItem(noteId: string, itemId: string, payload: { text?: string; done?: boolean }): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${noteId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteItem(noteId: string, itemId: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${noteId}/items/${itemId}`, { method: 'DELETE' });
}

export function updateSharing(noteId: string, payload: { visibility: NoteVisibility; userIds?: string[] }): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/note/${noteId}/sharing`, { method: 'PUT', body: JSON.stringify(payload) });
}
