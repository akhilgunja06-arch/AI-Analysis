import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { computeExchangeProgress } from '../services/progress.service';
import {
  ACTION_TARGET_STATUS,
  EXCHANGE_STATUS_LABEL,
  EXCHANGE_TRANSITIONS,
  assertActionAllowed,
  assertTransition,
  type ExchangeAction,
} from '../services/exchange-state.service';
import { createNotification } from '../services/notification.service';
import { recordAudit } from '../services/audit.service';
import { emitToUser } from '../realtime';

export const exchangesRouter = Router();

exchangesRouter.use(requireAuth);

// ------------------------------------------------------------- helpers

const exchangeInclude = {
  participants: {
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      teachesSkillId: true,
      learnsSkillId: true,
      agreedAt: true,
      completedAt: true,
      user: {
        select: {
          username: true,
          profile: { select: { displayName: true, avatarUrl: true, timezone: true } },
        },
      },
    },
  },
} as const;

async function assertParticipant(exchangeId: string, userId: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: {
      id: true,
      status: true,
      title: true,
      createdById: true,
      participants: { select: { userId: true, role: true, status: true } },
    },
  });
  if (!exchange) throw ApiError.notFound('That exchange could not be found.');

  const me = exchange.participants.find((p) => p.userId === userId);
  if (!me) throw ApiError.forbidden('You are not part of this exchange.');

  return { exchange, me };
}

async function logEvent(
  exchangeId: string,
  actorId: string,
  type: string,
  summary: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.exchangeEvent.create({
    data: { exchangeId, actorId, type, summary, metadata: metadata as never },
  });
}

function shapeRequest(row: {
  id: string;
  status: string;
  message: string | null;
  goals: string | null;
  sessionMinutes: number;
  sessionsPerWeek: number;
  totalSessions: number;
  preferredFormat: string;
  createdAt: Date;
  respondedAt: Date | null;
  exchangeId: string | null;
  initiator: { id: string; username: string; profile: { displayName: string; avatarUrl: string | null } | null };
  recipient: { id: string; username: string; profile: { displayName: string; avatarUrl: string | null } | null };
  offeredSkill: { id: string; name: string } | null;
  requestedSkill: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    status: row.status,
    statusLabel: EXCHANGE_STATUS_LABEL[row.status as keyof typeof EXCHANGE_STATUS_LABEL] ?? row.status,
    message: row.message,
    goals: row.goals,
    terms: {
      sessionMinutes: row.sessionMinutes,
      sessionsPerWeek: row.sessionsPerWeek,
      totalSessions: row.totalSessions,
      preferredFormat: row.preferredFormat,
    },
    createdAt: row.createdAt,
    respondedAt: row.respondedAt,
    exchangeId: row.exchangeId,
    initiator: {
      id: row.initiator.id,
      username: row.initiator.username,
      displayName: row.initiator.profile?.displayName ?? row.initiator.username,
      avatarUrl: row.initiator.profile?.avatarUrl ?? null,
    },
    recipient: {
      id: row.recipient.id,
      username: row.recipient.username,
      displayName: row.recipient.profile?.displayName ?? row.recipient.username,
      avatarUrl: row.recipient.profile?.avatarUrl ?? null,
    },
    offeredSkill: row.offeredSkill,
    requestedSkill: row.requestedSkill,
  };
}

const requestSelect = {
  id: true,
  status: true,
  message: true,
  goals: true,
  sessionMinutes: true,
  sessionsPerWeek: true,
  totalSessions: true,
  preferredFormat: true,
  createdAt: true,
  respondedAt: true,
  exchangeId: true,
  initiator: {
    select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } },
  },
  recipient: {
    select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } },
  },
  offeredSkill: { select: { id: true, name: true } },
  requestedSkill: { select: { id: true, name: true } },
} as const;

// -------------------------------------------------------- create a request

