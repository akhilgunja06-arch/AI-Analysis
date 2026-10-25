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

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

/** Only members of an exchange may schedule or read its sessions. */
async function assertExchangeMember(exchangeId: string, userId: string) {
  const participant = await prisma.exchangeParticipant.findUnique({
    where: { exchangeId_userId: { exchangeId, userId } },
    select: { id: true, exchange: { select: { id: true, status: true, title: true, sessionMinutes: true } } },
  });
  if (!participant) throw ApiError.forbidden('You are not part of this exchange.');
  return participant;
}

const createSessionSchema = z.object({
  exchangeId: uuidSchema,
  title: z.string().trim().max(160).optional().or(z.literal('')),
  agenda: z.string().trim().max(2000).optional().or(z.literal('')),
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  timezone: z.string().trim().max(64).default('UTC'),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).default('ONLINE'),
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a full URL starting with http:// or https://')
    .optional()
    .or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
});

/**
 * POST /api/sessions — schedule a session.
 *
 * Conflict checks are performed against every participant's existing scheduled
 * sessions, so a member cannot be double-booked.
 */
sessionsRouter.post(
  '/',
  requireVerified,
  validateBody(createSessionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSessionSchema>;

    const { exchange } = await assertExchangeMember(body.exchangeId, req.user!.id);
    if (['COMPLETED', 'CANCELLED', 'DECLINED', 'WITHDRAWN'].includes(exchange.status)) {
      throw ApiError.conflict('This exchange is closed, so new sessions cannot be scheduled.');
    }

    const startsAt = body.startsAt;
    if (Number.isNaN(startsAt.getTime())) throw ApiError.badRequest('Provide a valid start date and time.');
    if (startsAt.getTime() < Date.now() - 60_000) {
      throw ApiError.unprocessable('Sessions must be scheduled in the future.', {
        issues: [{ path: 'startsAt', message: 'Choose a future date and time.' }],
      });
    }
    const endsAt = new Date(startsAt.getTime() + body.durationMinutes * 60_000);

    const participants = await prisma.exchangeParticipant.findMany({
      where: { exchangeId: body.exchangeId },
      select: { userId: true },
    });
    const participantIds = participants.map((p) => p.userId);

    // Overlap = existingStart < newEnd AND existingEnd > newStart
    const conflicts = await prisma.session.findMany({
      where: {
        status: 'SCHEDULED',
        exchange: { participants: { some: { userId: { in: participantIds } } } },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        title: true,
        exchange: {
          select: {
            id: true,
            title: true,
            participants: {
              where: { userId: { in: participantIds } },
              select: { userId: true, user: { select: { username: true } } },
            },
          },
        },
      },
    });

    if (conflicts.length > 0) {
      const busy = new Set<string>();
      for (const c of conflicts) {
        for (const p of c.exchange.participants) busy.add(p.user.username);
      }
      throw new ApiError(409, 'SCHEDULE_CONFLICT', 'That time clashes with an existing session.', {
        conflicts: conflicts.map((c) => ({
          sessionId: c.id,
          exchangeId: c.exchange.id,
          exchangeTitle: c.exchange.title,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        })),
        busyMembers: [...busy],
      });
    }

    const session = await prisma.session.create({
      data: {
        exchangeId: body.exchangeId,
        hostId: req.user!.id,
        title: body.title || null,
        agenda: body.agenda || null,
        startsAt,
        endsAt,
        timezone: body.timezone,
        format: body.format,
        meetingUrl: body.meetingUrl || null,
        location: body.location || null,
        status: 'SCHEDULED',
      },
      select: {
        id: true,
        title: true,
        agenda: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        format: true,
        meetingUrl: true,
        location: true,
        status: true,
      },
    });

    await prisma.exchangeEvent.create({
      data: {
        exchangeId: body.exchangeId,
        actorId: req.user!.id,
        type: 'session.scheduled',
        summary: `Session scheduled for ${startsAt.toISOString()}`,
      },
    });

    for (const p of participants) {
      if (p.userId === req.user!.id) continue;
      await createNotification(
        {
          userId: p.userId,
          type: 'SESSION_SCHEDULED',
          title: 'New session scheduled',
          body: `@${req.user!.username} scheduled a session in "${exchange.title}".`,
          link: '/calendar',
          metadata: { sessionId: session.id, exchangeId: body.exchangeId },
        },
        emitToUser,
      );
    }

    return created(res, session);
  }),
);

