import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const reviewsRouter = Router();

// GET /api/reviews/user/:username is public: aggregate ratings are shown on
// public member profiles. Every other route in this router requires auth, which
// is applied per-route below.

const rating = z.coerce.number().int().min(1, 'Choose a rating between 1 and 5.').max(5, 'Ratings are out of 5.');

const createReviewSchema = z.object({
  exchangeId: uuidSchema,
  subjectId: uuidSchema,
  rating,
  teachingRating: rating.optional(),
  communicationRating: rating.optional(),
  reliabilityRating: rating.optional(),
  comment: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * POST /api/reviews
 *
 * Eligibility is enforced server-side:
 *  - the reviewer must be a participant of the exchange;
 *  - the subject must be the *other* participant;
 *  - the exchange must have started or completed;
 *  - one review per reviewer per exchange (also a unique DB constraint);
 *  - self-reviews are rejected (also a DB check constraint).
 */
reviewsRouter.post(
  '/',
  requireAuth,
  requireVerified,
  validateBody(createReviewSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createReviewSchema>;

    if (body.subjectId === req.user!.id) {
      throw ApiError.badRequest('You cannot review yourself.');
    }

    const exchange = await prisma.exchange.findUnique({
      where: { id: body.exchangeId },
      select: {
        id: true,
        status: true,
        title: true,
        participants: { select: { userId: true, status: true } },
      },
    });
    if (!exchange) throw ApiError.notFound('That exchange could not be found.');

    const me = exchange.participants.find((p) => p.userId === req.user!.id);
    const them = exchange.participants.find((p) => p.userId === body.subjectId);
    if (!me) throw ApiError.forbidden('You are not part of this exchange.');
    if (!them) throw ApiError.badRequest('That member is not the other participant of this exchange.');

    if (!['ACTIVE', 'PAUSED', 'COMPLETED'].includes(exchange.status)) {
      throw ApiError.conflict('Reviews can be left once an exchange is under way.', {
        exchangeStatus: exchange.status,
      });
    }

    const existing = await prisma.review.findUnique({
      where: { exchangeId_authorId: { exchangeId: body.exchangeId, authorId: req.user!.id } },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict('You have already reviewed this exchange.', { reviewId: existing.id });
    }

    const review = await prisma.review.create({
      data: {
        exchangeId: body.exchangeId,
        authorId: req.user!.id,
        subjectId: body.subjectId,
        rating: body.rating,
        teachingRating: body.teachingRating ?? null,
        communicationRating: body.communicationRating ?? null,
        reliabilityRating: body.reliabilityRating ?? null,
        comment: body.comment || null,
      },
      select: {
        id: true,
        rating: true,
        teachingRating: true,
        communicationRating: true,
        reliabilityRating: true,
        comment: true,
        createdAt: true,
      },
    });

    await prisma.exchangeEvent.create({
      data: {
        exchangeId: body.exchangeId,
        actorId: req.user!.id,
        type: 'review.submitted',
        summary: 'Feedback submitted',
      },
    });

    await createNotification(
      {
        userId: body.subjectId,
        type: 'REVIEW_RECEIVED',
        title: 'You received new feedback',
        body: `@${req.user!.username} rated your exchange ${body.rating}/5.`,
        link: '/reviews',
        metadata: { reviewId: review.id, exchangeId: body.exchangeId },
      },
      emitToUser,
    );

    return created(res, review);
  }),
);

/** GET /api/reviews/mine — reviews I wrote and reviews I received. */
reviewsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });

    const [written, received, writtenTotal, receivedTotal, aggregate] = await Promise.all([
      prisma.review.findMany({
        where: { authorId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          subject: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          exchange: { select: { id: true, title: true } },
        },
      }),
      prisma.review.findMany({
        where: { subjectId: req.user!.id, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
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
      prisma.review.count({ where: { authorId: req.user!.id } }),
      prisma.review.count({ where: { subjectId: req.user!.id, hiddenAt: null } }),
      prisma.review.aggregate({
        where: { subjectId: req.user!.id, hiddenAt: null },
        _avg: { rating: true, teachingRating: true, communicationRating: true, reliabilityRating: true },
      }),
    ]);

    return ok(res, {
      written: {
        items: written.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          subject: {
            username: r.subject.username,
            displayName: r.subject.profile?.displayName ?? r.subject.username,
            avatarUrl: r.subject.profile?.avatarUrl ?? null,
          },
          exchange: r.exchange,
        })),
        total: writtenTotal,
      },
      received: {
        items: received.map((r) => ({
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
        total: receivedTotal,
      },
      summary: {
        averageRating: aggregate._avg.rating !== null ? Number(aggregate._avg.rating.toFixed(2)) : null,
        averageTeaching: aggregate._avg.teachingRating !== null ? Number(aggregate._avg.teachingRating.toFixed(2)) : null,
        averageCommunication:
          aggregate._avg.communicationRating !== null ? Number(aggregate._avg.communicationRating.toFixed(2)) : null,
        averageReliability:
          aggregate._avg.reliabilityRating !== null ? Number(aggregate._avg.reliabilityRating.toFixed(2)) : null,
      },
      pagination: { page, pageSize },
    });
  }),
);