const createRequestSchema = z.object({
  recipientId: uuidSchema,
  offeredSkillId: uuidSchema.nullable().optional(),
  requestedSkillId: uuidSchema.nullable().optional(),
  message: z.string().trim().max(2000).optional(),
  goals: z.string().trim().max(2000).optional(),
  sessionMinutes: z.coerce.number().int().min(15).max(240).default(60),
  sessionsPerWeek: z.coerce.number().int().min(1).max(7).default(1),
  totalSessions: z.coerce.number().int().min(1).max(52).default(6),
  preferredFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).default('ONLINE'),
});

exchangesRouter.post(
  '/requests',
  requireVerified,
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createRequestSchema>;

    if (body.recipientId === req.user!.id) {
      throw ApiError.badRequest('You cannot send an exchange request to yourself.');
    }

    const recipient = await prisma.user.findUnique({
      where: { id: body.recipientId },
      select: { id: true, username: true, status: true, preference: { select: { allowExchangeRequests: true } } },
    });
    if (!recipient || recipient.status !== 'ACTIVE') {
      throw ApiError.notFound('That member is not available for exchanges.');
    }
    if (recipient.preference?.allowExchangeRequests === false) {
      throw ApiError.forbidden('That member is not currently accepting exchange requests.');
    }

    // Blocking in either direction stops the request.
    const blocked = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: req.user!.id, blockedId: recipient.id },
          { blockerId: recipient.id, blockedId: req.user!.id },
        ],
      },
      select: { reason: true },
    });
    if (blocked && blocked.reason !== 'DISMISSED_MATCH') {
      throw ApiError.forbidden('An exchange with that member is not possible.');
    }

    // Duplicate prevention: one open request per direction between two members.
    const duplicate = await prisma.exchangeRequest.findFirst({
      where: {
        initiatorId: req.user!.id,
        recipientId: recipient.id,
        status: { in: ['PENDING', 'COUNTERED'] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiError.conflict('You already have an open request with that member.', {
        existingRequestId: duplicate.id,
      });
    }

    for (const skillId of [body.offeredSkillId, body.requestedSkillId]) {
      if (!skillId) continue;
      const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } });
      if (!skill) throw ApiError.badRequest('One of the selected skills does not exist.');
    }

    const request = await prisma.exchangeRequest.create({
      data: {
        initiatorId: req.user!.id,
        recipientId: recipient.id,
        offeredSkillId: body.offeredSkillId ?? null,
        requestedSkillId: body.requestedSkillId ?? null,
        message: body.message ?? null,
        goals: body.goals ?? null,
        sessionMinutes: body.sessionMinutes,
        sessionsPerWeek: body.sessionsPerWeek,
        totalSessions: body.totalSessions,
        preferredFormat: body.preferredFormat,
        status: 'PENDING',
      },
      select: requestSelect,
    });

    await createNotification(
      {
        userId: recipient.id,
        type: 'EXCHANGE_REQUEST',
        title: 'New exchange request',
        body: `@${req.user!.username} would like to exchange skills with you.`,
        link: '/exchanges/requests',
        metadata: { requestId: request.id },
      },
      emitToUser,
    );

    await recordAudit({
      actorId: req.user!.id,
      action: 'exchange_request.created',
      entityType: 'ExchangeRequest',
      entityId: request.id,
      summary: `Request sent to @${recipient.username}`,
      ipAddress: req.ip,
    });

    return created(res, shapeRequest(request));
  }),
);

// --------------------------------------------------------------- list views

