import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAdmin, requireModerator } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { recordAudit } from '../services/audit.service';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const adminRouter = Router();

adminRouter.use(requireModerator);

// ------------------------------------------------------------------- overview

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      users,
      activeUsers,
      pendingVerification,
      suspended,
      newUsers30d,
      exchanges,
      exchangesByStatus,
      sessionsScheduled,
      messagesCount,
      postsCount,
      openReports,
      reviewsCount,
      avgRating,
      skillsCount,
      categoriesCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'PENDING_VERIFICATION' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.exchange.count(),
      prisma.exchange.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.session.count({ where: { status: 'SCHEDULED', startsAt: { gte: now } } }),
      prisma.message.count(),
      prisma.communityPost.count({ where: { status: 'PUBLISHED' } }),
      prisma.report.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      prisma.review.count({ where: { hiddenAt: null } }),
      prisma.review.aggregate({ where: { hiddenAt: null }, _avg: { rating: true } }),
      prisma.skill.count(),
      prisma.skillCategory.count(),
    ]);

    // Daily sign-ups for the last 14 days — real registrations only.
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
    });
    const signupSeries: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      signupSeries.push({
        date: key,
        count: recentUsers.filter((u) => u.createdAt.toISOString().slice(0, 10) === key).length,
      });
    }

    return ok(res, {
      users: {
        total: users,
        active: activeUsers,
        pendingVerification,
        suspended,
        newLast30Days: newUsers30d,
      },
      exchanges: {
        total: exchanges,
        byStatus: Object.fromEntries(exchangesByStatus.map((e) => [e.status, e._count._all])),
      },
      activity: {
        sessionsScheduled,
        messages: messagesCount,
        communityPosts: postsCount,
      },
      moderation: { openReports },
      reviews: {
        total: reviewsCount,
        averageRating: avgRating._avg.rating !== null ? Number(avgRating._avg.rating.toFixed(2)) : null,
      },
      taxonomy: { skills: skillsCount, categories: categoriesCount },
      signupSeries,
      generatedAt: now.toISOString(),
    });
  }),
);

// --------------------------------------------------------------- user manager

adminRouter.get(
  '/users',
  validateQuery(
    z.object({
      search: z.string().trim().max(80).optional(),
      role: z.enum(['MEMBER', 'MODERATOR', 'ADMIN']).optional(),
      status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { search?: string; role?: string; status?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 25, maxPageSize: 100 });

    const where = {
      ...(query.role ? { role: query.role as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { username: { contains: query.search, mode: 'insensitive' as const } },
              { profile: { displayName: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          profile: { select: { displayName: true, avatarUrl: true } },
          _count: { select: { participations: true, posts: true, reportsAgainst: true } },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.profile?.displayName ?? u.username,
        avatarUrl: u.profile?.avatarUrl ?? null,
        role: u.role,
        status: u.status,
        emailVerified: Boolean(u.emailVerifiedAt),
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        counts: {
          exchanges: u._count.participations,
          posts: u._count.posts,
          reportsAgainst: u._count.reportsAgainst,
        },
      })),
      total,
      page,
      pageSize,
    );
  }),
);

const userAdminSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3, 'Give a reason.').max(500) }),
  z.object({ action: z.literal('reinstate') }),
  z.object({ action: z.literal('promote'), role: z.enum(['MEMBER', 'MODERATOR', 'ADMIN']) }),
  z.object({ action: z.literal('verify-email') }),
]);

