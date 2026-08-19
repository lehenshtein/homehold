import { Response } from 'express';
import prisma from '../../library/prisma';
import { generateSalt, hashPassword } from '../../library/password';
import { AuthRequest } from '../../middleware/Authentication';

const MIN_PASSWORD_LENGTH = 4;

// requireAuthentication runs before this, so req.user is guaranteed set.
const me = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  return res.status(200).json({ username: user.username, role: user.role, isGuest: user.isGuest });
};

// Admin-only: create a new account with a temporary password. The new user
// logs in with it and is expected to change it via /auth/change-password.
const create = async (req: AuthRequest, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(400).json({ message: 'Username is already in use' });
  }

  const salt = generateSalt();
  const hashed = hashPassword(password, salt);
  const user = await prisma.user.create({
    data: { username, password: hashed, salt, role: 'user' },
  });

  return res.status(201).json({ username: user.username, role: user.role });
};

// Any authenticated user (not just admins) — powers the notes feature's
// "specific users" sharing multiselect. Excludes guest (guest access goes
// through the dedicated 'guests' visibility level, not individual picking)
// and excludes the caller themselves (can't share with yourself).
const list = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const users = await prisma.user.findMany({
    where: { isGuest: false, NOT: { id: user.id } },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  });
  return res.status(200).json(users);
};

export default { me, create, list };
