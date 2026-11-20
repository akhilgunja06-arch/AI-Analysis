import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireRestrictedAuth } from '../middleware/auth';
import { messageLimiter } from '../middleware/errors';
import { uuidSchema } from '../lib/validation';
import { REAL_BLOCK, blockBetween, blockedPartnerIds } from '../lib/blockFilters';
import { createNotification } from '../services/notification.service';
import { emitToConversation, emitToUser, onlineUserIds } from '../realtime';
import { mediaUrlFor, storeFile, uploadAttachment } from '../services/storage.service';
import { reviewText } from '../services/moderation.service';
import { activeRestriction, enforceModeration } from '../services/enforcement.service';

export const messagingRouter = Router();

// The moderation standing route stays reachable while suspended: a member has
// to read why they were restricted in order to appeal.
const restrictedAuthPaths = new Set(['/moderation']);
messagingRouter.use((req, res, next) => {
  if (restrictedAuthPaths.has(req.path)) return requireRestrictedAuth(req, res, next);
  return requireAuth(req, res, next);
});

/**
 * Every read and write goes through this check. A member can only touch a
 * conversation they are listed as a participant of — a client-supplied id is
 * never trusted on its own.
 */
async function assertConversationMember(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, muted: true, blocked: true, conversation: { select: { id: true, isGroup: true } } },
  });
  if (!participant) {
    // Same answer whether the conversation is missing or simply not theirs.
    throw ApiError.notFound('That conversation could not be found.');
  }
  return participant;
}

/** Deterministic key so a 1:1 conversation can never be duplicated. */
function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

const senderSelect = {
  username: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} as const;

function shapeSender(sender: {
  username: string;
  profile: { displayName: string; avatarUrl: string | null } | null;
}) {
  return {
    username: sender.username,
    displayName: sender.profile?.displayName ?? sender.username,
    avatarUrl: sender.profile?.avatarUrl ?? null,
  };
}

function shapePeer(peer: {
  id: string;
  username: string;
  lastSeenAt: Date | null;
  profile: { displayName: string; avatarUrl: string | null } | null;
}) {
  return {
    id: peer.id,
    username: peer.username,
    displayName: peer.profile?.displayName ?? peer.username,
    avatarUrl: peer.profile?.avatarUrl ?? null,
    online: onlineUserIds().has(peer.id),
    lastSeenAt: peer.lastSeenAt,
  };
}

/**
 * Runs the safety policy and applies any consequence. Returns the WARN notice to
 * attach to the response, or null when the message is clean. A BLOCK is thrown
 * as a 422 carrying a reason the sender can act on.
 *
 * Ordinary conversation — study, work, films, small talk — always passes. Only
 * threats, sexual solicitation, self-harm risk, spam and abuse are stopped.
 */
async function moderateMessage(userId: string, body: string): Promise<string | null> {
  const decision = await reviewText({ userId, text: body, surface: 'MESSAGE' });
  if (decision.verdict === 'BLOCK') {
    await enforceModeration(userId, decision);
    throw new ApiError(422, 'MESSAGE_BLOCKED', decision.reason, {
      category: decision.category,
      severity: decision.severity,
    });
  }
  if (decision.verdict === 'WARN') {
    const outcome = await enforceModeration(userId, decision);
    return outcome.restricted
      ? `${decision.reason} Your messaging has been paused temporarily.`
      : decision.reason;
  }
  return null;
}

/** Refuses a write while the caller is under an active messaging restriction. */
async function assertNotRestricted(userId: string) {
  const restriction = await activeRestriction(userId);
  if (restriction) {
    throw new ApiError(
      403,
      'MESSAGING_RESTRICTED',
      `Messaging is paused on your account: ${restriction.reason}`,
      { expiresAt: restriction.expiresAt?.toISOString() ?? null },
    );
  }
}

