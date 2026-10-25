import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { optionalAuthenticate, requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { writeLimiter } from '../middleware/errors';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const communityRouter = Router();

/** GET /api/community/posts — public discussion feed. */
communityRouter.get(
  '/posts',
  optionalAuthenticate,
  validateQuery(
    z.object({
      search: z.string().trim().max(80).optional(),
      categoryId: uuidSchema.optional(),
      skillId: uuidSchema.optional(),
      postType: z.enum(['DISCUSSION', 'QUESTION', 'RESOURCE']).optional(),
      sort: z.enum(['recent', 'popular', 'unanswered']).default('recent'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as {
      search?: string;
      categoryId?: string;
      skillId?: string;
      postType?: 'DISCUSSION' | 'QUESTION' | 'RESOURCE';
      sort: 'recent' | 'popular' | 'unanswered';
    };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 15, maxPageSize: 50 });

    const where = {
      status: 'PUBLISHED' as const,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.skillId ? { skillId: query.skillId } : {}),
      ...(query.postType ? { postType: query.postType } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { body: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sort === 'popular'
        ? ([{ pinned: 'desc' as const }, { voteCount: 'desc' as const }, { createdAt: 'desc' as const }])
        : query.sort === 'unanswered'
          ? ([{ commentCount: 'asc' as const }, { createdAt: 'desc' as const }])
          : ([{ pinned: 'desc' as const }, { createdAt: 'desc' as const }]);

    const [total, rows] = await Promise.all([
      prisma.communityPost.count({ where }),
      prisma.communityPost.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          title: true,
          body: true,
          postType: true,
          resourceUrl: true,
          pinned: true,
          voteCount: true,
          commentCount: true,
          createdAt: true,
          author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          category: { select: { id: true, name: true, slug: true } },
          skill: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    let myVotes = new Map<string, number>();
    if (req.user) {
      const votes = await prisma.communityPostVote.findMany({
        where: { userId: req.user.id, postId: { in: rows.map((r) => r.id) } },
        select: { postId: true, value: true },
      });
      myVotes = new Map(votes.map((v) => [v.postId, v.value]));
    }

    return paginated(
      res,
      rows.map((p) => ({
        id: p.id,
        title: p.title,
        excerpt: p.body.length > 240 ? `${p.body.slice(0, 240)}…` : p.body,
        postType: p.postType,
        resourceUrl: p.resourceUrl,
        pinned: p.pinned,
        voteCount: p.voteCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        author: {
          username: p.author.username,
          displayName: p.author.profile?.displayName ?? p.author.username,
          avatarUrl: p.author.profile?.avatarUrl ?? null,
        },
        category: p.category,
        skill: p.skill,
        myVote: myVotes.get(p.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    );
  }),
);

/** GET /api/community/posts/:id — post with comments and replies. */
communityRouter.get(
  '/posts/:id',
  optionalAuthenticate,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };

    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        body: true,
        postType: true,
        resourceUrl: true,
        status: true,
        pinned: true,
        voteCount: true,
        commentCount: true,
        createdAt: true,
        updatedAt: true,
        authorId: true,
        author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        category: { select: { id: true, name: true, slug: true } },
        skill: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!post || post.status !== 'PUBLISHED') throw ApiError.notFound('That discussion could not be found.');

    const comments = await prisma.communityComment.findMany({
      where: { postId: id, status: 'PUBLISHED' },
      orderBy: [{ isAnswer: 'desc' }, { voteCount: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        body: true,
        parentId: true,
        isAnswer: true,
        voteCount: true,
        createdAt: true,
        authorId: true,
        author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });

    let myVote = 0;
    let myCommentVotes = new Map<string, number>();
    if (req.user) {
      const [postVote, commentVotes] = await Promise.all([
        prisma.communityPostVote.findUnique({
          where: { postId_userId: { postId: id, userId: req.user.id } },
          select: { value: true },
        }),
        prisma.communityCommentVote.findMany({
          where: { userId: req.user.id, commentId: { in: comments.map((c) => c.id) } },
          select: { commentId: true, value: true },
        }),
      ]);
      myVote = postVote?.value ?? 0;
      myCommentVotes = new Map(commentVotes.map((v) => [v.commentId, v.value]));
    }

    const shapeComment = (c: (typeof comments)[number]) => ({
      id: c.id,
      body: c.body,
      parentId: c.parentId,
      isAnswer: c.isAnswer,
      voteCount: c.voteCount,
      createdAt: c.createdAt,
      isMine: c.authorId === req.user?.id,
      author: {
        username: c.author.username,
        displayName: c.author.profile?.displayName ?? c.author.username,
        avatarUrl: c.author.profile?.avatarUrl ?? null,
      },
      myVote: myCommentVotes.get(c.id) ?? 0,
    });

    const roots = comments.filter((c) => !c.parentId);
    const repliesByParent = new Map<string, typeof comments>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }

    return ok(res, {
      post: {
        id: post.id,
        title: post.title,
        body: post.body,
        postType: post.postType,
        resourceUrl: post.resourceUrl,
        pinned: post.pinned,
        voteCount: post.voteCount,
        commentCount: post.commentCount,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        isMine: post.authorId === req.user?.id,
        author: {
          username: post.author.username,
          displayName: post.author.profile?.displayName ?? post.author.username,
          avatarUrl: post.author.profile?.avatarUrl ?? null,
        },
        category: post.category,
        skill: post.skill,
        myVote,
      },
      comments: roots.map((c) => ({
        ...shapeComment(c),
        replies: (repliesByParent.get(c.id) ?? []).map(shapeComment),
      })),
    });
  }),
);

/** POST /api/community/posts — create a discussion, question or resource. */
communityRouter.post(
  '/posts',
  requireAuth,
  requireVerified,
  writeLimiter,
  validateBody(
    z.object({
      title: z.string().trim().min(6, 'Give your post a descriptive title.').max(180),
      body: z.string().trim().min(20, 'Add at least a couple of sentences.').max(10000),
      postType: z.enum(['DISCUSSION', 'QUESTION', 'RESOURCE']).default('DISCUSSION'),
      categoryId: uuidSchema.optional().nullable(),
      skillId: uuidSchema.optional().nullable(),
      resourceUrl: z
        .string()
        .trim()
        .max(500)
        .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a full URL starting with http:// or https://')
        .optional()
        .or(z.literal('')),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      title: string;
      body: string;
      postType: 'DISCUSSION' | 'QUESTION' | 'RESOURCE';
      categoryId?: string | null;
      skillId?: string | null;
      resourceUrl?: string;
    };

    // Basic anti-spam: identical title posted twice in the last 10 minutes.
    const duplicate = await prisma.communityPost.findFirst({
      where: {
        authorId: req.user!.id,
        title: body.title,
        createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('You just posted something with that title.');

    if (body.categoryId) {
      const category = await prisma.skillCategory.findUnique({ where: { id: body.categoryId }, select: { id: true } });
      if (!category) throw ApiError.badRequest('That category does not exist.');
    }
    if (body.skillId) {
      const skill = await prisma.skill.findUnique({ where: { id: body.skillId }, select: { id: true } });
      if (!skill) throw ApiError.badRequest('That skill does not exist.');
    }

    const post = await prisma.communityPost.create({
      data: {
        authorId: req.user!.id,
        title: body.title,
        body: body.body,
        postType: body.postType,
        categoryId: body.categoryId ?? null,
        skillId: body.skillId ?? null,
        resourceUrl: body.resourceUrl || null,
      },
      select: { id: true, title: true, postType: true, createdAt: true },
    });

    return created(res, post);
  }),
);

/** PATCH /api/community/posts/:id — author or moderator. */
communityRouter.patch(
  '/posts/:id',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(
    z.object({
      title: z.string().trim().min(6).max(180).optional(),
      body: z.string().trim().min(20).max(10000).optional(),
      resourceUrl: z.string().trim().max(500).optional().or(z.literal('')),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!post) throw ApiError.notFound('That discussion could not be found.');

    const isModerator = req.user!.role === 'ADMIN' || req.user!.role === 'MODERATOR';
    if (post.authorId !== req.user!.id && !isModerator) {
      throw ApiError.forbidden('You can only edit your own posts.');
    }

    const body = req.body as { title?: string; body?: string; resourceUrl?: string };
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.body !== undefined) data.body = body.body;
    if (body.resourceUrl !== undefined) data.resourceUrl = body.resourceUrl || null;
    if (Object.keys(data).length === 0) throw ApiError.badRequest('No changes were provided.');

    const updated = await prisma.communityPost.update({
      where: { id },
      data,
      select: { id: true, title: true, body: true, resourceUrl: true, updatedAt: true },
    });
    return ok(res, updated);
  }),
);

/** DELETE /api/community/posts/:id */
communityRouter.delete(
  '/posts/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!post) throw ApiError.notFound('That discussion could not be found.');

    const isModerator = req.user!.role === 'ADMIN' || req.user!.role === 'MODERATOR';
    if (post.authorId !== req.user!.id && !isModerator) {
      throw ApiError.forbidden('You can only delete your own posts.');
    }

    await prisma.communityPost.delete({ where: { id } });
    return noContent(res);
  }),
);

/** POST /api/community/posts/:id/vote — toggle a helpful vote. */
communityRouter.post(
  '/posts/:id/vote',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { value } = req.body as { value: 1 | -1 | 0 };

    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { id: true, authorId: true, title: true, status: true },
    });
    if (!post || post.status !== 'PUBLISHED') throw ApiError.notFound('That discussion could not be found.');

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.communityPostVote.findUnique({
        where: { postId_userId: { postId: id, userId: req.user!.id } },
        select: { id: true, value: true },
      });

      let delta = 0;
      if (value === 0 || (existing && existing.value === value)) {
        if (existing) {
          await tx.communityPostVote.delete({ where: { id: existing.id } });
          delta = -existing.value;
        }
      } else if (existing) {
        await tx.communityPostVote.update({ where: { id: existing.id }, data: { value } });
        delta = value - existing.value;
      } else {
        await tx.communityPostVote.create({ data: { postId: id, userId: req.user!.id, value } });
        delta = value;
      }

      const updated = await tx.communityPost.update({
        where: { id },
        data: { voteCount: { increment: delta } },
        select: { voteCount: true },
      });

      return { voteCount: updated.voteCount, myVote: value === 0 || (existing && existing.value === value) ? 0 : value };
    });

    return ok(res, result);
  }),
);

