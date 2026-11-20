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
 *    conversationId cannot leak history.
 */

let io: IOServer | null = null;

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

    // Join the rooms of conversations this user is actually a member of.
    try {
      const parts = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      for (const part of parts) socket.join(`conversation:${part.conversationId}`);
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

    socket.on('typing', (payload: { conversationId: string; typing: boolean }) => {
      if (!payload?.conversationId) return;
      socket.to(`conversation:${payload.conversationId}`).emit('typing', {
        conversationId: payload.conversationId,
        userId,
        typing: Boolean(payload.typing),
      });
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

    socket.on('disconnect', (reason) => {
      logger.debug('socket.disconnected', { userId, reason });
    });
  });

  logger.info('realtime.ready', { origins: env.corsOrigins });
  return io;
}
