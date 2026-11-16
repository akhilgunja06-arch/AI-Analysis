import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateParams } from '../lib/http';
import { created, noContent, ok, paginated } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { createNotification } from '../services/notification.service';
import { emitToUser } from '../realtime';

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

const usernameParams = z.object({ username: z.string().trim().min(3).max(30) });

/**
 * GET /api/favorites — the member's own favourites, paginated.
 * A favourite is private to the member who created it; only their own list is
 * ever returned.
 */
favoritesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(48, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '24'), 10) || 24));

    const where = { userId: req.user!.id };
    const [total, rows] = await Promise.all([
      prisma.favorite.count({ where }),
      prisma.favorite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          favoriteUser: {
            select: {
              id: true,
              username: true,
              status: true,
              profile: { select: { displayName: true, headline: true, avatarUrl: true, location: true } },
            },
          },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        member: {
          username: r.favoriteUser.username,
          displayName: r.favoriteUser.profile?.displayName ?? r.favoriteUser.username,
          headline: r.favoriteUser.profile?.headline ?? null,
          avatarUrl: r.favoriteUser.profile?.avatarUrl ?? null,
          location: r.favoriteUser.profile?.location ?? null,
        },
      })),
      total,
      page,
      pageSize,
    );
  }),
);

/** GET /api/favorites/:username — whether a member is favourited, and by whom. */
favoritesRouter.get(
  '/:username',
  validateParams(usernameParams),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    const favorite = await prisma.favorite.findUnique({
      where: { userId_favoriteUserId: { userId: req.user!.id, favoriteUserId: target.id } },
      select: { id: true },
    });

    return ok(res, { isFavorite: Boolean(favorite) });
  }),
);

/** POST /api/favorites/:username — idempotent add. */
favoritesRouter.post(
  '/:username',
  validateParams(usernameParams),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, status: true },
    });
    if (!target || target.status === 'DEACTIVATED') throw ApiError.notFound('That member could not be found.');
    if (target.id === req.user!.id) throw ApiError.badRequest('You cannot favourite yourself.');

    const existing = await prisma.favorite.findUnique({
      where: { userId_favoriteUserId: { userId: req.user!.id, favoriteUserId: target.id } },
      select: { id: true },
    });
    if (existing) return ok(res, { isFavorite: true });

    await prisma.favorite.create({
      data: { userId: req.user!.id, favoriteUserId: target.id },
    });

    await createNotification(
      {
        userId: target.id,
        type: 'FOLLOW',
        title: 'You were added to someone’s favourites',
        body: `@${req.user!.username} saved you as a favourite.`,
        link: `/members/${req.user!.username}`,
      },
      emitToUser,
    );

    return created(res, { isFavorite: true });
  }),
);

/** DELETE /api/favorites/:username — idempotent remove. */
favoritesRouter.delete(
  '/:username',
  validateParams(usernameParams),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    await prisma.favorite.deleteMany({
      where: { userId: req.user!.id, favoriteUserId: target.id },
    });
    return noContent(res);
  }),
);