/**
 * Refuses the write when either side has blocked the other. The participant
 * `blocked` flag covers a conversation-level mute; the `UserBlock` table covers
 * a member-level block, and both must stop delivery.
 */
async function assertNoBlock(senderId: string, recipientIds: string[]) {
  for (const recipientId of recipientIds) {
    const block = await prisma.userBlock.findFirst({
      where: blockBetween(senderId, recipientId),
      select: { id: true },
    });
    if (block) throw ApiError.forbidden('Messaging is not available with that member.');
  }
}

/**
 * Members the caller may message. A block in either direction, or a closed
 * inbox, is excluded so search never offers a conversation that would be
 * refused on open.
 */
async function messageableUserWhere(callerId: string) {
  const excluded = await blockedPartnerIds(prisma, callerId);
  excluded.add(callerId);
  return { id: { notIn: [...excluded] }, status: 'ACTIVE' as const };
}

// ------------------------------------------------------------- user search

/**
 * GET /api/messages/users?search=… — people the caller can start a chat with.
 * Matching is by username or display name; blocked relationships are excluded.
 */
messagingRouter.get(
  '/users',
  validateQuery(z.object({ search: z.string().trim().max(60).optional() })),
  asyncHandler(async (req, res) => {
    const { search } = res.locals.query as { search?: string };
    const where = await messageableUserWhere(req.user!.id);
    const term = search?.trim();

    const users = await prisma.user.findMany({
      where: {
        ...where,
        ...(term
          ? {
              OR: [
                { username: { contains: term, mode: 'insensitive' as const } },
                { profile: { displayName: { contains: term, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      orderBy: { username: 'asc' },
      take: 20,
      select: {
        id: true,
        username: true,
        lastSeenAt: true,
        profile: { select: { displayName: true, avatarUrl: true, headline: true } },
      },
    });

    // Which of these already have a direct conversation with the caller? One
    // query instead of a lookup per row.
    const mine = await prisma.conversationParticipant.findMany({
      where: { userId: req.user!.id, conversation: { isGroup: false } },
      select: { conversationId: true, conversation: { select: { directKey: true } } },
    });
    const byDirectKey = new Map(mine.map((m) => [m.conversation.directKey, m.conversationId]));

    return ok(
      res,
      users.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.profile?.displayName ?? user.username,
        avatarUrl: user.profile?.avatarUrl ?? null,
        headline: user.profile?.headline ?? null,
        online: onlineUserIds().has(user.id),
        lastSeenAt: user.lastSeenAt,
        conversationId: byDirectKey.get(directKey(req.user!.id, user.id)) ?? null,
      })),
    );
  }),
);

// ---------------------------------------------------------- conversations

const startConversationSchema = z.object({
  username: z.string().trim().min(3).max(30),
  message: z.string().trim().max(4000).optional(),
});

/** POST /api/messages/conversations — open (or reuse) a 1:1 conversation. */
messagingRouter.post(
  '/conversations',
  validateBody(startConversationSchema),
  asyncHandler(async (req, res) => {
    const { username, message } = req.body as z.infer<typeof startConversationSchema>;

    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, username: true, status: true, preference: { select: { allowMessagesFrom: true } } },
    });
    if (!target || target.status !== 'ACTIVE') throw ApiError.notFound('That member could not be found.');
    if (target.id === req.user!.id) throw ApiError.badRequest('You cannot message yourself.');

    const block = await prisma.userBlock.findFirst({
      where: blockBetween(req.user!.id, target.id),
      select: { reason: true },
    });
    if (block) throw ApiError.forbidden('Messaging is not available with that member.');

    if (target.preference?.allowMessagesFrom === 'NOBODY') {
      throw ApiError.forbidden('That member is not accepting messages.');
    }
    if (target.preference?.allowMessagesFrom === 'FOLLOWING') {
      const follows = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.user!.id, followingId: target.id } },
        select: { id: true },
      });
      if (!follows) {
        throw ApiError.forbidden('That member only accepts messages from people they follow.');
      }
    }

    const key = directKey(req.user!.id, target.id);

    const conversation = await prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { directKey: key },
        select: { id: true },
      });
      if (existing) return existing;

      return tx.conversation.create({
        data: {
          directKey: key,
          isGroup: false,
          participants: { create: [{ userId: req.user!.id }, { userId: target.id }] },
        },
        select: { id: true },
      });
    });

    if (message) {
      await assertNotRestricted(req.user!.id);
      await moderateMessage(req.user!.id, message);

      const now = new Date();
      const row = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: req.user!.id,
          body: message,
          deliveredAt: onlineUserIds().has(target.id) ? now : null,
        },
        select: {
          id: true,
          body: true,
          senderId: true,
          createdAt: true,
          deliveredAt: true,
          sender: { select: senderSelect },
        },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });

      emitToConversation(conversation.id, 'message:new', {
        conversationId: conversation.id,
        message: {
          id: row.id,
          body: row.body,
          removed: false,
          deleted: false,
          fromMe: false,
          senderId: row.senderId,
          sender: shapeSender(row.sender),
          attachment: null,
          createdAt: row.createdAt,
          deliveredAt: row.deliveredAt,
          readAt: null,
        },
      });
      await createNotification(
        {
          userId: target.id,
          type: 'MESSAGE',
          title: `New message from @${req.user!.username}`,
          body: message.length > 120 ? `${message.slice(0, 120)}…` : message,
          link: `/messages/${conversation.id}`,
          metadata: { conversationId: conversation.id },
        },
        emitToUser,
      );
    }

    return created(res, { conversationId: conversation.id });
  }),
);

