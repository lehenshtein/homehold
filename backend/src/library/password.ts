import crypto from 'crypto';

// Same scheme as eneri-be: random salt + PBKDF2, stored as base64.
export const generateSalt = (): string => crypto.randomBytes(32).toString('base64');

export const hashPassword = (password: string, salt: string): string =>
  crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('base64');
