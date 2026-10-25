import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { REFRESH_COOKIE, verifyAccessToken } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

export type AuthUser = {
  id: string;
  role: Role;
  username: string;
  status: string;
  sessionId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // Fall back to the httpOnly cookie used by server-rendered/browser flows.
  const cookie = (req.cookies as Record<string, string> | undefined)?.ss_access;
  return cookie ?? null;
}

/**
 * Verifies the access token, then loads the user + session from the database.
 * The role is taken from the database, never from the token or the client, so a
 * role change or suspension takes effect immediately.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readAccessToken(req);
    if (!token) return next(ApiError.unauthorized('Sign in to continue.'));

    const payload = verifyAccessToken(token);
    if (!payload) return next(ApiError.unauthorized('Your session has expired. Please sign in again.'));

    const session = await prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        userId: true,
        user: { select: { id: true, role: true, username: true, status: true } },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return next(ApiError.unauthorized('Your session is no longer valid. Please sign in again.'));
    }
    if (session.userId !== payload.sub) {
      return next(ApiError.unauthorized('Your session is no longer valid. Please sign in again.'));
    }
    if (session.user.status === 'SUSPENDED') {
      return next(ApiError.forbidden('This account is suspended. Contact support for help.'));
    }
    if (session.user.status === 'DEACTIVATED') {
      return next(ApiError.forbidden('This account has been deactivated.'));
    }

    req.user = {
      id: session.user.id,
      role: session.user.role,
      username: session.user.username,
      status: session.user.status,
      sessionId: session.id,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Attaches the user when a valid token is present, but never rejects. */
export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  const token = readAccessToken(req);
  if (!token) return next();
  return authenticate(req, res, (err?: unknown) => next(err));
}

/**
 * Ensures the request is authenticated. If a previous middleware has not already
 * populated `req.user`, this runs the full authentication check itself, so a
 * route can never accidentally accept an unauthenticated caller.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next();
  return authenticate(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user) return next(ApiError.unauthorized('Sign in to continue.'));
    return next();
  });
}

/** Requires a fully verified, active account for state-changing operations. */
export function requireVerified(req: Request, res: Response, next: NextFunction) {
  return requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user?.status === 'PENDING_VERIFICATION') {
      return next(
        ApiError.forbidden('Verify your email address before using this feature.', {
          reason: 'EMAIL_NOT_VERIFIED',
        }),
      );
    }
    return next();
  });
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    return requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!req.user || !roles.includes(req.user.role)) {
        return next(ApiError.forbidden('This area is restricted to platform staff.'));
      }
      return next();
    });
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireModerator = requireRole('ADMIN', 'MODERATOR');

/** True when the caller may act as the given user id (self or admin). */
export function canActAs(req: Request, userId: string): boolean {
  if (!req.user) return false;
  return req.user.id === userId || req.user.role === 'ADMIN';
}

export function assertCanActAs(req: Request, userId: string) {
  if (!canActAs(req, userId)) {
    throw ApiError.forbidden('You can only modify your own account.');
  }
}

export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
    maxAge: maxAgeMs,
  } as const;
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    path: '/',
  });
}