exchangesRouter.get(
  '/requests',
  validateQuery(
    z.object({
      box: z.enum(['incoming', 'outgoing', 'all']).default('all'),
      status: z
        .enum(['PENDING', 'COUNTERED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CANCELLED', 'ACTIVE', 'COMPLETED', 'PAUSED'])
        .optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { box: 'incoming' | 'outgoing' | 'all'; status?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });

    const ownership =
      query.box === 'incoming'
        ? { recipientId: req.user!.id }
        : query.box === 'outgoing'
          ? { initiatorId: req.user!.id }
          : { OR: [{ recipientId: req.user!.id }, { initiatorId: req.user!.id }] };

    const where = {
      ...ownership,
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [total, rows, counts] = await Promise.all([
      prisma.exchangeRequest.count({ where }),
      prisma.exchangeRequest.findMany({ where, select: requestSelect, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.exchangeRequest.groupBy({
        by: ['status'],
        where: { OR: [{ recipientId: req.user!.id }, { initiatorId: req.user!.id }] },
        _count: { _all: true },
      }),
    ]);

    return paginated(
      res,
      rows.map(shapeRequest),
      total,
      page,
      pageSize,
      {
        statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        box: query.box,
      },
    );
  }),
);

exchangesRouter.get(
  '/requests/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const request = await prisma.exchangeRequest.findUnique({
      where: { id },
      select: { ...requestSelect, initiatorId: true, recipientId: true, parentRequestId: true },
    });
    if (!request) throw ApiError.notFound('That request could not be found.');
    if (request.initiatorId !== req.user!.id && request.recipientId !== req.user!.id) {
      throw ApiError.forbidden('You do not have access to that request.');
    }

    const timeline = await prisma.auditLog.findMany({
      where: { entityType: 'ExchangeRequest', entityId: id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, summary: true, createdAt: true, actor: { select: { username: true } } },
    });

    return ok(res, {
      request: shapeRequest(request),
      side: request.initiatorId === req.user!.id ? 'initiator' : 'recipient',
      timeline,
    });
  }),
);

// --------------------------------------------------------- respond to request

const respondSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('decline'), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('withdraw') }),
  z.object({
    action: z.literal('counter'),
    message: z.string().trim().max(2000).optional(),
    goals: z.string().trim().max(2000).optional(),
    sessionMinutes: z.coerce.number().int().min(15).max(240),
    sessionsPerWeek: z.coerce.number().int().min(1).max(7),
    totalSessions: z.coerce.number().int().min(1).max(52),
    preferredFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']),
  }),
]);

