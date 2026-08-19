import { NextFunction, Request, Response } from 'express';
import { User } from '@prisma/client';
import prisma from '../library/prisma';
import { verifyToken } from '../library/jwt';

export interface AuthRequest extends Request {
  user?: User | null;
}

// Mirrors eneri-be's Authentication.ts pattern: reads the raw JWT from the
// `authorization` header (no "Bearer " prefix, same as eneri-be), verifies
// it, and attaches the DB user to the request. Mounted globally in
// server.ts so req.user is available (or undefined) on every route.
export const addUserToRequest = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = req.get('authorization');
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = await prisma.user.findUnique({ where: { username: payload.username } });
    } catch {
      req.user = null;
    }
  }
  next();
};

export const requireAuthentication = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Invalid or missing auth token' });
  }
  next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Invalid or missing auth token' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You have no permissions' });
  }
  next();
};
