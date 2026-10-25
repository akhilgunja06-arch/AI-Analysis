import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateParams, validateQuery } from '../lib/http';
import { noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { optionalAuthenticate, requireAuth } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { memberSelectFields, memberStats, shapeMember } from '../services/member.service';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const membersRouter = Router();

const listQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  teachesSkillId: uuidSchema.optional(),
  wantsSkillId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  language: z.string().trim().max(40).optional(),
  timezone: z.string().trim().max(64).optional(),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  availabilityWeekday: z.coerce.number().int().min(0).max(6).optional(),
  hasAvailability: z.enum(['true', 'false']).optional(),
  sort: z.enum(['relevance', 'recent', 'rating', 'name']).default('recent'),
});

/**
 * GET /api/members — public member directory.
 *
 * Only members who have not disabled their public profile appear here, and the
 * projection never includes email addresses or other private columns.
 */
membersRouter.get(
  '/',
  optionalAuthenticate,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof listQuerySchema>;
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 12, maxPageSize: 48 });

    const where: Prisma.UserWhereInput = {
      status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] },
      role: { not: 'ADMIN' },
      OR: [{ preference: null }, { preference: { publicProfile: true } }],
    };

    if (query.search) {
      where.AND = [
        {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' } },
            { profile: { displayName: { contains: query.search, mode: 'insensitive' } } },
            { profile: { headline: { contains: query.search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    if (query.teachesSkillId) {
      where.skills = { some: { skillId: query.teachesSkillId, direction: 'TEACH', isActive: true } };
    }
    if (query.wantsSkillId) {
      where.skills = {
        ...(where.skills as object),
        some: { skillId: query.wantsSkillId, direction: 'LEARN', isActive: true },
      };
    }
    if (query.categoryId) {
      where.skills = {
        ...(where.skills as object),
        some: { isActive: true, skill: { categoryId: query.categoryId } },
      };
    }
    if (query.language) {
      where.profile = { languages: { has: query.language } };
    }
    if (query.timezone) {
      where.profile = { ...(where.profile as object), timezone: query.timezone };
    }
    if (query.format) {
      where.profile = { ...(where.profile as object), preferredFormat: query.format };
    }
    if (query.availabilityWeekday !== undefined) {
      where.availability = { some: { weekday: query.availabilityWeekday } };
    }
    if (query.hasAvailability === 'true') {
      where.availability = { some: {} };
    }

    // Members who blocked the caller (or were blocked by them) are excluded.
    // A dismissed recommendation is stored as a namespaced block reason, but
    // dismissing is not blocking: those members stay in the directory.
    if (req.user) {
      const blocks = await prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: req.user.id }, { blockedId: req.user.id }],
          NOT: { reason: 'DISMISSED_MATCH' },
        },
        select: { blockerId: true, blockedId: true },
      });
      const excluded = new Set<string>();
      for (const b of blocks) {
        excluded.add(b.blockerId === req.user.id ? b.blockedId : b.blockerId);
      }
      excluded.add(req.user.id);
      where.id = { notIn: [...excluded] };
    }

    // Rating is an aggregate over Review, which Prisma cannot order a user query
    // by. Rank the whole filtered set first, then page into it, so the ordering
    // is correct across pages rather than only within one.
    if (query.sort === 'rating') {
      const candidates = await prisma.user.findMany({ where, select: { id: true } });

      const ratings = await prisma.review.groupBy({
        by: ['subjectId'],
        where: { subjectId: { in: candidates.map((c) => c.id) }, hiddenAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      });
      const ratingByUser = new Map(
        ratings.map((r) => [r.subjectId, { average: r._avg.rating ?? 0, count: r._count._all }]),
      );

      const ranked = candidates
        .map((c) => {
          const rating = ratingByUser.get(c.id);
          return { id: c.id, average: rating?.average ?? 0, count: rating?.count ?? 0 };
        })
        // More reviews breaks a tie, so a single 5 does not outrank a proven 4.9.
        .sort((a, b) => b.average - a.average || b.count - a.count || a.id.localeCompare(b.id))
        .slice(skip, skip + take);

      const pageRows = await prisma.user.findMany({
        where: { id: { in: ranked.map((r) => r.id) } },
        select: memberSelectFields,
      });
      const rowById = new Map(pageRows.map((row) => [row.id, row]));

      const members = await Promise.all(
        ranked
          .map((r) => rowById.get(r.id))
          .filter((row): row is NonNullable<typeof row> => row !== undefined)
          .map(async (row) => shapeMember(row, await memberStats(row.id))),
      );

      const total = await prisma.user.count({ where });
      return paginated(res, members, total, page, pageSize);
    }

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      query.sort === 'name' ? [{ username: 'asc' }] : [{ createdAt: 'desc' }];

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: memberSelectFields, orderBy, skip, take }),
    ]);

    const members = await Promise.all(
      rows.map(async (row) => shapeMember(row, await memberStats(row.id))),
    );

    return paginated(res, members, total, page, pageSize);
  }),
);