/** GET /api/messages/conversations — the member's conversation list. */
messagingRouter.get(
  '/conversations',
  validateQuery(z.object({ search: z.string().trim().max(60).optional() })),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { search?: string };

    const participants = await prisma.conversationParticipant.findMany({
      where: { userId: req.user!.id, conversation: { messages: { some: {} } } },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
      select: {
        lastReadAt: true,
        muted: true,
        conversation: {
          select: {
            id: true,
            isGroup: true,
            title: true,
            lastMessageAt: true,
            exchangeId: true,
            participants: {
              where: { userId: { not: req.user!.id } },
              select: {
                userId: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    lastSeenAt: true,
                    profile: { select: { displayName: true, avatarUrl: true } },
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                body: true,
                createdAt: true,
                senderId: true,
                hiddenAt: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    const filtered = query.search
      ? participants.filter((p) =>
          p.conversation.participants.some((other) =>
            `${other.user.username} ${other.user.profile?.displayName ?? ''}`
              .toLowerCase()
              .includes(query.search!.toLowerCase()),
          ),
        )
      : participants;

    const unreadCounts = await Promise.all(
      filtered.map((p) =>
        prisma.message.count({
          where: {
            conversationId: p.conversation.id,
            senderId: { not: req.user!.id },
            hiddenAt: null,
            deletedAt: null,
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    );

    return ok(
      res,
      filtered.map((p, index) => {
        const other = p.conversation.participants[0];
        const last = p.conversation.messages[0];
        const preview = !last
          ? null
          : last.hiddenAt
            ? 'This message was removed by a moderator.'
            : last.deletedAt
              ? 'This message was deleted.'
              : last.body;
        return {
          id: p.conversation.id,
          isGroup: p.conversation.isGroup,
          title: p.conversation.isGroup
            ? p.conversation.title
            : (other?.user.profile?.displayName ?? other?.user.username ?? 'Conversation'),
          otherUser: other ? shapePeer(other.user) : null,
          lastMessage: last
            ? {
                id: last.id,
                preview: (preview ?? '').slice(0, 160),
                createdAt: last.createdAt,
                fromMe: last.senderId === req.user!.id,
              }
            : null,
          lastMessageAt: p.conversation.lastMessageAt,
          unreadCount: unreadCounts[index] ?? 0,
          muted: p.muted,
          exchangeId: p.conversation.exchangeId,
        };
      }),
    );
  }),
);

/**
 * GET /api/messages/conversations/:id — paginated message history.
 *
 * Pages count backwards from the newest message, so page 1 is the current
 * conversation and page 2 is older history ("load older messages"). Opening the
 * thread also marks it read and tells the other side.
 */
messagingRouter.get(
  '/conversations/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertConversationMember(id, req.user!.id);

    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 40, maxPageSize: 100 });

    const [total, rows, conversation] = await Promise.all([
      prisma.message.count({ where: { conversationId: id } }),
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          body: true,
          senderId: true,
          attachmentUrl: true,
          attachmentName: true,
          attachmentType: true,
          hiddenAt: true,
          deletedAt: true,
          deliveredAt: true,
          readAt: true,
          createdAt: true,
          sender: { select: senderSelect },
        },
      }),
      prisma.conversation.findUnique({
        where: { id },
        select: {
          participants: {
            where: { userId: { not: req.user!.id } },
            select: {
              user: {
                select: {
                  id: true,
                  username: true,
                  lastSeenAt: true,
                  profile: { select: { displayName: true, avatarUrl: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // Opening a conversation reads it. Every message is stamped, not just the
    // page, so the sender's ticks stay correct after they scroll back.
    const readAt = new Date();
    await prisma.$transaction([
      prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
        data: { lastReadAt: readAt },
      }),
      prisma.message.updateMany({
        where: { conversationId: id, senderId: { not: req.user!.id }, readAt: null, deletedAt: null },
        data: { readAt, deliveredAt: readAt },
      }),
    ]);
    emitToConversation(id, 'conversation:read', {
      conversationId: id,
      readerId: req.user!.id,
      readAt: readAt.toISOString(),
    });

    const other = conversation?.participants[0]?.user;

    // The peer travels in `meta` so the message list stays a plain array for
    // the client's infinite query, which pages by array.
    return paginated(
      res,
      rows.reverse().map((m) => ({
        id: m.id,
        body: m.hiddenAt || m.deletedAt ? null : m.body,
        removed: Boolean(m.hiddenAt),
        deleted: Boolean(m.deletedAt),
        fromMe: m.senderId === req.user!.id,
        senderId: m.senderId,
        sender: shapeSender(m.sender),
        attachment:
          m.attachmentUrl && !m.deletedAt
            ? { url: mediaUrlFor(m.attachmentUrl), name: m.attachmentName, type: m.attachmentType }
            : null,
        createdAt: m.createdAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
      })),
      total,
      page,
      pageSize,
      { otherUser: other ? shapePeer(other) : null },
    );
  }),
);

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(4000),
});

/** POST /api/messages/conversations/:id — send a message. */
messagingRouter.post(
  '/conversations/:id',
  messageLimiter,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { body } = req.body as z.infer<typeof sendMessageSchema>;

    const participant = await assertConversationMember(id, req.user!.id);
    if (participant.blocked) throw ApiError.forbidden('You have blocked this conversation.');

    await assertNotRestricted(req.user!.id);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        participants: {
          where: { userId: { not: req.user!.id } },
          select: { userId: true, blocked: true },
        },
      },
    });

    for (const other of conversation?.participants ?? []) {
      if (other.blocked) throw ApiError.forbidden('That member has blocked this conversation.');
    }
    await assertNoBlock(
      req.user!.id,
      (conversation?.participants ?? []).map((p) => p.userId),
    );

    const notice = await moderateMessage(req.user!.id, body);

    const online = onlineUserIds();
    const now = new Date();
    const recipients = conversation?.participants ?? [];
    // "Delivered" means it reached an account that is connected right now.
    const deliveredAt = recipients.some((r) => online.has(r.userId)) ? now : null;

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: req.user!.id, body, deliveredAt },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        deliveredAt: true,
        sender: { select: senderSelect },
      },
    });

    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: now } });

    const payload = {
      id: message.id,
      body: message.body,
      removed: false,
      deleted: false,
      fromMe: false,
      senderId: message.senderId,
      sender: shapeSender(message.sender),
      attachment: null,
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      readAt: null,
    };
    emitToConversation(id, 'message:new', { conversationId: id, message: payload });

    for (const other of recipients) {
      await createNotification(
        {
          userId: other.userId,
          type: 'MESSAGE',
          title: `New message from @${req.user!.username}`,
          body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          link: `/messages/${id}`,
          metadata: { conversationId: id },
        },
        emitToUser,
      );
    }

    return created(res, { ...payload, ...(notice ? { moderationNotice: notice } : {}) });
  }),
);