/** GET /api/sessions — agenda list with filters. */
sessionsRouter.get(
  '/',
  validateQuery(
    z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
      exchangeId: uuidSchema.optional(),
      scope: z.enum(['mine', 'hosting']).default('mine'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as {
      from?: string;
      to?: string;
      status?: string;
      exchangeId?: string;
      scope: 'mine' | 'hosting';
    };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 30, maxPageSize: 100 });

    const where = {
      ...(query.scope === 'hosting'
        ? { hostId: req.user!.id }
        : { exchange: { participants: { some: { userId: req.user!.id } } } }),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.exchangeId ? { exchangeId: query.exchangeId } : {}),
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          agenda: true,
          notes: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          format: true,
          meetingUrl: true,
          location: true,
          status: true,
          completedAt: true,
          cancelledAt: true,
          cancellationReason: true,
          host: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          exchange: {
            select: {
              id: true,
              title: true,
              status: true,
              participants: {
                select: {
                  userId: true,
                  user: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((s) => ({
        id: s.id,
        title: s.title,
        agenda: s.agenda,
        notes: s.notes,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        durationMinutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000),
        timezone: s.timezone,
        format: s.format,
        meetingUrl: s.meetingUrl,
        location: s.location,
        status: s.status,
        completedAt: s.completedAt,
        cancelledAt: s.cancelledAt,
        cancellationReason: s.cancellationReason,
        isMine: s.host.id === req.user!.id,
        host: {
          id: s.host.id,
          username: s.host.username,
          displayName: s.host.profile?.displayName ?? s.host.username,
          avatarUrl: s.host.profile?.avatarUrl ?? null,
        },
        exchange: {
          id: s.exchange.id,
          title: s.exchange.title,
          status: s.exchange.status,
          participants: s.exchange.participants.map((p) => ({
            userId: p.userId,
            username: p.user.username,
            displayName: p.user.profile?.displayName ?? p.user.username,
            avatarUrl: p.user.profile?.avatarUrl ?? null,
          })),
        },
      })),
      total,
      page,
      pageSize,
    );
  }),
);

const patchSessionSchema = z.object({
  title: z.string().trim().max(160).optional().or(z.literal('')),
  agenda: z.string().trim().max(2000).optional().or(z.literal('')),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
  startsAt: z.coerce.date().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  meetingUrl: z.string().trim().max(500).optional().or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
});

