import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody } from '../lib/http';
import { noContent, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { authenticate, clearRefreshCookie, requireAuth } from '../middleware/auth';
import { hashPassword, verifyPassword } from '../lib/auth';
import { passwordSchema, usernameSchema } from '../lib/validation';
import { recordAudit } from '../services/audit.service';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

const preferenceSchema = z.object({
  publicProfile: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  showLanguages: z.boolean().optional(),
  showAvailability: z.boolean().optional(),
  showCompletedExchanges: z.boolean().optional(),
  allowExchangeRequests: z.boolean().optional(),
  allowMessagesFrom: z.enum(['MEMBERS', 'FOLLOWING', 'NOBODY']).optional(),
  emailOnExchange: z.boolean().optional(),
  emailOnMessage: z.boolean().optional(),
  emailOnSession: z.boolean().optional(),
  emailOnReview: z.boolean().optional(),
  emailOnCommunity: z.boolean().optional(),
  inAppOnEverything: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

/** GET /api/settings — everything the settings page renders. */
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [user, preference, sessions, blocks] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          profile: true,
        },
      }),
      prisma.userPreference.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id },
        update: {},
      }),
      prisma.authSession.findMany({
        where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, createdAt: true },
      }),
      prisma.userBlock.count({ where: { blockerId: req.user!.id, NOT: { reason: 'DISMISSED_MATCH' } } }),
    ]);

    if (!user) throw ApiError.notFound('Account not found.');

    return ok(res, {
      account: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        memberSince: user.createdAt,
      },
      profile: user.profile,
      preferences: preference,
      sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
      blockedCount: blocks,
      emailDelivery: { provider: process.env.EMAIL_PROVIDER ?? 'console' },
    });
  }),
);

/** PATCH /api/settings/preferences */
settingsRouter.patch(
  '/preferences',
  validateBody(preferenceSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof preferenceSchema>;
    const data = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    if (Object.keys(data).length === 0) throw ApiError.badRequest('No preferences were provided.');

    const preferences = await prisma.userPreference.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...data },
      update: data,
    });

    return ok(res, preferences);
  }),
);

const accountSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').transform((v) => v.toLowerCase()).optional(),
  username: usernameSchema.optional(),
});

/**
 * PATCH /api/settings/account — change email or username.
 * Changing the email requires re-verification.
 */
settingsRouter.patch(
  '/account',
  validateBody(accountSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof accountSchema>;
    const data: Record<string, unknown> = {};
    let emailChanged = false;

    if (body.email) {
      const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
      if (existing && existing.id !== req.user!.id) {
        throw new ApiError(409, 'DUPLICATE', 'That email address is already in use.', { fields: ['email'] });
      }
      if (existing?.id !== req.user!.id) {
        data.email = body.email;
        data.emailVerifiedAt = null;
        data.status = 'PENDING_VERIFICATION';
        emailChanged = true;
      }
    }

    if (body.username) {
      const existing = await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } });
      if (existing && existing.id !== req.user!.id) {
        throw new ApiError(409, 'DUPLICATE', 'That username is already taken.', { fields: ['username'] });
      }
      if (existing?.id !== req.user!.id) data.username = body.username;
    }

    if (Object.keys(data).length === 0) throw ApiError.badRequest('No account changes were provided.');

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, email: true, username: true, status: true, emailVerifiedAt: true },
    });

    await recordAudit({
      actorId: req.user!.id,
      action: emailChanged ? 'account.email_changed' : 'account.username_changed',
      entityType: 'User',
      entityId: req.user!.id,
      summary: emailChanged ? 'Email address changed; verification required' : 'Username changed',
      ipAddress: req.ip,
    });

    return ok(res, { ...updated, emailVerified: Boolean(updated.emailVerifiedAt), requiresVerification: emailChanged });
  }),
);

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: passwordSchema,
});

/** PATCH /api/settings/password — requires the current password. */
settingsRouter.patch(
  '/password',
  validateBody(passwordChangeSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof passwordChangeSchema>;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { passwordHash: true },
    });
    if (!user) throw ApiError.notFound('Account not found.');

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, 'INVALID_PASSWORD', 'Your current password is not correct.', {
        issues: [{ path: 'currentPassword', message: 'Your current password is not correct.' }],
      });
    }

    const same = await verifyPassword(newPassword, user.passwordHash);
    if (same) throw ApiError.unprocessable('Choose a password you have not used before.', {
      issues: [{ path: 'newPassword', message: 'Choose a different password.' }],
    });

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } }),
      // Every other session is revoked; the current one is kept.
      prisma.authSession.updateMany({
        where: { userId: req.user!.id, id: { not: req.user!.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      actorId: req.user!.id,
      action: 'account.password_changed',
      entityType: 'User',
      entityId: req.user!.id,
      summary: 'Password changed; other sessions revoked',
      ipAddress: req.ip,
    });

    return ok(res, { changed: true, otherSessionsRevoked: true });
  }),
);