adminRouter.patch(
  '/users/:id',
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(userAdminSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as z.infer<typeof userAdminSchema>;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, status: true },
    });
    if (!user) throw ApiError.notFound('That user could not be found.');

    // An administrator cannot lock themselves out of the platform.
    if (user.id === req.user!.id && (body.action === 'suspend' || (body.action === 'promote' && body.role !== 'ADMIN'))) {
      throw ApiError.badRequest('You cannot suspend or demote your own administrator account.');
    }

    let data: Record<string, unknown> = {};
    let summary = '';

    if (body.action === 'suspend') {
      data = { status: 'SUSPENDED' };
      summary = `User @${user.username} suspended: ${body.reason}`;
      // Suspension invalidates every active session immediately.
      await prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (body.action === 'reinstate') {
      data = { status: 'ACTIVE', deactivatedAt: null };
      summary = `User @${user.username} reinstated`;
    } else if (body.action === 'promote') {
      if (user.id === req.user!.id) {
        throw ApiError.badRequest('You cannot change your own role.');
      }
      data = { role: body.role };
      summary = `User @${user.username} role set to ${body.role}`;
    } else {
      data = { emailVerifiedAt: new Date(), status: 'ACTIVE' };
      summary = `Email for @${user.username} marked verified`;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, status: true, emailVerifiedAt: true },
    });

    await recordAudit({
      actorId: req.user!.id,
      action: `admin.user.${body.action}`,
      entityType: 'User',
      entityId: id,
      summary,
      metadata: body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await createNotification(
      {
        userId: id,
        type: 'MODERATION',
        title:
          body.action === 'suspend'
            ? 'Your account has been suspended'
            : body.action === 'reinstate'
              ? 'Your account has been reinstated'
              : 'Your account was updated by an administrator',
        body:
          body.action === 'suspend'
            ? body.reason
            : 'An administrator updated your account. Contact support if you have questions.',
        link: '/help',
      },
      emitToUser,
    );

    return ok(res, { ...updated, emailVerified: Boolean(updated.emailVerifiedAt) });
  }),
);

// ------------------------------------------------------------------- reports

adminRouter.get(
  '/reports',
  validateQuery(
    z.object({
      status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
      targetType: z.enum(['USER', 'MESSAGE', 'REVIEW', 'COMMUNITY_POST', 'COMMUNITY_COMMENT']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { status?: string; targetType?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 100 });

    const where = {
      ...(query.status ? { status: query.status as never } : { status: { in: ['OPEN', 'UNDER_REVIEW'] as never } }),
      ...(query.targetType ? { targetType: query.targetType as never } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          reason: true,
          details: true,
          status: true,
          actionTaken: true,
          resolutionNote: true,
          createdAt: true,
          handledAt: true,
          reporter: { select: { username: true, profile: { select: { displayName: true } } } },
          targetUser: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        },
      }),
    ]);

    // Attach a short excerpt of the reported content so moderators can judge it.
    const enriched = await Promise.all(
      rows.map(async (r) => {
        let excerpt: string | null = null;
        if (r.targetType === 'MESSAGE' && r.targetId) {
          const msg = await prisma.message.findUnique({ where: { id: r.targetId }, select: { body: true } });
          excerpt = msg?.body.slice(0, 400) ?? null;
        } else if (r.targetType === 'REVIEW' && r.targetId) {
          const rev = await prisma.review.findUnique({ where: { id: r.targetId }, select: { comment: true } });
          excerpt = rev?.comment?.slice(0, 400) ?? null;
        } else if (r.targetType === 'COMMUNITY_POST' && r.targetId) {
          const post = await prisma.communityPost.findUnique({ where: { id: r.targetId }, select: { title: true, body: true } });
          excerpt = post ? `${post.title} — ${post.body.slice(0, 300)}` : null;
        } else if (r.targetType === 'COMMUNITY_COMMENT' && r.targetId) {
          const c = await prisma.communityComment.findUnique({ where: { id: r.targetId }, select: { body: true } });
          excerpt = c?.body.slice(0, 400) ?? null;
        }

        return {
          id: r.id,
          targetType: r.targetType,
          targetId: r.targetId,
          reason: r.reason,
          details: r.details,
          status: r.status,
          actionTaken: r.actionTaken,
          resolutionNote: r.resolutionNote,
          createdAt: r.createdAt,
          handledAt: r.handledAt,
          reporter: {
            username: r.reporter.username,
            displayName: r.reporter.profile?.displayName ?? r.reporter.username,
          },
          targetUser: r.targetUser
            ? {
                id: r.targetUser.id,
                username: r.targetUser.username,
                displayName: r.targetUser.profile?.displayName ?? r.targetUser.username,
              }
            : null,
          excerpt,
        };
      }),
    );

    return paginated(res, enriched, total, page, pageSize);
  }),
);

const resolveReportSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
  action: z
    .enum(['NONE', 'CONTENT_HIDDEN', 'CONTENT_REMOVED', 'WARNING_ISSUED', 'USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_DISMISSED'])
    .default('NONE'),
  note: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/admin/reports/:id — resolve a report and apply the moderation action.
 * Every action here is written to the audit log.
 */
adminRouter.patch(
  '/reports/:id',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(resolveReportSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as z.infer<typeof resolveReportSchema>;

    const report = await prisma.report.findUnique({
      where: { id },
      select: { id: true, targetType: true, targetId: true, targetUserId: true, status: true, reason: true },
    });
    if (!report) throw ApiError.notFound('That report could not be found.');

    await prisma.$transaction(async (tx) => {
      // Apply the moderation action to the reported content.
      if (body.action === 'CONTENT_HIDDEN' && report.targetId) {
        if (report.targetType === 'MESSAGE') {
          await tx.message.update({
            where: { id: report.targetId },
            data: { hiddenAt: new Date(), hiddenById: req.user!.id },
          });
        } else if (report.targetType === 'REVIEW') {
          await tx.review.update({
            where: { id: report.targetId },
            data: { hiddenAt: new Date(), hiddenById: req.user!.id },
          });
        } else if (report.targetType === 'COMMUNITY_POST') {
          await tx.communityPost.update({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
        } else if (report.targetType === 'COMMUNITY_COMMENT') {
          await tx.communityComment.update({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
        }
      }

      if (body.action === 'CONTENT_REMOVED' && report.targetId) {
        if (report.targetType === 'COMMUNITY_POST') {
          await tx.communityPost.update({ where: { id: report.targetId }, data: { status: 'REMOVED' } });
        } else if (report.targetType === 'COMMUNITY_COMMENT') {
          await tx.communityComment.update({ where: { id: report.targetId }, data: { status: 'REMOVED' } });
        } else if (report.targetType === 'MESSAGE') {
          await tx.message.update({
            where: { id: report.targetId },
            data: { hiddenAt: new Date(), hiddenById: req.user!.id },
          });
        } else if (report.targetType === 'REVIEW') {
          await tx.review.update({
            where: { id: report.targetId },
            data: { hiddenAt: new Date(), hiddenById: req.user!.id },
          });
        }
      }

      if ((body.action === 'USER_SUSPENDED' || body.action === 'USER_REINSTATED') && report.targetUserId) {
        if (report.targetUserId === req.user!.id) {
          throw ApiError.badRequest('You cannot apply this action to your own account.');
        }
        await tx.user.update({
          where: { id: report.targetUserId },
          data: { status: body.action === 'USER_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE' },
        });
        if (body.action === 'USER_SUSPENDED') {
          await tx.authSession.updateMany({
            where: { userId: report.targetUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }

      await tx.report.update({
        where: { id },
        data: {
          status: body.status,
          actionTaken: body.action,
          resolutionNote: body.note ?? null,
          handledById: req.user!.id,
          handledAt: new Date(),
        },
      });
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.report.resolved',
      entityType: 'Report',
      entityId: id,
      summary: `Report ${id} ${body.status.toLowerCase()} with action ${body.action}`,
      metadata: { ...body, targetType: report.targetType, targetId: report.targetId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (report.targetUserId) {
      await createNotification(
        {
          userId: report.targetUserId,
          type: 'MODERATION',
          title:
            body.action === 'USER_SUSPENDED'
              ? 'Your account has been suspended'
              : body.action === 'USER_REINSTATED'
                ? 'Your account has been reinstated'
                : 'A report about your content was reviewed',
          body: body.note ?? 'A moderator reviewed a report involving your content.',
          link: '/help',
        },
        emitToUser,
      );
    }

    return ok(res, { id, status: body.status, action: body.action });
  }),
);

/** GET /api/admin/moderation/content — reported content, grouped for review. */
adminRouter.get(
  '/moderation/content',
  asyncHandler(async (_req, res) => {
    const [hiddenMessages, hiddenReviews, hiddenPosts, hiddenComments] = await Promise.all([
      prisma.message.count({ where: { hiddenAt: { not: null } } }),
      prisma.review.count({ where: { hiddenAt: { not: null } } }),
      prisma.communityPost.count({ where: { status: { in: ['HIDDEN', 'REMOVED'] } } }),
      prisma.communityComment.count({ where: { status: { in: ['HIDDEN', 'REMOVED'] } } }),
    ]);

    const recentHidden = await prisma.message.findMany({
      where: { hiddenAt: { not: null } },
      orderBy: { hiddenAt: 'desc' },
      take: 10,
      select: {
        id: true,
        body: true,
        hiddenAt: true,
        conversationId: true,
        sender: { select: { username: true } },
      },
    });

    return ok(res, {
      counts: { hiddenMessages, hiddenReviews, hiddenPosts, hiddenComments },
      recentHiddenMessages: recentHidden,
    });
  }),
);

// ------------------------------------------------------------------ taxonomy

adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.skillCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { skills: true, posts: true } },
      },
    });
    return ok(
      res,
      categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        skillCount: c._count.skills,
        postCount: c._count.posts,
      })),
    );
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Give the category a name.').max(60),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  icon: z.string().trim().max(40).optional().or(z.literal('')),
  color: z.string().trim().max(20).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

adminRouter.post(
  '/categories',
  requireAdmin,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof categorySchema>;
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await prisma.skillCategory.findFirst({
      where: { OR: [{ name: body.name }, { slug }] },
      select: { id: true },
    });
    if (existing) throw ApiError.conflict('That category already exists.');

    const category = await prisma.skillCategory.create({
      data: {
        name: body.name,
        slug,
        description: body.description || null,
        icon: body.icon || null,
        color: body.color || null,
        sortOrder: body.sortOrder,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        isActive: true,
        sortOrder: true,
      },
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.category.created',
      entityType: 'SkillCategory',
      entityId: category.id,
      summary: `Category "${body.name}" created`,
      ipAddress: req.ip,
    });

    return created(res, category);
  }),
);

adminRouter.patch(
  '/categories/:id',
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as Partial<z.infer<typeof categorySchema>>;

    const existing = await prisma.skillCategory.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw ApiError.notFound('That category could not be found.');

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value === '' ? null : value;
    }
    if (Object.keys(data).length === 0) throw ApiError.badRequest('No changes were provided.');

    const category = await prisma.skillCategory.update({
      where: { id },
      data,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        isActive: true,
        sortOrder: true,
      },
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.category.updated',
      entityType: 'SkillCategory',
      entityId: id,
      summary: `Category "${existing.name}" updated`,
      metadata: data as Prisma.InputJsonValue,
      ipAddress: req.ip,
    });

    return ok(res, category);
  }),
);