/** POST /api/messages/conversations/:id/attachment — multipart file message. */
messagingRouter.post(
  '/conversations/:id/attachment',
  messageLimiter,
  validateParams(z.object({ id: uuidSchema })),
  uploadAttachment.single('file'),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const participant = await assertConversationMember(id, req.user!.id);
    if (participant.blocked) throw ApiError.forbidden('You have blocked this conversation.');
    if (!req.file) throw ApiError.badRequest('Choose a file to send.');

    await assertNotRestricted(req.user!.id);

    const stored = await storeFile(req.file, 'attachments', req.user!.id);
    const online = onlineUserIds();
    const now = new Date();

    const recipients = await prisma.conversationParticipant.findMany({
      where: { conversationId: id, userId: { not: req.user!.id } },
      select: { userId: true },
    });
    await assertNoBlock(req.user!.id, recipients.map((r) => r.userId));
    const deliveredAt = recipients.some((r) => online.has(r.userId)) ? now : null;

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: req.user!.id,
        body: String(req.body?.caption ?? '').slice(0, 4000) || `Shared ${stored.name}`,
        attachmentUrl: stored.key,
        attachmentName: stored.name,
        attachmentType: stored.mimeType,
        deliveredAt,
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
        createdAt: true,
        deliveredAt: true,
        sender: { select: senderSelect },
      },
    });

    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: now } });

    const payload = {
      id: message.id,
      body: message.body,
      removed: false,
      deleted: false,
      fromMe: false,
      senderId: message.senderId,
      sender: shapeSender(message.sender),
      attachment: {
        url: mediaUrlFor(message.attachmentUrl),
        name: message.attachmentName,
        type: message.attachmentType,
      },
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      readAt: null,
    };
    emitToConversation(id, 'message:new', { conversationId: id, message: payload });

    for (const other of recipients) {
      await createNotification(
        {
          userId: other.userId,
          type: 'MESSAGE',
          title: `New message from @${req.user!.username}`,
          body: `Shared ${stored.name}`,
          link: `/messages/${id}`,
          metadata: { conversationId: id },
        },
        emitToUser,
      );
    }

    return created(res, payload);
  }),
);