/** POST /api/community/posts/:id/comments */
communityRouter.post(
  '/posts/:id/comments',
  requireVerified,
  writeLimiter,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(
    z.object({
      body: z.string().trim().min(2, 'Write a reply first.').max(5000),
      parentId: uuidSchema.optional().nullable(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as { body: string; parentId?: string | null };

    const post = await prisma.communityPost.findUnique({
      where: { id },
      select: { id: true, authorId: true, title: true, status: true },
    });
    if (!post || post.status !== 'PUBLISHED') throw ApiError.notFound('That discussion could not be found.');

    if (body.parentId) {
      const parent = await prisma.communityComment.findUnique({
        where: { id: body.parentId },
        select: { id: true, postId: true, authorId: true },
      });
      if (!parent || parent.postId !== id) {
        throw ApiError.badRequest('The reply target does not belong to this discussion.');
      }
    }

    const comment = await prisma.$transaction(async (tx) => {
      const row = await tx.communityComment.create({
        data: { postId: id, authorId: req.user!.id, body: body.body, parentId: body.parentId ?? null },
        select: {
          id: true,
          body: true,
          parentId: true,
          isAnswer: true,
          voteCount: true,
          createdAt: true,
          authorId: true,
          author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      });
      await tx.communityPost.update({ where: { id }, data: { commentCount: { increment: 1 } } });
      return row;
    });

    // Notify the post author and, for replies, the parent comment author.
    const notifyTargets = new Set<string>();
    if (post.authorId !== req.user!.id) notifyTargets.add(post.authorId);
    if (body.parentId) {
      const parent = await prisma.communityComment.findUnique({
        where: { id: body.parentId },
        select: { authorId: true },
      });
      if (parent && parent.authorId !== req.user!.id) notifyTargets.add(parent.authorId);
    }

    for (const userId of notifyTargets) {
      await createNotification(
        {
          userId,
          type: 'COMMUNITY_REPLY',
          title: 'New reply in a discussion you follow',
          body: `@${req.user!.username} replied to "${post.title}".`,
          link: `/community/${id}`,
          metadata: { postId: id, commentId: comment.id },
        },
        emitToUser,
      );
    }

    return created(res, {
      id: comment.id,
      body: comment.body,
      parentId: comment.parentId,
      isAnswer: comment.isAnswer,
      voteCount: comment.voteCount,
      createdAt: comment.createdAt,
      isMine: true,
      author: {
        username: comment.author.username,
        displayName: comment.author.profile?.displayName ?? comment.author.username,
        avatarUrl: comment.author.profile?.avatarUrl ?? null,
      },
      myVote: 0,
    });
  }),
);

/** POST /api/community/comments/:id/vote */
communityRouter.post(
  '/comments/:id/vote',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { value } = req.body as { value: 1 | -1 | 0 };

    const comment = await prisma.communityComment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!comment || comment.status !== 'PUBLISHED') throw ApiError.notFound('That reply could not be found.');

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.communityCommentVote.findUnique({
        where: { commentId_userId: { commentId: id, userId: req.user!.id } },
        select: { id: true, value: true },
      });

      let delta = 0;
      if (value === 0 || (existing && existing.value === value)) {
        if (existing) {
          await tx.communityCommentVote.delete({ where: { id: existing.id } });
          delta = -existing.value;
        }
      } else if (existing) {
        await tx.communityCommentVote.update({ where: { id: existing.id }, data: { value } });
        delta = value - existing.value;
      } else {
        await tx.communityCommentVote.create({ data: { commentId: id, userId: req.user!.id, value } });
        delta = value;
      }

      const updated = await tx.communityComment.update({
        where: { id },
        data: { voteCount: { increment: delta } },
        select: { voteCount: true },
      });

      return { voteCount: updated.voteCount, myVote: value === 0 || (existing && existing.value === value) ? 0 : value };
    });

    return ok(res, result);
  }),
);

