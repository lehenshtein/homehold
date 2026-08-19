import prisma from '../../library/prisma';
import { Note, NoteShare, NoteVisibility, TodoItem, User } from '@prisma/client';

export const PASTEL_COLORS = [
  '#FFF3B0', '#FFD6E8', '#C9F2C7', '#C7E6FF',
  '#E5D4FF', '#FFE0C2', '#D0FFF4', '#FFDDD2',
];

export function randomColor(): string {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
}

export const VALID_VISIBILITIES: NoteVisibility[] = ['private', 'public', 'guests', 'users', 'specific'];

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

// Tags are always stored normalized so `tags: { has: x }` lookups are exact
// and case/whitespace variants can't split one tag into several.
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_TAG_LENGTH))
    .filter((t) => t.length > 0);
  return [...new Set(cleaned)].slice(0, MAX_TAGS);
}

const GUEST_NOTE_TTL_MS = 72 * 60 * 60 * 1000;

// Lazily expires the guest's notes older than 72h — no cron job, just runs
// whenever someone loads or creates a note, per spec ("each time the board
// initializes, checks if it exists and if it's older than 72h, deletes").
export async function cleanupExpiredGuestNotes(): Promise<void> {
  const guest = await prisma.user.findUnique({ where: { username: 'guest' } });
  if (!guest) return;

  await prisma.note.deleteMany({
    where: {
      ownerId: guest.id,
      createdAt: { lt: new Date(Date.now() - GUEST_NOTE_TTL_MS) },
    },
  });
}

export const noteInclude = { owner: true, shares: { include: { user: true } } } as const;

type NoteWithRelations = Note & { owner: User; shares: (NoteShare & { user: User })[] };
type NoteWithItems = NoteWithRelations & { items: TodoItem[] };
type MinimalUser = { id: string; isGuest: boolean };

// Where-clause fragment matching "can this user see notes NOT owned by
// them" — same rule used by both list() and loadNote()'s isVisible check,
// kept in one place so they can't drift apart.
export function visibilityWhere(user: MinimalUser) {
  const broadVisibility: NoteVisibility = user.isGuest ? 'guests' : 'users';
  return [
    { visibility: 'public' as NoteVisibility },
    { visibility: broadVisibility },
    { visibility: 'specific' as NoteVisibility, shares: { some: { userId: user.id } } },
  ];
}

export function isNoteVisibleTo(note: NoteWithRelations, user: MinimalUser): boolean {
  if (note.ownerId === user.id) return true;
  if (note.visibility === 'public') return true;
  if (note.visibility === 'guests') return user.isGuest;
  if (note.visibility === 'users') return !user.isGuest;
  if (note.visibility === 'specific') return note.shares.some((s) => s.userId === user.id);
  return false;
}

export function serializeSummary(note: NoteWithRelations, currentUserId: string) {
  return {
    id: note.id,
    type: note.type,
    title: note.title,
    color: note.color,
    tags: note.tags,
    visibility: note.visibility,
    ownerUsername: note.owner.username,
    isMine: note.ownerId === currentUserId,
    isSharedByMe: note.ownerId === currentUserId && note.visibility !== 'private',
    sharedWithCount: note.shares.length,
    createdAt: note.createdAt,
  };
}

export function serializeDetail(note: NoteWithItems, currentUserId: string) {
  const isOwner = note.ownerId === currentUserId;
  return {
    ...serializeSummary(note, currentUserId),
    content: note.content,
    items: note.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, text: i.text, done: i.done })),
    sharedWith: isOwner ? note.shares.map((s) => ({ id: s.user.id, username: s.user.username })) : undefined,
  };
}