adminRouter.delete(
  '/categories/:id',
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };

    const category = await prisma.skillCategory.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { skills: true } } },
    });
    if (!category) throw ApiError.notFound('That category could not be found.');
    if (category._count.skills > 0) {
      throw ApiError.conflict(
        `Move or delete the ${category._count.skills} skill(s) in this category first.`,
        { skillCount: category._count.skills },
      );
    }

    await prisma.skillCategory.delete({ where: { id } });

    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.category.deleted',
      entityType: 'SkillCategory',
      entityId: id,
      summary: `Category "${category.name}" deleted`,
      ipAddress: req.ip,
    });

    return noContent(res);
  }),
);

/** GET /api/admin/skills — taxonomy skill management. */
adminRouter.get(
  '/skills',
  validateQuery(z.object({ search: z.string().trim().max(80).optional(), categoryId: uuidSchema.optional() })),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { search?: string; categoryId?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 30, maxPageSize: 100 });

    const where = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.skill.count({ where }),
      prisma.skill.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: { select: { id: true, name: true } },
          _count: { select: { userSkills: true } },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        category: s.category,
        memberCount: s._count.userSkills,
      })),
      total,
      page,
      pageSize,
    );
  }),
);

adminRouter.delete(
  '/skills/:id',
  requireAdmin,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { userSkills: true } } },
    });
    if (!skill) throw ApiError.notFound('That skill could not be found.');
    if (skill._count.userSkills > 0) {
      throw ApiError.conflict(
        `This skill is used by ${skill._count.userSkills} member entr(ies). Removing it would break their profiles.`,
        { memberCount: skill._count.userSkills },
      );
    }

    await prisma.skill.delete({ where: { id } });
    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.skill.deleted',
      entityType: 'Skill',
      entityId: id,
      summary: `Skill "${skill.name}" deleted`,
      ipAddress: req.ip,
    });
    return noContent(res);
  }),
);

