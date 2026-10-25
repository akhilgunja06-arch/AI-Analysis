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

    socket.on('disconnect', (reason) => {
      logger.debug('socket.disconnected', { userId, reason });
    });
  });

  logger.info('realtime.ready', { origins: env.corsOrigins });
  return io;
}
