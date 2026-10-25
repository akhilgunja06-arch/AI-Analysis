import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody } from '../lib/http';
import { created, noContent, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import {
  REFRESH_COOKIE,
  generateOneTimeToken,
  generateRefreshToken,
  hashPassword,
  refreshExpiry,
  sha256,
  signAccessToken,
  verifyPassword,
} from '../lib/auth';
import {
  authenticate,
  clearRefreshCookie,
  cookieOptions,
  optionalAuthenticate,
  requireAuth,
  type AuthUser,
} from '../middleware/auth';
import { authLimiter } from '../middleware/errors';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  usernameSchema,
} from '../lib/validation';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { passwordResetEmail, verificationEmail } from '../services/email.service';
import { recordAudit } from '../services/audit.service';

export const authRouter = Router();

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'api', 'skillspring',
  'moderator', 'mod', 'system', 'null', 'undefined', 'me', 'settings', 'login', 'register',
]);

const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema.refine((u) => !RESERVED_USERNAMES.has(u), 'That username is reserved.'),
  password: passwordSchema,
  displayName: displayNameSchema,
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and privacy policy.' }),
  }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

const emailOnlySchema = z.object({ email: emailSchema });
const tokenSchema = z.object({ token: z.string().min(10, 'This link is not valid.') });
const resetSchema = z.object({ token: z.string().min(10, 'This link is not valid.'), password: passwordSchema });

type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
};

function shapeSessionUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

/** Creates a refresh session and sets the httpOnly cookie. */
async function issueSession(
  user: SessionUser,
  meta: { userAgent?: string; ip?: string },
  res: Parameters<typeof created>[0],
) {
  const refresh = generateRefreshToken();
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: refresh.hash,
      userAgent: meta.userAgent?.slice(0, 300),
      ipAddress: meta.ip?.slice(0, 64),
      expiresAt: refreshExpiry(),
    },
    select: { id: true },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role as AuthUser['role'],
    sid: session.id,
  });

  res.cookie(REFRESH_COOKIE, refresh.token, cookieOptions(env.refreshTokenTtlMs));
  return { accessToken, sessionId: session.id };
}

// ------------------------------------------------------------------ register