/** POST /api/messages/conversations/:id/read — explicit read receipt. */
messagingRouter.post(
  '/conversations/:id/read',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertConversationMember(id, req.user!.id);

    const readAt = new Date();
    await prisma.$transaction([
      prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
        data: { lastReadAt: readAt },
      }),
      prisma.message.updateMany({
        where: { conversationId: id, senderId: { not: req.user!.id }, readAt: null, deletedAt: null },
        data: { readAt, deliveredAt: readAt },
      }),
    ]);
    emitToConversation(id, 'conversation:read', {
      conversationId: id,
      readerId: req.user!.id,
      readAt: readAt.toISOString(),
    });
    return ok(res, { read: true });
  }),
);

/** POST /api/messages/conversations/:id/mute */
messagingRouter.post(
  '/conversations/:id/mute',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ muted: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { muted } = req.body as { muted: boolean };
    await assertConversationMember(id, req.user!.id);
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
      data: { muted },
    });
    return ok(res, { muted });
  }),
);

/**
 * DELETE /api/messages/messages/:id — the sender deletes their own message.
 * The row is kept as a tombstone so the other side's history does not shift.
 */
messagingRouter.delete(
  '/messages/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const message = await prisma.message.findUnique({
      where: { id },
      select: { id: true, senderId: true, conversationId: true, deletedAt: true },
    });
    // Only the sender may delete, and anyone else gets the same 404 as a message
    // that does not exist, so ids cannot be probed.
    if (!message || message.senderId !== req.user!.id) {
      throw ApiError.notFound('That message could not be found.');
    }

    if (!message.deletedAt) {
      await prisma.message.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    }

    emitToConversation(message.conversationId, 'message:deleted', {
      conversationId: message.conversationId,
      messageId: id,
    });
    return noContent(res);
  }),
);