/** GET /api/members/:username — public profile view. */
membersRouter.get(
  '/:username',
  optionalAuthenticate,
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };

    const row = await prisma.user.findFirst({
      where: { username: username.toLowerCase(), status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } },
      select: memberSelectFields,
    });
    if (!row) throw ApiError.notFound('That member could not be found.');

    const isSelf = req.user?.id === row.id;
    const isStaff = req.user?.role === 'ADMIN' || req.user?.role === 'MODERATOR';

    const preference = await prisma.userPreference.findUnique({
      where: { userId: row.id },
      select: { publicProfile: true },
    });

    if (preference?.publicProfile === false && !isSelf && !isStaff) {
      throw ApiError.notFound('That member could not be found.');
    }

    const stats = await memberStats(row.id);
    const member = shapeMember(row, stats);

    const [reviews, portfolio, isFollowing, blocked, activeExchangeCount] = await Promise.all([
      prisma.review.findMany({
        where: { subjectId: row.id, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          rating: true,
          teachingRating: true,
          communicationRating: true,
          reliabilityRating: true,
          comment: true,
          createdAt: true,
          author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          exchange: { select: { id: true, title: true } },
        },
      }),
      prisma.userSkill.findMany({
        where: { userId: row.id, direction: 'TEACH', isActive: true, portfolioUrl: { not: null } },
        select: { id: true, portfolioUrl: true, skill: { select: { name: true } } },
      }),
      req.user
        ? prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: req.user.id, followingId: row.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      req.user
        ? prisma.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: req.user.id, blockedId: row.id },
                { blockerId: row.id, blockedId: req.user.id },
              ],
            },
            select: { id: true, blockerId: true },
          })
        : Promise.resolve(null),
      prisma.exchangeParticipant.count({
        where: { userId: row.id, exchange: { status: { in: ['ACTIVE', 'ACCEPTED', 'PAUSED'] } } },
      }),
    ]);

    return ok(res, {
      ...member,
      stats: { ...member.stats, activeExchanges: activeExchangeCount },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        teachingRating: r.teachingRating,
        communicationRating: r.communicationRating,
        reliabilityRating: r.reliabilityRating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: {
          username: r.author.username,
          displayName: r.author.profile?.displayName ?? r.author.username,
          avatarUrl: r.author.profile?.avatarUrl ?? null,
        },
        exchange: r.exchange,
      })),
      portfolio: portfolio.map((p) => ({ id: p.id, skill: p.skill.name, url: p.portfolioUrl })),
      viewer: {
        isSelf,
        isFollowing: Boolean(isFollowing),
        isBlocked: Boolean(blocked),
        blockedByViewer: blocked?.blockerId === req.user?.id,
        canMessage: Boolean(req.user) && !isSelf && !blocked,
      },
    });
  }),
);

// -------------------------------------------------------- authenticated actions

membersRouter.use(requireAuth);

/** POST /api/members/:username/follow */
membersRouter.post(
  '/:username/follow',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, status: true },
    });
    if (!target || target.status === 'DEACTIVATED') throw ApiError.notFound('That member could not be found.');
    if (target.id === req.user!.id) throw ApiError.badRequest('You cannot follow yourself.');

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: req.user!.id, followingId: target.id } },
      select: { id: true },
    });
    if (existing) return ok(res, { following: true });

    await prisma.follow.create({ data: { followerId: req.user!.id, followingId: target.id } });

    await createNotification(
      {
        userId: target.id,
        type: 'FOLLOW',
        title: 'You have a new follower',
        body: `@${req.user!.username} started following you.`,
        link: `/members/${req.user!.username}`,
      },
      emitToUser,
    );

    return ok(res, { following: true });
  }),
);

/** DELETE /api/members/:username/follow */
membersRouter.delete(
  '/:username/follow',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    await prisma.follow.deleteMany({ where: { followerId: req.user!.id, followingId: target.id } });
    return noContent(res);
  }),
);

/** GET /api/members/:username/followers and /following (paginated) */
membersRouter.get(
  '/:username/followers',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });
    const [total, rows] = await Promise.all([
      prisma.follow.count({ where: { followingId: target.id } }),
      prisma.follow.findMany({
        where: { followingId: target.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          follower: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarUrl: true, headline: true } },
            },
          },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((r) => ({
        username: r.follower.username,
        displayName: r.follower.profile?.displayName ?? r.follower.username,
        avatarUrl: r.follower.profile?.avatarUrl ?? null,
        headline: r.follower.profile?.headline ?? null,
      })),
      total,
      page,
      pageSize,
    );
  }),
);

membersRouter.get(
  '/:username/following',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });
    const [total, rows] = await Promise.all([
      prisma.follow.count({ where: { followerId: target.id } }),
      prisma.follow.findMany({
        where: { followerId: target.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          following: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarUrl: true, headline: true } },
            },
          },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((r) => ({
        username: r.following.username,
        displayName: r.following.profile?.displayName ?? r.following.username,
        avatarUrl: r.following.profile?.avatarUrl ?? null,
        headline: r.following.profile?.headline ?? null,
      })),
      total,
      page,
      pageSize,
    );
  }),
);