/** POST /api/community/comments/:id/answer — post author marks the answer. */
communityRouter.post(
  '/comments/:id/answer',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const comment = await prisma.communityComment.findUnique({
      where: { id },
      select: { id: true, postId: true, post: { select: { authorId: true } } },
    });
    if (!comment) throw ApiError.notFound('That reply could not be found.');

    const isModerator = req.user!.role === 'ADMIN' || req.user!.role === 'MODERATOR';
    if (comment.post.authorId !== req.user!.id && !isModerator) {
      throw ApiError.forbidden('Only the author of the question can mark an answer.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.communityComment.updateMany({ where: { postId: comment.postId }, data: { isAnswer: false } });
      return tx.communityComment.update({ where: { id }, data: { isAnswer: true }, select: { id: true, isAnswer: true } });
    });

    return ok(res, updated);
  }),
);

/** DELETE /api/community/comments/:id */
communityRouter.delete(
  '/comments/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const comment = await prisma.communityComment.findUnique({
      where: { id },
      select: { id: true, authorId: true, postId: true },
    });
    if (!comment) throw ApiError.notFound('That reply could not be found.');

    const isModerator = req.user!.role === 'ADMIN' || req.user!.role === 'MODERATOR';
    if (comment.authorId !== req.user!.id && !isModerator) {
      throw ApiError.forbidden('You can only delete your own replies.');
    }

    await prisma.$transaction(async (tx) => {
      const removed = await tx.communityComment.count({ where: { parentId: id } });
      await tx.communityComment.delete({ where: { id } });
      await tx.communityPost.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 + removed } },
      });
    });

    return noContent(res);
  }),
);