// ----------------------------------------------------------------- audit log

adminRouter.get(
  '/audit-logs',
  requireAdmin,
  validateQuery(
    z.object({
      action: z.string().trim().max(80).optional(),
      entityType: z.string().trim().max(40).optional(),
      actorId: uuidSchema.optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { action?: string; entityType?: string; actorId?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 40, maxPageSize: 200 });

    const where = {
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          actor: { select: { id: true, username: true, role: true } },
        },
      }),
    ]);

    return paginated(res, rows, total, page, pageSize);
  }),
);

/** GET /api/admin/exchanges — platform exchange statistics. */
adminRouter.get(
  '/exchanges',
  validateQuery(z.object({ status: z.string().trim().max(20).optional() })),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { status?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 25, maxPageSize: 100 });

    const where = query.status ? { status: query.status as never } : {};

    const [total, rows] = await Promise.all([
      prisma.exchange.count({ where }),
      prisma.exchange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          status: true,
          goals: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          _count: { select: { sessions: true, milestones: true, reviews: true } },
          participants: {
            select: { user: { select: { username: true, profile: { select: { displayName: true } } } } },
          },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        goals: e.goals,
        createdAt: e.createdAt,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        counts: {
          sessions: e._count.sessions,
          milestones: e._count.milestones,
          reviews: e._count.reviews,
        },
        participants: e.participants.map((p) => ({
          username: p.user.username,
          displayName: p.user.profile?.displayName ?? p.user.username,
        })),
      })),
      total,
      page,
      pageSize,
    );
  }),
);

/** GET /api/admin/support-tickets — messages sent through the help form. */
adminRouter.get(
  '/support-tickets',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 25, maxPageSize: 100 });
    const [total, rows] = await Promise.all([
      prisma.supportTicket.count(),
      prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          message: true,
          status: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      }),
    ]);
    return paginated(res, rows, total, page, pageSize);
  }),
);

adminRouter.patch(
  '/support-tickets/:id',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']) })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { status } = req.body as { status: string };

    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) throw ApiError.notFound('That ticket could not be found.');

    const updated = await prisma.supportTicket.update({ where: { id }, data: { status }, select: { id: true, status: true } });
    await recordAudit({
      actorId: req.user!.id,
      action: 'admin.support_ticket.updated',
      entityType: 'SupportTicket',
      entityId: id,
      summary: `Support ticket set to ${status}`,
      ipAddress: req.ip,
    });
    return ok(res, updated);
  }),
);