exchangesRouter.post(
  '/requests/:id/respond',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(respondSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const body = req.body as z.infer<typeof respondSchema>;

    const request = await prisma.exchangeRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        initiatorId: true,
        recipientId: true,
        offeredSkillId: true,
        requestedSkillId: true,
        goals: true,
        sessionMinutes: true,
        sessionsPerWeek: true,
        totalSessions: true,
        preferredFormat: true,
        initiator: { select: { id: true, username: true, profile: { select: { timezone: true } } } },
        recipient: { select: { id: true, username: true } },
      },
    });
    if (!request) throw ApiError.notFound('That request could not be found.');

    const isInitiator = request.initiatorId === req.user!.id;
    const isRecipient = request.recipientId === req.user!.id;
    if (!isInitiator && !isRecipient) throw ApiError.forbidden('You do not have access to that request.');

    const side: 'initiator' | 'recipient' = isInitiator ? 'initiator' : 'recipient';
    const targetStatus = assertActionAllowed(body.action, request.status, side);

    // ---- accept: creates the exchange workspace inside one transaction
    if (body.action === 'accept') {
      const result = await prisma.$transaction(async (tx) => {
        const exchange = await tx.exchange.create({
          data: {
            title: `${request.initiator.username} ↔ ${request.recipient.username}`,
            createdById: req.user!.id,
            status: 'ACCEPTED',
            goals: request.goals,
            sessionMinutes: request.sessionMinutes,
            totalSessions: request.totalSessions,
            preferredFormat: request.preferredFormat,
            startedAt: null,
          },
          select: { id: true },
        });

        await tx.exchangeParticipant.createMany({
          data: [
            {
              exchangeId: exchange.id,
              userId: request.initiatorId,
              role: 'INITIATOR',
              status: 'AGREED',
              teachesSkillId: request.offeredSkillId,
              learnsSkillId: request.requestedSkillId,
              agreedAt: new Date(),
            },
            {
              exchangeId: exchange.id,
              userId: request.recipientId,
              role: 'RECIPIENT',
              status: 'AGREED',
              teachesSkillId: request.requestedSkillId,
              learnsSkillId: request.offeredSkillId,
              agreedAt: new Date(),
            },
          ],
        });

        await tx.exchangeRequest.update({
          where: { id },
          data: { status: 'ACCEPTED', respondedAt: new Date(), exchangeId: exchange.id },
        });

        await tx.exchangeEvent.create({
          data: {
            exchangeId: exchange.id,
            actorId: req.user!.id,
            type: 'exchange.created',
            summary: 'Exchange accepted and workspace created',
          },
        });

        return exchange;
      });

      const otherId = isInitiator ? request.recipientId : request.initiatorId;
      await createNotification(
        {
          userId: otherId,
          type: 'EXCHANGE_ACCEPTED',
          title: 'Exchange request accepted',
          body: `@${req.user!.username} accepted your exchange request. Your workspace is ready.`,
          link: `/exchanges/${result.id}`,
          metadata: { exchangeId: result.id },
        },
        emitToUser,
      );

      await recordAudit({
        actorId: req.user!.id,
        action: 'exchange_request.accepted',
        entityType: 'ExchangeRequest',
        entityId: id,
        summary: `Request accepted; exchange ${result.id} created`,
        ipAddress: req.ip,
      });

      return ok(res, { status: 'ACCEPTED', exchangeId: result.id });
    }

    // ---- counter: records a counter-proposal linked to the original
    if (body.action === 'counter') {
      const counter = await prisma.$transaction(async (tx) => {
        await tx.exchangeRequest.update({
          where: { id },
          data: { status: 'COUNTERED', respondedAt: new Date() },
        });

        return tx.exchangeRequest.create({
          data: {
            // The counter runs in the opposite direction so the original
            // initiator becomes the one who can accept it.
            initiatorId: req.user!.id,
            recipientId: isInitiator ? request.recipientId : request.initiatorId,
            offeredSkillId: request.requestedSkillId,
            requestedSkillId: request.offeredSkillId,
            message: body.message ?? null,
            goals: body.goals ?? request.goals,
            sessionMinutes: body.sessionMinutes,
            sessionsPerWeek: body.sessionsPerWeek,
            totalSessions: body.totalSessions,
            preferredFormat: body.preferredFormat,
            status: 'PENDING',
            parentRequestId: id,
          },
          select: requestSelect,
        });
      });

      const otherId = isInitiator ? request.recipientId : request.initiatorId;
      await createNotification(
        {
          userId: otherId,
          type: 'EXCHANGE_COUNTERED',
          title: 'Counter-proposal received',
          body: `@${req.user!.username} proposed different terms for your exchange.`,
          link: '/exchanges/requests',
          metadata: { requestId: counter.id },
        },
        emitToUser,
      );

      return ok(res, { status: 'COUNTERED', counterRequest: shapeRequest(counter) });
    }

    // ---- decline / withdraw
    const updated = await prisma.exchangeRequest.update({
      where: { id },
      data: {
        status: targetStatus,
        respondedAt: new Date(),
        ...(body.action === 'decline' && body.reason ? { message: body.reason } : {}),
      },
      select: requestSelect,
    });

    const otherId = isInitiator ? request.recipientId : request.initiatorId;
    await createNotification(
      {
        userId: otherId,
        type: body.action === 'decline' ? 'EXCHANGE_DECLINED' : 'EXCHANGE_CANCELLED',
        title: body.action === 'decline' ? 'Exchange request declined' : 'Exchange request withdrawn',
        body: `@${req.user!.username} ${body.action === 'decline' ? 'declined' : 'withdrew'} the exchange request.`,
        link: '/exchanges/requests',
        metadata: { requestId: id },
      },
      emitToUser,
    );

    await recordAudit({
      actorId: req.user!.id,
      action: `exchange_request.${body.action}`,
      entityType: 'ExchangeRequest',
      entityId: id,
      summary: `Request ${body.action === 'decline' ? 'declined' : 'withdrawn'}`,
      ipAddress: req.ip,
    });

    return ok(res, shapeRequest(updated));
  }),
);