sessionsRouter.patch(
  '/:id',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(patchSessionSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as z.infer<typeof patchSessionSchema>;

    const existing = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        hostId: true,
        exchangeId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        title: true,
      },
    });
    if (!existing) throw ApiError.notFound('That session could not be found.');

    const { exchange } = await assertExchangeMember(existing.exchangeId, req.user!.id);

    // Either participant may edit the shared plan; only the host may complete it.
    if (body.status === 'COMPLETED' && existing.hostId !== req.user!.id) {
      throw ApiError.forbidden('Only the session host can mark it complete.');
    }
    if (existing.status !== 'SCHEDULED' && (body.startsAt || body.durationMinutes)) {
      throw ApiError.conflict('A session that is no longer scheduled cannot be rescheduled.');
    }

    let startsAt = existing.startsAt;
    let endsAt = existing.endsAt;

    if (body.startsAt) {
      if (body.startsAt.getTime() < Date.now() - 60_000) {
        throw ApiError.unprocessable('Sessions must be scheduled in the future.', {
          issues: [{ path: 'startsAt', message: 'Choose a future date and time.' }],
        });
      }
      startsAt = body.startsAt;
      const minutes = body.durationMinutes ?? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60000);
      endsAt = new Date(startsAt.getTime() + minutes * 60_000);

      const participants = await prisma.exchangeParticipant.findMany({
        where: { exchangeId: existing.exchangeId },
        select: { userId: true },
      });
      const participantIds = participants.map((p) => p.userId);

      const conflicts = await prisma.session.findMany({
        where: {
          id: { not: id },
          status: 'SCHEDULED',
          exchange: { participants: { some: { userId: { in: participantIds } } } },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true, startsAt: true, endsAt: true },
      });
      if (conflicts.length > 0) {
        throw new ApiError(409, 'SCHEDULE_CONFLICT', 'That time clashes with an existing session.', {
          conflicts,
        });
      }
    } else if (body.durationMinutes) {
      endsAt = new Date(startsAt.getTime() + body.durationMinutes * 60_000);
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title || null;
    if (body.agenda !== undefined) data.agenda = body.agenda || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.format) data.format = body.format;
    if (body.meetingUrl !== undefined) data.meetingUrl = body.meetingUrl || null;
    if (body.location !== undefined) data.location = body.location || null;
    if (body.cancellationReason !== undefined) data.cancellationReason = body.cancellationReason || null;
    if (body.startsAt || body.durationMinutes) {
      data.startsAt = startsAt;
      data.endsAt = endsAt;
    }
    if (body.status) {
      data.status = body.status;
      if (body.status === 'COMPLETED') data.completedAt = new Date();
      if (body.status === 'CANCELLED') {
        data.cancelledAt = new Date();
        data.cancelledById = req.user!.id;
      }
    }

    if (Object.keys(data).length === 0) throw ApiError.badRequest('No changes were provided.');

    const session = await prisma.session.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        agenda: true,
        notes: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        format: true,
        meetingUrl: true,
        location: true,
        status: true,
        completedAt: true,
        cancelledAt: true,
        cancellationReason: true,
      },
    });

    const eventType =
      body.status === 'COMPLETED'
        ? 'session.completed'
        : body.status === 'CANCELLED'
          ? 'session.cancelled'
          : 'session.updated';
    await prisma.exchangeEvent.create({
      data: {
        exchangeId: existing.exchangeId,
        actorId: req.user!.id,
        type: eventType,
        summary:
          body.status === 'COMPLETED'
            ? 'Session marked complete'
            : body.status === 'CANCELLED'
              ? `Session cancelled${body.cancellationReason ? `: ${body.cancellationReason}` : ''}`
              : 'Session updated',
      },
    });

    if (body.status) {
      const others = await prisma.exchangeParticipant.findMany({
        where: { exchangeId: existing.exchangeId, userId: { not: req.user!.id } },
        select: { userId: true },
      });
      for (const p of others) {
        await createNotification(
          {
            userId: p.userId,
            type: body.status === 'CANCELLED' ? 'SESSION_CANCELLED' : 'SESSION_UPDATED',
            title: body.status === 'CANCELLED' ? 'Session cancelled' : 'Session updated',
            body: `@${req.user!.username} updated a session in "${exchange.title}".`,
            link: '/calendar',
            metadata: { sessionId: id, exchangeId: existing.exchangeId },
          },
          emitToUser,
        );
      }
    }

    return ok(res, session);
  }),
);

sessionsRouter.delete(
  '/:id',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const existing = await prisma.session.findUnique({
      where: { id },
      select: { id: true, exchangeId: true, status: true },
    });
    if (!existing) throw ApiError.notFound('That session could not be found.');
    await assertExchangeMember(existing.exchangeId, req.user!.id);

    if (existing.status === 'COMPLETED') {
      throw ApiError.conflict('Completed sessions are kept as learning history and cannot be deleted.');
    }

    await prisma.session.delete({ where: { id } });
    return noContent(res);
  }),
);

/** GET /api/sessions/upcoming — small agenda used by the dashboard widget. */
sessionsRouter.get(
  '/upcoming',
  validateQuery(z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) })),
  asyncHandler(async (req, res) => {
    const { limit } = res.locals.query as { limit: number };
    const sessions = await prisma.session.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: { gte: new Date() },
        exchange: { participants: { some: { userId: req.user!.id } } },
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        format: true,
        meetingUrl: true,
        location: true,
        host: { select: { username: true, profile: { select: { displayName: true } } } },
        exchange: { select: { id: true, title: true } },
      },
    });

    return ok(
      res,
      sessions.map((s) => ({
        id: s.id,
        title: s.title ?? s.exchange.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        format: s.format,
        meetingUrl: s.meetingUrl,
        location: s.location,
        host: s.host.profile?.displayName ?? s.host.username,
        exchange: s.exchange,
      })),
    );
  }),
);