authRouter.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, username, password, displayName } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      // Same message either way; the field list tells the client what to fix.
      const fields: string[] = [];
      if (existing.email === email) fields.push('email');
      if (existing.username === username) fields.push('username');
      throw new ApiError(409, 'DUPLICATE', 'An account already uses those details.', { fields });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          status: 'PENDING_VERIFICATION',
          profile: { create: { displayName } },
          preference: { create: {} },
        },
        select: { id: true, email: true, username: true, role: true, status: true, emailVerifiedAt: true },
      });

      const token = generateOneTimeToken();
      await tx.authToken.create({
        data: {
          userId: createdUser.id,
          purpose: 'EMAIL_VERIFICATION',
          tokenHash: token.hash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { createdUser, verificationToken: token.token };
    });

    const delivery = await verificationEmail(email, displayName, user.verificationToken);

    await recordAudit({
      actorId: user.createdUser.id,
      action: 'auth.registered',
      entityType: 'User',
      entityId: user.createdUser.id,
      summary: `Account registered for ${username}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const session = await issueSession(user.createdUser, { userAgent: req.headers['user-agent'], ip: req.ip }, res);

    return created(res, {
      user: shapeSessionUser(user.createdUser),
      accessToken: session.accessToken,
      emailDelivery: delivery.delivered ? 'sent' : 'not_sent',
      // Development convenience only: real deployments deliver by email.
      ...(env.isProd ? {} : { devVerificationToken: user.verificationToken }),
    });
  }),
);

// --------------------------------------------------------------------- login

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        passwordHash: true,
      },
    });

    // Identical response for unknown email and wrong password.
    const genericFailure = ApiError.unauthorized('Those credentials do not match our records.');
    if (!user) {
      await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw genericFailure;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      logger.warn('auth.login_failed', { userId: user.id, ip: req.ip });
      throw genericFailure;
    }

    if (user.status === 'SUSPENDED') {
      throw ApiError.forbidden('This account is suspended. Contact support for help.');
    }
    if (user.status === 'DEACTIVATED') {
      throw ApiError.forbidden('This account has been deactivated. Contact support to restore it.');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await issueSession(user, { userAgent: req.headers['user-agent'], ip: req.ip }, res);

    return ok(res, { user: shapeSessionUser(user), accessToken: session.accessToken });
  }),
);

// ------------------------------------------------------------------- refresh

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!raw) throw ApiError.unauthorized('Your session has expired. Please sign in again.');

    const hash = sha256(raw);
    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, username: true, role: true, status: true, emailVerifiedAt: true } },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    if (session.user.status === 'SUSPENDED' || session.user.status === 'DEACTIVATED') {
      clearRefreshCookie(res);
      throw ApiError.forbidden('This account is not active.');
    }

    // Rotate: the presented refresh token is invalidated and replaced.
    const next = generateRefreshToken();
    await prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: next.hash, lastUsedAt: new Date(), expiresAt: refreshExpiry() },
    });

    const accessToken = signAccessToken({
      sub: session.user.id,
      role: session.user.role as AuthUser['role'],
      sid: session.id,
    });

    res.cookie(REFRESH_COOKIE, next.token, cookieOptions(env.refreshTokenTtlMs));
    return ok(res, { user: shapeSessionUser(session.user), accessToken });
  }),
);

// -------------------------------------------------------------------- logout

authRouter.post(
  '/logout',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (raw) {
      await prisma.authSession.updateMany({
        where: { refreshTokenHash: sha256(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);
    return noContent(res);
  }),
);

/** Revokes every session for the current user (used after a password change). */
authRouter.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await prisma.authSession.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(res);
    return ok(res, { revokedSessions: result.count });
  }),
);

// ----------------------------------------------------------------------- me

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        profile: true,
        preference: true,
      },
    });
    if (!user) throw ApiError.notFound('Account not found.');
    return ok(res, {
      ...shapeSessionUser(user),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      profile: user.profile,
      preferences: user.preference,
    });
  }),
);

// -------------------------------------------------------- email verification

authRouter.post(
  '/verify-email',
  validateBody(tokenSchema),
  asyncHandler(async (req, res) => {
    const { token } = req.body as z.infer<typeof tokenSchema>;
    const record = await prisma.authToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.purpose !== 'EMAIL_VERIFICATION' || record.usedAt || record.expiresAt < new Date()) {
      throw ApiError.badRequest('This verification link is invalid or has expired. Request a new one.');
    }

    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
      }),
    ]);

    return ok(res, { verified: true });
  }),
);

authRouter.post(
  '/resend-verification',
  authLimiter,
  validateBody(emailOnlySchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailOnlySchema>;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true, emailVerifiedAt: true, profile: { select: { displayName: true } } },
    });

    // Always the same response, so this cannot be used to enumerate accounts.
    const response = { message: 'If that address needs verification, a new link is on its way.' };
    if (!user || user.emailVerifiedAt) return ok(res, response);

    const token = generateOneTimeToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await verificationEmail(email, user.profile?.displayName ?? 'there', token.token);

    return ok(res, {
      ...response,
      ...(env.isProd ? {} : { devVerificationToken: token.token }),
    });
  }),
);

// ------------------------------------------------------------ password reset

authRouter.post(
  '/forgot-password',
  authLimiter,
  validateBody(emailOnlySchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof emailOnlySchema>;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true, profile: { select: { displayName: true } } },
    });

    const response = { message: 'If an account exists for that address, a reset link is on its way.' };
    if (!user || user.status === 'DEACTIVATED') return ok(res, response);

    // Invalidate any outstanding reset tokens before issuing a new one.
    await prisma.authToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateOneTimeToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await passwordResetEmail(email, user.profile?.displayName ?? 'there', token.token);

    return ok(res, {
      ...response,
      ...(env.isProd ? {} : { devResetToken: token.token }),
    });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validateBody(resetSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as z.infer<typeof resetSchema>;

    const record = await prisma.authToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, userId: true, purpose: true, expiresAt: true, usedAt: true },
    });
    if (!record || record.purpose !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
      throw ApiError.badRequest('This reset link is invalid or has expired. Request a new one.');
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // A password change invalidates every existing session.
      prisma.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      actorId: record.userId,
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: record.userId,
      summary: 'Password reset completed; all sessions revoked',
      ipAddress: req.ip,
    });

    clearRefreshCookie(res);
    return ok(res, { reset: true });
  }),
);

// -------------------------------------------------------------- session list

authRouter.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.authSession.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, createdAt: true, expiresAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return ok(res, {
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
    });
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await prisma.authSession.updateMany({
      where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw ApiError.notFound('That session was not found.');
    if (req.params.id === req.user!.sessionId) clearRefreshCookie(res);
    return ok(res, { revoked: true });
  }),
);

/**
 * OAuth providers are intentionally not implemented. The endpoint exists so the
 * frontend can discover that fact instead of rendering a dead button.
 */
authRouter.get(
  '/providers',
  asyncHandler(async (_req, res) =>
    ok(res, {
      providers: [],
      passwordAuth: true,
      note: 'Third-party sign-in is not configured on this deployment. Use email and password.',
    }),
  ),
);
