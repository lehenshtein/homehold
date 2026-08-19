import { Request, Response } from 'express';
import prisma from '../../library/prisma';
import { generateSalt, hashPassword } from '../../library/password';
import { createToken } from '../../library/jwt';
import { AuthRequest } from '../../middleware/Authentication';

const MIN_PASSWORD_LENGTH = 4;
const GUEST_USERNAME = 'guest';

const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  // isGuest accounts have a random, never-shared password — they can only
  // be entered through POST /auth/guest, not this endpoint.
  if (!user || user.isGuest || hashPassword(password, user.salt) !== user.password) {
    return res.status(400).json({ message: 'Invalid username/password' });
  }

  return res.status(200).json({
    token: createToken(user.username),
    user: { username: user.username, role: user.role, isGuest: user.isGuest },
  });
};

// No password needed — everyone who clicks "Continue as guest" shares the
// same single "guest" account (created lazily on first use). This is
// deliberate, not a bug: homehold's notes feature caps the guest to one
// note + one to-do list globally, auto-expiring after 72h.
const guestLogin = async (_req: Request, res: Response) => {
  let user = await prisma.user.findUnique({ where: { username: GUEST_USERNAME } });
  if (!user) {
    const salt = generateSalt();
    const password = hashPassword(generateSalt(), salt); // random, never revealed
    user = await prisma.user.create({
      data: { username: GUEST_USERNAME, password, salt, role: 'user', isGuest: true },
    });
  }

  return res.status(200).json({
    token: createToken(user.username),
    user: { username: user.username, role: user.role, isGuest: user.isGuest },
  });
};

// requireAuthentication runs before this, so req.user is guaranteed set.
const changePassword = async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const user = req.user!;
  if (hashPassword(currentPassword, user.salt) !== user.password) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  const salt = generateSalt();
  const password = hashPassword(newPassword, salt);
  await prisma.user.update({ where: { id: user.id }, data: { password, salt } });

  return res.status(200).json({ message: 'Password updated' });
};

export default { login, guestLogin, changePassword };