// ------------------------------------------------------------ exchange list

exchangesRouter.get(
  '/',
  validateQuery(z.object({ status: z.string().trim().max(20).optional() })),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { status?: string };
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 12, maxPageSize: 50 });

    const where = {
      participants: { some: { userId: req.user!.id } },
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.exchange.count({ where }),
      prisma.exchange.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: {
          ...exchangeInclude,
          id: true,
          title: true,
          status: true,
          goals: true,
          sessionMinutes: true,
          totalSessions: true,
          preferredFormat: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sessions: true, milestones: true } },
        },
      }),
    ]);

    const exchangeIds = rows.map((r) => r.id);
    const [sessionCounts, milestoneDone] = await Promise.all([
      prisma.session.groupBy({
        by: ['exchangeId'],
        where: { exchangeId: { in: exchangeIds }, status: 'COMPLETED' },
        _count: { _all: true },
      }),
      prisma.milestone.groupBy({
        by: ['exchangeId'],
        where: { exchangeId: { in: exchangeIds }, status: 'DONE' },
        _count: { _all: true },
      }),
    ]);
    const sessionsById = new Map(sessionCounts.map((s) => [s.exchangeId, s._count._all]));
    const milestonesById = new Map(milestoneDone.map((m) => [m.exchangeId, m._count._all]));

    return paginated(
      res,
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        statusLabel: EXCHANGE_STATUS_LABEL[r.status],
        goals: r.goals,
        sessionMinutes: r.sessionMinutes,
        totalSessions: r.totalSessions,
        preferredFormat: r.preferredFormat,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        participants: r.participants.map((p) => ({
          userId: p.userId,
          role: p.role,
          status: p.status,
          isMe: p.userId === req.user!.id,
          username: p.user.username,
          displayName: p.user.profile?.displayName ?? p.user.username,
          avatarUrl: p.user.profile?.avatarUrl ?? null,
        })),
        progress: computeExchangeProgress({
          agreedSessions: r.totalSessions,
          sessionsRecorded: r._count.sessions,
          sessionsCompleted: sessionsById.get(r.id) ?? 0,
          milestonesTotal: r._count.milestones,
          milestonesDone: milestonesById.get(r.id) ?? 0,
        }),
      })),
      total,
      page,
      pageSize,
    );
  }),
);

// -------------------------------------------------------- workspace details

