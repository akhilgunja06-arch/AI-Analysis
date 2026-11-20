import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from './config/env';
import { logger } from './lib/logger';
import { verifyAccessToken } from './lib/auth';
import { prisma } from './lib/prisma';

/**
 * Socket.IO wiring.
 *
 * Security decisions:
 *  - the handshake is authenticated with the same access token as the REST API;
 *  - every socket joins only its own `user:<id>` room, so a client can never
 *    subscribe to another member's stream;
 *  - message delivery is additionally authorised against conversation
 *    membership on every send (see messaging.routes.ts), so a forged
 *    conversationId cannot leak history;
 *  - typing events are only relayed for conversations the sender belongs to.
 *
 * Presence is tracked in memory: this is a single-node deployment, and the set
 * is used only to answer "is this member connected right now" and to mark a
 * message delivered.
 */

let io: IOServer | null = null;

/** userId -> number of live sockets (a member may have several tabs open). */
const connections = new Map<string, number>();

export function getIo(): IOServer | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function realtimeEnabled(): boolean {
  return io !== null;
}

/** The set of member ids with at least one live socket. */
export function onlineUserIds(): Set<string> {
  return new Set(connections.keys());
}

export function isOnline(userId: string): boolean {
  return connections.has(userId);
}

/**
 * Who else should know that this member's presence changed? Only people they
 * already share a conversation with, so presence is not broadcast platform-wide.
 */
async function presenceAudience(userId: string): Promise<string[]> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversation: { select: { participants: { select: { userId: true } } } } },
  });
  const audience = new Set<string>();
  for (const part of parts) {
    for (const peer of part.conversation.participants) {
      if (peer.userId !== userId) audience.add(peer.userId);
    }
  }
  return [...audience];
}

export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: env.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) return next(new Error('Authentication required.'));
      const payload = verifyAccessToken(token);
      if (!payload) return next(new Error('Invalid or expired token.'));

      const session = await prisma.authSession.findUnique({
        where: { id: payload.sid },
        select: { id: true, revokedAt: true, expiresAt: true, userId: true, user: { select: { status: true } } },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next(new Error('Session is no longer valid.'));
      }
      if (session.user.status === 'SUSPENDED' || session.user.status === 'DEACTIVATED') {
        return next(new Error('Account is not active.'));
      }

      socket.data.userId = session.userId;
      return next();
    } catch (err) {
      logger.error('socket.auth_failed', { err });
      return next(new Error('Authentication failed.'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    const previous = connections.get(userId) ?? 0;
    connections.set(userId, previous + 1);

    // Join the rooms of conversations this user is actually a member of.
    try {
      const parts = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      for (const part of parts) socket.join(`conversation:${part.conversationId}`);

      await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });

      // A member coming online means anything queued for them is now delivered.
      await prisma.message.updateMany({
        where: {
          deliveredAt: null,
          deletedAt: null,
          senderId: { not: userId },
          conversation: { participants: { some: { userId } } },
        },
        data: { deliveredAt: new Date() },
      });

      if (previous === 0) {
        for (const peerId of await presenceAudience(userId)) {
          emitToUser(peerId, 'presence:update', { userId, online: true, lastSeenAt: new Date().toISOString() });
        }
      }
    } catch (err) {
      logger.error('socket.room_join_failed', { userId, err });
    }

    socket.emit('realtime:ready', { userId, at: new Date().toISOString() });

    socket.on('conversation:join', async (conversationId: string, ack?: (ok: boolean) => void) => {
      const member = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
        select: { id: true },
      });
      if (!member) {
        ack?.(false);
        return;
      }
      socket.join(`conversation:${conversationId}`);
      ack?.(true);
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.leave(`conversation:${conversationId}`);
    });

    /**
     * Typing indicator. The room membership is checked first so a member cannot
     * make a stranger's conversation show "someone is typing".
     */
    socket.on('typing', async (payload: { conversationId: string; typing: boolean }, ack?: (ok: boolean) => void) => {
      if (!payload?.conversationId) return ack?.(false);
      try {
        const member = await prisma.conversationParticipant.findUnique({
          where: { conversationId_userId: { conversationId: payload.conversationId, userId } },
          select: { id: true },
        });
        if (!member) return ack?.(false);
        socket.to(`conversation:${payload.conversationId}`).emit('typing', {
          conversationId: payload.conversationId,
          userId,
          typing: Boolean(payload.typing),
        });
        return ack?.(true);
      } catch (err) {
        logger.error('socket.typing_failed', { userId, err });
        return ack?.(false);
      }
    });

    /**
     * WebRTC signalling relay.
     *
     * The client never names a recipient user id. It names a call id, and the
     * server looks up the other participant from the CallSession row. That means
     * a forged payload cannot deliver an SDP offer or ICE candidate to an
     * unrelated member, and a member who is not on the call cannot inject
     * signalling into it.
     */
    const relaySignal = async (
      event: string,
      payload: { callId?: string } & Record<string, unknown>,
      ack?: (ok: boolean) => void,
    ) => {
      if (!payload?.callId) return ack?.(false);
      try {
        const call = await prisma.callSession.findUnique({
          where: { id: payload.callId },
          select: { callerId: true, calleeId: true, status: true },
        });
        if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
          return ack?.(false);
        }
        if (call.status === 'ENDED' || call.status === 'REJECTED' || call.status === 'MISSED') {
          return ack?.(false);
        }
        const otherId = call.callerId === userId ? call.calleeId : call.callerId;
        io?.to(`user:${otherId}`).emit(event, { ...payload, fromUserId: userId });
        return ack?.(true);
      } catch (err) {
        logger.error('socket.signal_failed', { userId, event, err });
        return ack?.(false);
      }
    };

    socket.on('call:offer', (payload, ack) => void relaySignal('call:offer', payload, ack));
    socket.on('call:answer', (payload, ack) => void relaySignal('call:answer', payload, ack));
    socket.on('call:ice', (payload, ack) => void relaySignal('call:ice', payload, ack));

    // A hang-up over the socket is a convenience; the REST endpoint is what
    // actually writes the call record.
    socket.on('call:hangup', (payload) => void relaySignal('call:hangup', payload));

    socket.on('disconnect', async (reason) => {
      logger.debug('socket.disconnected', { userId, reason });
      const remaining = (connections.get(userId) ?? 1) - 1;
      if (remaining > 0) {
        connections.set(userId, remaining);
        return;
      }
      connections.delete(userId);
      try {
        const lastSeenAt = new Date();
        await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } });
        for (const peerId of await presenceAudience(userId)) {
          emitToUser(peerId, 'presence:update', { userId, online: false, lastSeenAt: lastSeenAt.toISOString() });
        }
      } catch (err) {
        logger.error('socket.presence_offline_failed', { userId, err });
      }
    });
  });

  logger.info('realtime.ready', { origins: env.corsOrigins });
  return io;
}
