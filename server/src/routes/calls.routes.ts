import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { emitToUser } from '../realtime';
import { createNotification } from '../services/notification.service';
import { buildIceServers, webrtcSummary } from '../services/webrtc.service';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const callsRouter = Router();

callsRouter.use(requireAuth);

/**
 * One-to-one audio/video calling.
 *
 * The server never sees or stores media. It owns three things:
 *  1. authorisation — both participants must be real, active, non-blocked members;
 *  2. signalling — SDP offers/answers and ICE candidates are relayed between the
 *     two socket rooms, and only between them (see realtime.ts);
 *  3. the call record — so an incoming call reaches the right person and call
 *     history is real rather than decorative.
 *
 * A call is only visible to its two participants. Any other member gets a 404,
 * the same as a call that does not exist.
 */

/** GET /api/calls/ice — ICE servers for the caller, with short-lived TURN creds. */
callsRouter.get(
  '/ice',
  asyncHandler(async (req, res) =>
    ok(res, {
      iceServers: buildIceServers(req.user!.id),
      ...webrtcSummary(),
    }),
  ),
);

const startCallSchema = z.object({
  username: z.string().trim().min(3).max(30),
  type: z.enum(['AUDIO', 'VIDEO']),
});

/** POST /api/calls — start a call and ring the other member. */
callsRouter.post(
  '/',
  requireVerified,
  validateBody(startCallSchema),
  asyncHandler(async (req, res) => {
    const { username, type } = req.body as z.infer<typeof startCallSchema>;

    const callee = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        status: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
    });
    if (!callee || callee.status !== 'ACTIVE') throw ApiError.notFound('That member could not be found.');
    if (callee.id === req.user!.id) throw ApiError.badRequest('You cannot call yourself.');

    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: req.user!.id, blockedId: callee.id },
          { blockerId: callee.id, blockedId: req.user!.id },
        ],
        NOT: { reason: 'DISMISSED_MATCH' },
      },
      select: { id: true },
    });
    if (block) throw ApiError.forbidden('Calling is not available with that member.');

    // One active call per member at a time, so a stale ringing row cannot
    // shadow a new call.
    const existing = await prisma.callSession.findFirst({
      where: {
        status: { in: ['RINGING', 'ACCEPTED'] },
        OR: [{ callerId: req.user!.id }, { calleeId: req.user!.id }],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, 'CALL_IN_PROGRESS', 'You are already in a call. End it before starting another.');
    }

    const caller = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
    });

    const call = await prisma.callSession.create({
      data: { callerId: req.user!.id, calleeId: callee.id, type },
      select: { id: true, type: true, status: true, startedAt: true },
    });

    emitToUser(callee.id, 'call:incoming', {
      callId: call.id,
      type: call.type,
      from: {
        username: caller?.username ?? req.user!.username,
        displayName: caller?.profile?.displayName ?? req.user!.username,
        avatarUrl: caller?.profile?.avatarUrl ?? null,
      },
      startedAt: call.startedAt,
      ringTimeoutSeconds: env.CALL_RING_TIMEOUT_SECONDS,
    });

    await createNotification(
      {
        userId: callee.id,
        type: 'SYSTEM',
        title: `Incoming ${type === 'VIDEO' ? 'video' : 'audio'} call`,
        body: `@${req.user!.username} is calling you.`,
        link: `/messages`,
        metadata: { callId: call.id, kind: 'CALL' },
      },
      emitToUser,
    );

    logger.info('call.started', { callId: call.id, type, callerId: req.user!.id });

    return created(res, { ...call, iceServers: buildIceServers(req.user!.id) });
  }),
);

/** Loads a call the caller participates in, or 404s. */
async function loadCallForParticipant(callId: string, userId: string) {
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    select: {
      id: true,
      callerId: true,
      calleeId: true,
      type: true,
      status: true,
      startedAt: true,
      acceptedAt: true,
      endedAt: true,
      durationSeconds: true,
    },
  });
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    throw ApiError.notFound('That call could not be found.');
  }
  return call;
}