exchangesRouter.get(
  '/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { exchange, me } = await assertParticipant(id, req.user!.id);

    const [full, sessions, milestones, events, reviews, notes, requests] = await Promise.all([
      prisma.exchange.findUnique({
        where: { id },
        select: {
          ...exchangeInclude,
          id: true,
          title: true,
          status: true,
          goals: true,
          sessionMinutes: true,
          totalSessions: true,
          preferredFormat: true,
          creditValue: true,
          startedAt: true,
          completedAt: true,
          pausedAt: true,
          cancelledAt: true,
          cancellationReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.session.findMany({
        where: { exchangeId: id },
        orderBy: { startsAt: 'asc' },
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
          host: { select: { username: true, profile: { select: { displayName: true } } } },
        },
      }),
      prisma.milestone.findMany({
        where: { exchangeId: id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueAt: true,
          completedAt: true,
          sortOrder: true,
          author: { select: { username: true, profile: { select: { displayName: true } } } },
        },
      }),
      prisma.exchangeEvent.findMany({
        where: { exchangeId: id },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true, type: true, summary: true, metadata: true, createdAt: true, actorId: true },
      }),
      prisma.review.findMany({
        where: { exchangeId: id },
        select: {
          id: true,
          authorId: true,
          subjectId: true,
          rating: true,
          comment: true,
          createdAt: true,
          hiddenAt: true,
        },
      }),
      prisma.exchangeNote.findMany({
        where: { exchangeId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          body: true,
          resourceUrl: true,
          createdAt: true,
          author: {
            select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
          },
        },
      }),
      prisma.exchangeRequest.findMany({
        where: { exchangeId: id },
        select: { id: true, status: true, createdAt: true, offeredSkillId: true, requestedSkillId: true },
      }),
    ]);

    // Skill names for the participants' agreed teach/learn pairs.
    const skillIds = new Set<string>();
    for (const p of full?.participants ?? []) {
      if (p.teachesSkillId) skillIds.add(p.teachesSkillId);
      if (p.learnsSkillId) skillIds.add(p.learnsSkillId);
    }
    const skills = await prisma.skill.findMany({
      where: { id: { in: [...skillIds] } },
      select: { id: true, name: true, slug: true },
    });
    const skillById = new Map(skills.map((s) => [s.id, s]));

    const myReview = reviews.find((r) => r.authorId === req.user!.id && !r.hiddenAt);
    const theirReview = reviews.find((r) => r.authorId !== req.user!.id && !r.hiddenAt);

    const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length;
    const scheduledSessions = sessions.filter((s) => s.status === 'SCHEDULED').length;
    const doneMilestones = milestones.filter((m) => m.status === 'DONE').length;

    const bothConfirmed = (full?.participants ?? []).every((p) => p.status === 'COMPLETED');
    const myConfirmed = me.status === 'COMPLETED';

    // Which actions this member may take right now, and why not otherwise.
    const availableActions: ExchangeAction[] = [];
    const allowed = EXCHANGE_TRANSITIONS[exchange.status] ?? [];
    if (allowed.includes('ACTIVE')) availableActions.push(exchange.status === 'PAUSED' ? 'resume' : 'start');
    if (allowed.includes('PAUSED')) availableActions.push('pause');
    if (allowed.includes('COMPLETED')) availableActions.push('complete');
    if (allowed.includes('CANCELLED')) availableActions.push('cancel');

    return ok(res, {
      exchange: {
        id: full!.id,
        title: full!.title,
        status: full!.status,
        statusLabel: EXCHANGE_STATUS_LABEL[full!.status],
        goals: full!.goals,
        sessionMinutes: full!.sessionMinutes,
        totalSessions: full!.totalSessions,
        preferredFormat: full!.preferredFormat,
        creditValue: full!.creditValue,
        startedAt: full!.startedAt,
        completedAt: full!.completedAt,
        pausedAt: full!.pausedAt,
        cancelledAt: full!.cancelledAt,
        cancellationReason: full!.cancellationReason,
        createdAt: full!.createdAt,
        updatedAt: full!.updatedAt,
        participants: full!.participants.map((p) => ({
          userId: p.userId,
          role: p.role,
          status: p.status,
          isMe: p.userId === req.user!.id,
          username: p.user.username,
          displayName: p.user.profile?.displayName ?? p.user.username,
          avatarUrl: p.user.profile?.avatarUrl ?? null,
          timezone: p.user.profile?.timezone ?? null,
          agreedAt: p.agreedAt,
          completedAt: p.completedAt,
          teaches: p.teachesSkillId ? skillById.get(p.teachesSkillId) ?? null : null,
          learns: p.learnsSkillId ? skillById.get(p.learnsSkillId) ?? null : null,
        })),
      },
      sessions: sessions.map((s) => ({
        ...s,
        hostDisplayName: s.host.profile?.displayName ?? s.host.username,
        isMine: s.host.username === req.user!.username,
      })),
      milestones: milestones.map((m) => ({
        ...m,
        authorDisplayName: m.author.profile?.displayName ?? m.author.username,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        resourceUrl: n.resourceUrl,
        createdAt: n.createdAt,
        author: {
          username: n.author.username,
          displayName: n.author.profile?.displayName ?? n.author.username,
          avatarUrl: n.author.profile?.avatarUrl ?? null,
        },
      })),
      timeline: events,
      requests,
      permissions: {
        myRole: me.role,
        myParticipantStatus: me.status,
        availableActions,
        canConfirmCompletion: full!.status === 'ACTIVE' || full!.status === 'PAUSED',
        myCompletionConfirmed: myConfirmed,
        bothConfirmed,
      },
      progress: {
        ...computeExchangeProgress({
          agreedSessions: full!.totalSessions,
          sessionsRecorded: sessions.length,
          sessionsCompleted: completedSessions,
          milestonesTotal: milestones.length,
          milestonesDone: doneMilestones,
        }),
        sessionsScheduled: scheduledSessions,
      },
      reviews: {
        mine: myReview ? { id: myReview.id, rating: myReview.rating, comment: myReview.comment } : null,
        theirs: theirReview
          ? { id: theirReview.id, rating: theirReview.rating, comment: theirReview.comment }
          : null,
        canReview: (full!.status === 'COMPLETED' || full!.status === 'ACTIVE') && !myReview,
      },
    });
  }),
);