/** GET /api/reviews/pending — completed exchanges with no review from me yet. */
reviewsRouter.get(
  '/pending',
  requireAuth,
  asyncHandler(async (req, res) => {
    const participations = await prisma.exchangeParticipant.findMany({
      where: {
        userId: req.user!.id,
        exchange: { status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } },
      },
      select: {
        exchangeId: true,
        exchange: {
          select: {
            id: true,
            title: true,
            status: true,
            completedAt: true,
            participants: {
              select: {
                userId: true,
                user: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
              },
            },
          },
        },
      },
    });

    const myReviews = await prisma.review.findMany({
      where: { authorId: req.user!.id },
      select: { exchangeId: true },
    });
    const reviewed = new Set(myReviews.map((r) => r.exchangeId));

    const pending = participations
      .filter((p) => !reviewed.has(p.exchangeId))
      .map((p) => {
        const other = p.exchange.participants.find((x) => x.userId !== req.user!.id);
        return {
          exchangeId: p.exchange.id,
          title: p.exchange.title,
          status: p.exchange.status,
          completedAt: p.exchange.completedAt,
          otherUser: other
            ? {
                id: other.userId,
                username: other.user.username,
                displayName: other.user.profile?.displayName ?? other.user.username,
                avatarUrl: other.user.profile?.avatarUrl ?? null,
              }
            : null,
        };
      })
      .filter((p) => p.otherUser !== null);

    return ok(res, pending);
  }),
);

/** GET /api/reviews/user/:username — public reviews for a member. */
reviewsRouter.get(
  '/user/:username',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!user) throw ApiError.notFound('That member could not be found.');

    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 10, maxPageSize: 50 });

    const [total, rows, aggregate, distribution] = await Promise.all([
      prisma.review.count({ where: { subjectId: user.id, hiddenAt: null } }),
      prisma.review.findMany({
        where: { subjectId: user.id, hiddenAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      }),
      prisma.review.aggregate({ where: { subjectId: user.id, hiddenAt: null }, _avg: { rating: true } }),
      prisma.review.groupBy({
        by: ['rating'],
        where: { subjectId: user.id, hiddenAt: null },
        _count: { _all: true },
      }),
    ]);

    return ok(res, {
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: {
          username: r.author.username,
          displayName: r.author.profile?.displayName ?? r.author.username,
          avatarUrl: r.author.profile?.avatarUrl ?? null,
        },
      })),
      averageRating: aggregate._avg.rating !== null ? Number(aggregate._avg.rating.toFixed(2)) : null,
      distribution: Object.fromEntries(distribution.map((d) => [d.rating, d._count._all])),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasNext: page < Math.max(1, Math.ceil(total / pageSize)),
        hasPrev: page > 1,
      },
    });
  }),
);

/** POST /api/reviews/:id/report — flag a review for moderation. */
reviewsRouter.post(
  '/:id/report',
  requireAuth,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(
    z.object({
      reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'NO_SHOW', 'OTHER']),
      details: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as { reason: string; details?: string };

    const review = await prisma.review.findUnique({
      where: { id },
      select: { id: true, authorId: true, subjectId: true },
    });
    if (!review) throw ApiError.notFound('That review could not be found.');
    if (review.authorId === req.user!.id) throw ApiError.badRequest('You cannot report your own review.');

    const duplicate = await prisma.report.findFirst({
      where: { reporterId: req.user!.id, targetType: 'REVIEW', targetId: id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('You have already reported this review.');

    const report = await prisma.report.create({
      data: {
        reporterId: req.user!.id,
        targetType: 'REVIEW',
        targetId: id,
        targetUserId: review.authorId,
        reason: body.reason as never,
        details: body.details ?? null,
        status: 'OPEN',
      },
      select: { id: true, status: true, createdAt: true },
    });

    return created(res, report);
  }),
);
