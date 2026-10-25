import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/** GET /api/notifications — list, with an unread count for the badge. */
notificationsRouter.get(
  '/',
  validateQuery(
    z.object({
      unreadOnly: z.enum(['true', 'false']).default('false'),
      type: z.string().trim().max(40).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { unreadOnly: 'true' | 'false'; type?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });

    const where = {
      userId: req.user!.id,
      ...(query.unreadOnly === 'true' ? { readAt: null } : {}),
      ...(query.type ? { type: query.type as never } : {}),
    };

    const [total, rows, unread] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          metadata: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    return paginated(res, rows, total, page, pageSize, { unread });
  }),
);

/** GET /api/notifications/unread-count */
notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
    return ok(res, { unread });
  }),
);

/** POST /api/notifications/:id/read */
notificationsRouter.post(
  '/:id/read',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw ApiError.notFound('That notification was not found.');
    return ok(res, { read: true });
  }),
);

/** POST /api/notifications/read-all */
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { marked: result.count });
  }),
);

/** DELETE /api/notifications/:id */
notificationsRouter.delete(
  '/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const result = await prisma.notification.deleteMany({ where: { id, userId: req.user!.id } });
    if (result.count === 0) throw ApiError.notFound('That notification was not found.');
    return noContent(res);
  }),
);

/** DELETE /api/notifications — clear read notifications. */
notificationsRouter.delete(
  '/',
  validateBody(z.object({ onlyRead: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const { onlyRead } = req.body as { onlyRead: boolean };
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user!.id, ...(onlyRead ? { readAt: { not: null } } : {}) },
    });
    return ok(res, { deleted: result.count });
  }),
);