/** DELETE /api/messages/conversations/:id — leave a conversation. */
messagingRouter.delete(
  '/conversations/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertConversationMember(id, req.user!.id);
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
    });
    return noContent(res);
  }),
);

/** GET /api/messages/unread-count — badge count for the navigation. */
messagingRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId: req.user!.id, muted: false },
      select: { conversationId: true, lastReadAt: true },
    });

    const counts = await Promise.all(
      participants.map((p) =>
        prisma.message.count({
          where: {
            conversationId: p.conversationId,
            senderId: { not: req.user!.id },
            hiddenAt: null,
            deletedAt: null,
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    );

    return ok(res, { unread: counts.reduce((total, n) => total + n, 0) });
  }),
);

/** POST /api/messages/users/:username/block — stop someone contacting you. */
messagingRouter.post(
  '/users/:username/block',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  validateBody(z.object({ reason: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const { reason } = req.body as { reason?: string };

    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');
    if (target.id === req.user!.id) throw ApiError.badRequest('You cannot block yourself.');

    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: target.id } },
      create: { blockerId: req.user!.id, blockedId: target.id, reason: reason ?? null },
      update: { reason: reason ?? null },
    });

    return ok(res, { blocked: true });
  }),
);

/** DELETE /api/messages/users/:username/block — undo a block. */
messagingRouter.delete(
  '/users/:username/block',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw ApiError.notFound('That member could not be found.');

    await prisma.userBlock.deleteMany({ where: { blockerId: req.user!.id, blockedId: target.id } });
    return noContent(res);
  }),
);

/** GET /api/messages/blocked — the caller's block list, for settings. */
messagingRouter.get(
  '/blocked',
  asyncHandler(async (req, res) => {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.user!.id, ...REAL_BLOCK },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        blocked: {
          select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } },
        },
      },
    });

    return ok(
      res,
      blocks.map((b) => ({
        id: b.id,
        username: b.blocked.username,
        displayName: b.blocked.profile?.displayName ?? b.blocked.username,
        avatarUrl: b.blocked.profile?.avatarUrl ?? null,
        reason: b.reason,
        blockedAt: b.createdAt,
      })),
    );
  }),
);

/**
 * GET /api/messages/moderation — the caller's own moderation standing.
 *
 * Deliberately scoped to the caller: no member can read another member's
 * moderation history. Only the decision reason and dates are returned, never
 * the content that triggered them.
 */
messagingRouter.get(
  '/moderation',
  asyncHandler(async (req, res) => {
    const [restriction, events] = await Promise.all([
      activeRestriction(req.user!.id),
      prisma.moderationEvent.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, verdict: true, category: true, reason: true, surface: true, createdAt: true },
      }),
    ]);

    return ok(res, {
      restriction: restriction
        ? { reason: restriction.reason, expiresAt: restriction.expiresAt, active: true }
        : null,
      events,
      appealPath: '/contact',
    });
  }),
);