/** GET /api/settings/export — full personal data export (JSON). */
settingsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [
      user,
      skills,
      availability,
      requestsSent,
      requestsReceived,
      participations,
      sessions,
      notes,
      milestones,
      reviewsWritten,
      reviewsReceived,
      posts,
      comments,
      follows,
      messages,
      notifications,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          emailVerifiedAt: true,
          profile: true,
          preference: true,
        },
      }),
      prisma.userSkill.findMany({
        where: { userId },
        select: { direction: true, level: true, description: true, outcomes: true, portfolioUrl: true, skill: { select: { name: true } } },
      }),
      prisma.availability.findMany({ where: { userId } }),
      prisma.exchangeRequest.findMany({
        where: { initiatorId: userId },
        select: { id: true, status: true, message: true, goals: true, createdAt: true, recipient: { select: { username: true } } },
      }),
      prisma.exchangeRequest.findMany({
        where: { recipientId: userId },
        select: { id: true, status: true, message: true, goals: true, createdAt: true, initiator: { select: { username: true } } },
      }),
      prisma.exchangeParticipant.findMany({
        where: { userId },
        select: {
          role: true,
          status: true,
          agreedAt: true,
          completedAt: true,
          exchange: { select: { id: true, title: true, status: true, goals: true, createdAt: true, completedAt: true } },
        },
      }),
      prisma.session.findMany({
        where: { exchange: { participants: { some: { userId } } } },
        select: { id: true, title: true, agenda: true, notes: true, startsAt: true, endsAt: true, status: true, timezone: true },
      }),
      prisma.exchangeNote.findMany({ where: { authorId: userId }, select: { body: true, resourceUrl: true, createdAt: true } }),
      prisma.milestone.findMany({ where: { authorId: userId }, select: { title: true, description: true, status: true, dueAt: true, completedAt: true } }),
      prisma.review.findMany({
        where: { authorId: userId },
        select: { rating: true, comment: true, createdAt: true, subject: { select: { username: true } } },
      }),
      prisma.review.findMany({
        where: { subjectId: userId, hiddenAt: null },
        select: { rating: true, comment: true, createdAt: true, author: { select: { username: true } } },
      }),
      prisma.communityPost.findMany({ where: { authorId: userId }, select: { title: true, body: true, postType: true, createdAt: true } }),
      prisma.communityComment.findMany({ where: { authorId: userId }, select: { body: true, createdAt: true, postId: true } }),
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { createdAt: true, following: { select: { username: true } } },
      }),
      prisma.message.findMany({
        where: { senderId: userId },
        select: { body: true, createdAt: true, conversationId: true },
        take: 5000,
      }),
      prisma.notification.findMany({
        where: { userId },
        select: { type: true, title: true, body: true, createdAt: true, readAt: true },
        take: 2000,
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportFormatVersion: 1,
      note: 'This file contains all personal data SkillSpring stores about your account.',
      account: user,
      skills: skills.map((s) => ({ ...s, skill: s.skill.name })),
      availability,
      exchangeRequests: { sent: requestsSent, received: requestsReceived },
      exchanges: participations,
      sessions,
      sharedNotes: notes,
      milestones,
      reviews: { written: reviewsWritten, received: reviewsReceived },
      community: { posts, comments },
      follows,
      messages,
      notifications,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="skillspring-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return res.status(200).send(JSON.stringify(payload, null, 2));
  }),
);

/** POST /api/settings/deactivate — reversible. */
settingsRouter.post(
  '/deactivate',
  validateBody(z.object({ password: z.string().min(1, 'Confirm your password.') })),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password: string };
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_PASSWORD', 'That password is not correct.', {
        issues: [{ path: 'password', message: 'That password is not correct.' }],
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.user!.id },
        data: { status: 'DEACTIVATED', deactivatedAt: new Date() },
      }),
      prisma.authSession.updateMany({
        where: { userId: req.user!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await recordAudit({
      actorId: req.user!.id,
      action: 'account.deactivated',
      entityType: 'User',
      entityId: req.user!.id,
      summary: 'Account deactivated by the member',
      ipAddress: req.ip,
    });

    clearRefreshCookie(res);
    return ok(res, { deactivated: true });
  }),
);

/** POST /api/settings/reactivate — restores a deactivated account. */
settingsRouter.post(
  '/reactivate',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { status: 'ACTIVE', deactivatedAt: null },
    });
    return ok(res, { reactivated: true });
  }),
);

/**
 * DELETE /api/settings/account — permanent deletion.
 * Requires an explicit confirmation string plus the password, and the database
 * cascades remove owned content. Messages the member sent to others are kept but
 * their author row is removed by the cascade, which is why we notify partners
 * first.
 */
settingsRouter.delete(
  '/account',
  validateBody(
    z.object({
      password: z.string().min(1, 'Confirm your password.'),
      confirmation: z.literal('DELETE MY ACCOUNT', {
        errorMap: () => ({ message: 'Type DELETE MY ACCOUNT exactly to confirm.' }),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password: string; confirmation: string };

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { passwordHash: true, username: true },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_PASSWORD', 'That password is not correct.', {
        issues: [{ path: 'password', message: 'That password is not correct.' }],
      });
    }

    // Tell active exchange partners before the account disappears.
    const partners = await prisma.exchangeParticipant.findMany({
      where: {
        userId: { not: req.user!.id },
        exchange: {
          status: { in: ['PENDING', 'ACCEPTED', 'ACTIVE', 'PAUSED'] },
          participants: { some: { userId: req.user!.id } },
        },
      },
      select: { userId: true },
    });

    for (const p of new Set(partners.map((x) => x.userId))) {
      await createNotification(
        {
          userId: p,
          type: 'EXCHANGE_CANCELLED',
          title: 'An exchange partner closed their account',
          body: `@${user.username} deleted their account, so any active exchanges were cancelled.`,
          link: '/exchanges/requests',
        },
        emitToUser,
      );
    }

    await recordAudit({
      actorId: null,
      action: 'account.deleted',
      entityType: 'User',
      entityId: req.user!.id,
      summary: `Account @${user.username} deleted by the member`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await prisma.user.delete({ where: { id: req.user!.id } });

    clearRefreshCookie(res);
    return noContent(res);
  }),
);
