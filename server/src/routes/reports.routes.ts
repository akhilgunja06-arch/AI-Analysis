import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody } from '../lib/http';
import { created, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';

export const reportsRouter = Router();

const reasonSchema = z.enum([
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'FAKE_PROFILE',
  'NO_SHOW',
  'OFF_TOPIC',
  'FALSE_INFORMATION',
  'OTHER',
]);

const reportSchema = z.object({
  targetType: z.enum(['USER', 'MESSAGE', 'REVIEW', 'COMMUNITY_POST', 'COMMUNITY_COMMENT']),
  targetId: uuidSchema,
  reason: reasonSchema,
  details: z.string().trim().max(2000).optional(),
});

/**
 * Resolves a report target to the member responsible for it, and proves the
 * reporter is allowed to see that target at all.
 *
 * A target the caller cannot see and a target that does not exist produce the
 * same 404, so the endpoint cannot be used to enumerate ids.
 */
async function resolveTarget(
  targetType: z.infer<typeof reportSchema>['targetType'],
  targetId: string,
  reporterId: string,
): Promise<{ authorId: string | null }> {
  switch (targetType) {
    case 'USER': {
      const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!user) throw ApiError.notFound('That member could not be found.');
      return { authorId: user.id };
    }
    case 'MESSAGE': {
      const message = await prisma.message.findUnique({
        where: { id: targetId },
        select: { senderId: true, conversationId: true, hiddenAt: true },
      });
      if (!message || message.hiddenAt) throw ApiError.notFound('That message could not be found.');
      const member = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId: reporterId } },
        select: { id: true },
      });
      if (!member) throw ApiError.notFound('That message could not be found.');
      return { authorId: message.senderId };
    }
    case 'REVIEW': {
      const review = await prisma.review.findUnique({
        where: { id: targetId },
        select: { authorId: true, subjectId: true, hiddenAt: true },
      });
      if (!review || review.hiddenAt) throw ApiError.notFound('That review could not be found.');
      // Only the member the review is about may report it.
      if (review.subjectId !== reporterId) throw ApiError.notFound('That review could not be found.');
      return { authorId: review.authorId };
    }
    case 'COMMUNITY_POST': {
      const post = await prisma.communityPost.findUnique({
        where: { id: targetId },
        select: { authorId: true },
      });
      if (!post) throw ApiError.notFound('That post could not be found.');
      return { authorId: post.authorId };
    }
    case 'COMMUNITY_COMMENT': {
      const comment = await prisma.communityComment.findUnique({
        where: { id: targetId },
        select: { authorId: true },
      });
      if (!comment) throw ApiError.notFound('That comment could not be found.');
      return { authorId: comment.authorId };
    }
  }
}

/**
 * POST /api/reports — report a member, a message, a review or community content.
 *
 * One endpoint for every reportable thing keeps the reason vocabulary and the
 * duplicate rule in one place, so the moderation queue receives a consistent
 * shape regardless of which page the report came from.
 */
reportsRouter.post(
  '/',
  requireVerified,
  validateBody(reportSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof reportSchema>;
    const reporterId = req.user!.id;

    const { authorId } = await resolveTarget(body.targetType, body.targetId, reporterId);
    if (authorId === reporterId) throw ApiError.badRequest('You cannot report your own content.');

    const duplicate = await prisma.report.findFirst({
      where: {
        reporterId,
        targetType: body.targetType,
        targetId: body.targetId,
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('You have already reported this.');

    const report = await prisma.report.create({
      data: {
        reporterId,
        targetType: body.targetType,
        targetId: body.targetId,
        targetUserId: authorId,
        reason: body.reason,
        details: body.details ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return created(res, report);
  }),
);

/** GET /api/reports/mine — the caller's own submitted reports and their status. */
reportsRouter.get(
  '/mine',
  requireVerified,
  asyncHandler(async (req, res) => {
    const reports = await prisma.report.findMany({
      where: { reporterId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, targetType: true, reason: true, status: true, createdAt: true, resolutionNote: true },
    });
    return ok(res, reports);
  }),
);
