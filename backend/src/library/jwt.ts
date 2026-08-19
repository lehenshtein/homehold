import jwt from 'jsonwebtoken';

export interface TokenPayload {
  username: string;
}

// Same shape as eneri-be: 7-day expiry, JWT_SIGN_KEY from env.
export const createToken = (username: string): string =>
  jwt.sign({ username }, process.env.JWT_SIGN_KEY || '', { expiresIn: '7d' });

export const verifyToken = (token: string): TokenPayload =>
  jwt.verify(token, process.env.JWT_SIGN_KEY || '') as TokenPayload;