// ------------------------------------------------------------- state actions

const actionSchema = z.object({
  action: z.enum(['start', 'pause', 'resume', 'complete', 'cancel']),
  reason: z.string().trim().max(500).optional(),
});

exchangesRouter.post(
  '/:id/actions',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(actionSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { action, reason } = req.body as z.infer<typeof actionSchema>;

    const { exchange, me } = await assertParticipant(id, req.user!.id);
    const target = assertTransition(exchange.status, ACTION_TARGET_STATUS[action]);

    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status: target };

      if (action === 'start') data.startedAt = new Date();
      if (action === 'pause') data.pausedAt = new Date();
      if (action === 'complete') data.completedAt = new Date();
      if (action === 'cancel') {
        data.cancelledAt = new Date();
        data.cancellationReason = reason ?? null;
      }
      if (action === 'resume') data.pausedAt = null;

      const row = await tx.exchange.update({
        where: { id },
        data,
        select: { id: true, status: true, completedAt: true, startedAt: true, cancelledAt: true },
      });

      if (action === 'complete') {
        await tx.exchangeParticipant.updateMany({
          where: { exchangeId: id, userId: req.user!.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      await tx.exchangeEvent.create({
        data: {
          exchangeId: id,
          actorId: req.user!.id,
          type: `exchange.${action}`,
          summary:
            action === 'cancel'
              ? `Exchange cancelled${reason ? `: ${reason}` : ''}`
              : `Exchange marked as ${target.toLowerCase()}`,
        },
      });

      return row;
    });

    const otherParticipants = await prisma.exchangeParticipant.findMany({
      where: { exchangeId: id, userId: { not: req.user!.id } },
      select: { userId: true },
    });

    const notificationType =
      action === 'cancel'
        ? 'EXCHANGE_CANCELLED'
        : action === 'complete'
          ? 'EXCHANGE_COMPLETED'
          : 'EXCHANGE_ACTIVE';

    for (const p of otherParticipants) {
      await createNotification(
        {
          userId: p.userId,
          type: notificationType,
          title:
            action === 'cancel'
              ? 'Exchange cancelled'
              : action === 'complete'
                ? 'Exchange completed'
                : 'Exchange status updated',
          body: `@${req.user!.username} marked the exchange as ${target.toLowerCase()}.`,
          link: `/exchanges/${id}`,
          metadata: { exchangeId: id },
        },
        emitToUser,
      );
    }

    await recordAudit({
      actorId: req.user!.id,
      action: `exchange.${action}`,
      entityType: 'Exchange',
      entityId: id,
      summary: `Exchange moved ${exchange.status} → ${target}`,
      metadata: { from: exchange.status, to: target, reason },
      ipAddress: req.ip,
    });

    return ok(res, { id: updated.id, status: updated.status, statusLabel: EXCHANGE_STATUS_LABEL[updated.status] });
  }),
);

/** GET /api/exchanges/meta/transitions — the lifecycle, for documentation/UIs. */
exchangesRouter.get(
  '/meta/transitions',
  asyncHandler(async (_req, res) =>
    ok(res, {
      transitions: EXCHANGE_TRANSITIONS,
      labels: EXCHANGE_STATUS_LABEL,
    }),
  ),
);
