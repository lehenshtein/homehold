import { Response } from 'express';
import { NoteVisibility } from '@prisma/client';
import prisma from '../../library/prisma';
import { AuthRequest } from '../../middleware/Authentication';
import {
  cleanupExpiredGuestNotes, randomColor, serializeSummary, serializeDetail,
  noteInclude, visibilityWhere, isNoteVisibleTo, VALID_VISIBILITIES,
} from './note.lib';

const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 5000;
const MAX_ITEM_LENGTH = 300;
const MAX_ITEMS = 50;

const list = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  await cleanupExpiredGuestNotes();

  const filter = (req.query.filter as string) || 'all';
  const where =
    filter === 'mine'
      ? { ownerId: user.id }
      : filter === 'shared'
        ? { ownerId: { not: user.id }, OR: visibilityWhere(user) }
        : { OR: [{ ownerId: user.id }, ...visibilityWhere(user)] };

  const notes = await prisma.note.findMany({
    where,
    include: noteInclude,
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(notes.map((n) => serializeSummary(n, user.id)));
};

const create = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { type, title, content, items } = req.body;

  if (type !== 'note' && type !== 'todo') {
    return res.status(400).json({ message: 'type must be "note" or "todo"' });
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ message: `Title is required (max ${MAX_TITLE_LENGTH} chars)` });
  }
  if (type === 'note' && content && String(content).length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ message: 'Note content is too long' });
  }

  await cleanupExpiredGuestNotes();

  if (user.isGuest) {
    const existingOfType = await prisma.note.count({ where: { ownerId: user.id, type } });
    if (existingOfType > 0) {
      return res.status(400).json({
        message: `Guest can only have one ${type === 'note' ? 'note' : 'to-do list'} at a time — wait for it to expire (72h) or delete it first.`,
      });
    }
  }

  const note = await prisma.note.create({
    data: {
      type,
      title: title.trim(),
      content: type === 'note' ? String(content || '').slice(0, MAX_CONTENT_LENGTH) : null,
      color: randomColor(),
      ownerId: user.id,
      items:
        type === 'todo' && Array.isArray(items)
          ? {
              create: items
                .filter((i: unknown): i is string => typeof i === 'string' && i.trim().length > 0)
                .slice(0, MAX_ITEMS)
                .map((text: string, position: number) => ({ text: text.trim().slice(0, MAX_ITEM_LENGTH), position })),
            }
          : undefined,
    },
    include: { ...noteInclude, items: true },
  });

  return res.status(201).json(serializeDetail(note, user.id));
};

async function loadNote(noteId: string, user: { id: string; isGuest: boolean }) {
  const note = await prisma.note.findUnique({ where: { id: noteId }, include: { ...noteInclude, items: true } });
  if (!note) return { note: null, isOwner: false, isVisible: false };
  const isOwner = note.ownerId === user.id;
  return { note, isOwner, isVisible: isNoteVisibleTo(note, user) };
}

const read = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isVisible } = await loadNote(req.params.id, user);
  if (!note || !isVisible) {
    return res.status(404).json({ message: 'Note not found' });
  }
  return res.status(200).json(serializeDetail(note, user.id));
};

const update = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only edit your own notes' });

  const { title, content } = req.body;
  const data: { title?: string; content?: string } = {};
  if (title !== undefined) {
    if (!title || String(title).trim().length === 0 || String(title).length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ message: `Title is required (max ${MAX_TITLE_LENGTH} chars)` });
    }
    data.title = String(title).trim();
  }
  if (content !== undefined && note.type === 'note') {
    if (String(content).length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ message: 'Note content is too long' });
    }
    data.content = String(content);
  }

  const updated = await prisma.note.update({
    where: { id: note.id },
    data,
    include: { ...noteInclude, items: true },
  });
  return res.status(200).json(serializeDetail(updated, user.id));
};

const remove = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only delete your own notes' });

  await prisma.note.delete({ where: { id: note.id } });
  return res.status(200).json({ message: 'Deleted' });
};

const addItem = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only edit your own notes' });
  if (note.type !== 'todo') return res.status(400).json({ message: 'Not a to-do list' });
  if (note.items.length >= MAX_ITEMS) return res.status(400).json({ message: 'Too many items' });

  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_ITEM_LENGTH) {
    return res.status(400).json({ message: `Item text is required (max ${MAX_ITEM_LENGTH} chars)` });
  }

  await prisma.todoItem.create({
    data: { noteId: note.id, text: text.trim(), position: note.items.length },
  });

  const updated = await prisma.note.findUnique({ where: { id: note.id }, include: { ...noteInclude, items: true } });
  return res.status(201).json(serializeDetail(updated!, user.id));
};

const updateItem = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only edit your own notes' });

  const item = note.items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Item not found' });

  const { text, done } = req.body;
  const data: { text?: string; done?: boolean } = {};
  if (text !== undefined) {
    if (!text || String(text).trim().length === 0 || String(text).length > MAX_ITEM_LENGTH) {
      return res.status(400).json({ message: `Item text is required (max ${MAX_ITEM_LENGTH} chars)` });
    }
    data.text = String(text).trim();
  }
  if (done !== undefined) data.done = !!done;

  await prisma.todoItem.update({ where: { id: item.id }, data });

  const updated = await prisma.note.findUnique({ where: { id: note.id }, include: { ...noteInclude, items: true } });
  return res.status(200).json(serializeDetail(updated!, user.id));
};

const deleteItem = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only edit your own notes' });

  const item = note.items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Item not found' });

  await prisma.todoItem.delete({ where: { id: item.id } });

  const updated = await prisma.note.findUnique({ where: { id: note.id }, include: { ...noteInclude, items: true } });
  return res.status(200).json(serializeDetail(updated!, user.id));
};

// Sets the note's whole sharing state in one call: the visibility level,
// plus (only when visibility = 'specific') the exact set of users who can
// see it. Replaces any previous NoteShare rows outright rather than
// incrementally add/removing — matches the multiselect UI, which submits
// "here is the full list" each time.
const updateSharing = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { note, isOwner } = await loadNote(req.params.id, user);
  if (!note) return res.status(404).json({ message: 'Note not found' });
  if (!isOwner) return res.status(403).json({ message: 'You can only manage sharing on your own notes' });

  const { visibility, userIds } = req.body;
  if (!VALID_VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ message: 'Invalid visibility' });
  }

  let targetIds: string[] = [];
  if (visibility === 'specific') {
    const requested = Array.isArray(userIds) ? [...new Set(userIds.filter((id: unknown): id is string => typeof id === 'string'))] : [];
    if (requested.length > 0) {
      // Only real, non-guest, non-owner users can be individually targeted
      // — guest access is a separate visibility level ('guests'), not an
      // individual pick, so it never shows up in this list either way.
      const validUsers = await prisma.user.findMany({
        where: { id: { in: requested }, isGuest: false, NOT: { id: user.id } },
        select: { id: true },
      });
      targetIds = validUsers.map((u) => u.id);
    }
  }

  await prisma.$transaction([
    prisma.noteShare.deleteMany({ where: { noteId: note.id } }),
    ...(targetIds.length > 0
      ? [prisma.noteShare.createMany({ data: targetIds.map((userId) => ({ noteId: note.id, userId })) })]
      : []),
    prisma.note.update({ where: { id: note.id }, data: { visibility: visibility as NoteVisibility } }),
  ]);

  const updated = await prisma.note.findUnique({ where: { id: note.id }, include: { ...noteInclude, items: true } });
  return res.status(200).json(serializeDetail(updated!, user.id));
};

export default { list, create, read, update, remove, addItem, updateItem, deleteItem, updateSharing };
