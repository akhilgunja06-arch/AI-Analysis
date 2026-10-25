import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;

/**
 * Passwords are hashed with bcrypt (per-password salt) plus a server-side
 * pepper, so a leaked database alone is not enough to mount an offline attack.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain + env.PASSWORD_PEPPER, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain + env.PASSWORD_PEPPER, hash);
  } catch {
    return false;
  }
}

export type AccessTokenPayload = {
  sub: string; // user id
  role: 'MEMBER' | 'MODERATOR' | 'ADMIN';
  sid: string; // session id, so a revoked session invalidates its access tokens too
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'skillspring',
    audience: 'skillspring-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
      issuer: 'skillspring',
      audience: 'skillspring-web',
    }) as jwt.JwtPayload & AccessTokenPayload;
    if (!decoded.sub || !decoded.sid || !decoded.role) return null;
    return { sub: decoded.sub, role: decoded.role, sid: decoded.sid };
  } catch {
    return null;
  }
}

/** Opaque refresh token. Only its SHA-256 hash is ever stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Single-use tokens for email verification and password reset. */
export function generateOneTimeToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

/** Constant-time comparison for token lookups done in application code. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.refreshTokenTtlMs);
}

export const REFRESH_COOKIE = 'ss_refresh';