/** POST /api/community/report — report a post or comment. */
communityRouter.post(
  '/report',
  requireVerified,
  validateBody(
    z.object({
      targetType: z.enum(['COMMUNITY_POST', 'COMMUNITY_COMMENT']),
      targetId: uuidSchema,
      reason: z.enum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'NO_SHOW', 'OTHER']),
      details: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      targetType: 'COMMUNITY_POST' | 'COMMUNITY_COMMENT';
      targetId: string;
      reason: string;
      details?: string;
    };

    const authorId =
      body.targetType === 'COMMUNITY_POST'
        ? (await prisma.communityPost.findUnique({ where: { id: body.targetId }, select: { authorId: true } }))?.authorId
        : (await prisma.communityComment.findUnique({ where: { id: body.targetId }, select: { authorId: true } }))?.authorId;

    if (!authorId) throw ApiError.notFound('The content you are reporting could not be found.');
    if (authorId === req.user!.id) throw ApiError.badRequest('You cannot report your own content.');

    const duplicate = await prisma.report.findFirst({
      where: {
        reporterId: req.user!.id,
        targetType: body.targetType,
        targetId: body.targetId,
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('You have already reported this content.');

    const report = await prisma.report.create({
      data: {
        reporterId: req.user!.id,
        targetType: body.targetType,
        targetId: body.targetId,
        targetUserId: authorId,
        reason: body.reason as never,
        details: body.details ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return created(res, report);
  }),
);

/** GET /api/community/stats — real activity counts for the community header. */
communityRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [posts, comments, authors, questions, answered] = await Promise.all([
      prisma.communityPost.count({ where: { status: 'PUBLISHED' } }),
      prisma.communityComment.count({ where: { status: 'PUBLISHED' } }),
      prisma.communityPost.groupBy({ by: ['authorId'], _count: { _all: true } }),
      prisma.communityPost.count({ where: { postType: 'QUESTION', status: 'PUBLISHED' } }),
      prisma.communityComment.count({ where: { isAnswer: true, status: 'PUBLISHED' } }),
    ]);

    return ok(res, {
      posts,
      comments,
      contributors: authors.length,
      questions,
      answeredQuestions: answered,
    });
  }),
);