/** GET /api/calls/:id — current state, for the ringing and in-call screens. */
callsRouter.get(
  '/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const call = await loadCallForParticipant(id, req.user!.id);

    const [caller, callee] = await Promise.all([
      prisma.user.findUnique({
        where: { id: call.callerId },
        select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
      }),
      prisma.user.findUnique({
        where: { id: call.calleeId },
        select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
      }),
    ]);

    const shape = (u: typeof caller) => ({
      username: u?.username ?? 'unknown',
      displayName: u?.profile?.displayName ?? u?.username ?? 'Unknown member',
      avatarUrl: u?.profile?.avatarUrl ?? null,
    });

    return ok(res, {
      ...call,
      role: call.callerId === req.user!.id ? 'CALLER' : 'CALLEE',
      caller: shape(caller),
      callee: shape(callee),
      iceServers: buildIceServers(req.user!.id),
    });
  }),
);

/** POST /api/calls/:id/accept — the callee answers. */
callsRouter.post(
  '/:id/accept',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const call = await loadCallForParticipant(id, req.user!.id);

    if (call.calleeId !== req.user!.id) {
      throw ApiError.forbidden('Only the person being called can answer this call.');
    }
    if (call.status !== 'RINGING') {
      throw new ApiError(409, 'CALL_NOT_RINGING', 'This call is no longer ringing.');
    }

    const updated = await prisma.callSession.update({
      where: { id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
      select: { id: true, status: true, acceptedAt: true },
    });

    emitToUser(call.callerId, 'call:accepted', { callId: id, at: updated.acceptedAt });
    return ok(res, { ...updated, iceServers: buildIceServers(req.user!.id) });
  }),
);

/** POST /api/calls/:id/reject — the callee declines. */
callsRouter.post(
  '/:id/reject',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ reason: z.string().trim().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const call = await loadCallForParticipant(id, req.user!.id);

    if (call.calleeId !== req.user!.id) {
      throw ApiError.forbidden('Only the person being called can decline this call.');
    }
    if (call.status !== 'RINGING') {
      throw new ApiError(409, 'CALL_NOT_RINGING', 'This call is no longer ringing.');
    }

    await prisma.callSession.update({
      where: { id },
      data: { status: 'REJECTED', endedAt: new Date(), endedById: req.user!.id, endReason: reason ?? 'Declined' },
    });

    emitToUser(call.callerId, 'call:rejected', { callId: id });
    return ok(res, { status: 'REJECTED' });
  }),
);

/** POST /api/calls/:id/end — either participant hangs up. */
callsRouter.post(
  '/:id/end',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ reason: z.string().trim().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const call = await loadCallForParticipant(id, req.user!.id);

    if (call.status === 'ENDED' || call.status === 'REJECTED' || call.status === 'MISSED') {
      return ok(res, { status: call.status, alreadyEnded: true });
    }

    const endedAt = new Date();
    const durationSeconds = call.acceptedAt
      ? Math.max(0, Math.round((endedAt.getTime() - call.acceptedAt.getTime()) / 1000))
      : null;

    await prisma.callSession.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt,
        durationSeconds,
        endedById: req.user!.id,
        endReason: reason ?? null,
      },
    });

    const otherId = call.callerId === req.user!.id ? call.calleeId : call.callerId;
    emitToUser(otherId, 'call:ended', { callId: id, durationSeconds });
    return ok(res, { status: 'ENDED', durationSeconds });
  }),
);

/** GET /api/calls — the caller's real call history. */
callsRouter.get(
  '/',
  validateQuery(z.object({ page: z.coerce.number().int().positive().default(1) })),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 20, maxPageSize: 50 });

    const where = { OR: [{ callerId: req.user!.id }, { calleeId: req.user!.id }] };
    const [total, rows] = await Promise.all([
      prisma.callSession.count({ where }),
      prisma.callSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          status: true,
          startedAt: true,
          acceptedAt: true,
          endedAt: true,
          durationSeconds: true,
          callerId: true,
          caller: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          callee: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((c) => {
        const outgoing = c.callerId === req.user!.id;
        const other = outgoing ? c.callee : c.caller;
        return {
          id: c.id,
          type: c.type,
          status: c.status,
          direction: outgoing ? 'OUTGOING' : 'INCOMING',
          other: {
            username: other.username,
            displayName: other.profile?.displayName ?? other.username,
            avatarUrl: other.profile?.avatarUrl ?? null,
          },
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          durationSeconds: c.durationSeconds,
        };
      }),
      total,
      page,
      pageSize,
    );
  }),
);
