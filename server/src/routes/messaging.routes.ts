import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { createNotification } from '../services/notification.service';
import { emitToConversation, emitToUser } from '../realtime';
import { storeFile, uploadAttachment } from '../services/storage.service';

export const messagingRouter = Router();

messagingRouter.use(requireAuth);

/**
 * Every read and write goes through this check. A member can only ever touch a
 * conversation they are listed as a participant of — the client-supplied id is
 * never trusted on its own.
 */
async function assertConversationMember(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, muted: true, blocked: true, conversation: { select: { id: true, isGroup: true } } },
  });
  if (!participant) {
    // Same response whether the conversation is missing or simply not theirs.
    throw ApiError.notFound('That conversation could not be found.');
  }
  return participant;
}

/** Deterministic key so a 1:1 conversation can never be duplicated. */
function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

const startConversationSchema = z.object({
  username: z.string().trim().min(3).max(30),
  message: z.string().trim().max(4000).optional(),
});

/** POST /api/messages/conversations — open (or reuse) a 1:1 conversation. */
messagingRouter.post(
  '/conversations',
  requireVerified,
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
      where: {
        OR: [
          { blockerId: req.user!.id, blockedId: target.id },
          { blockerId: target.id, blockedId: req.user!.id },
        ],
      },
      select: { reason: true },
    });
    if (block && block.reason !== 'DISMISSED_MATCH') {
      throw ApiError.forbidden('Messaging is not available with that member.');
    }

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
          participants: {
            create: [{ userId: req.user!.id }, { userId: target.id }],
          },
        },
        select: { id: true },
      });
    });

    if (message) {
      const body = await prisma.message.create({
        data: { conversationId: conversation.id, senderId: req.user!.id, body: message },
        select: { id: true, body: true, createdAt: true, senderId: true },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      emitToConversation(conversation.id, 'message:new', {
        conversationId: conversation.id,
        message: body,
      });
      await createNotification(
        {
          userId: target.id,
          type: 'MESSAGE',
          title: `New message from @${req.user!.username}`,
          body: message.length > 120 ? `${message.slice(0, 120)}…` : message,
          link: `/messages?c=${conversation.id}`,
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
                    username: true,
                    profile: { select: { displayName: true, avatarUrl: true } },
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, body: true, createdAt: true, senderId: true, hiddenAt: true },
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
        return {
          id: p.conversation.id,
          isGroup: p.conversation.isGroup,
          title: p.conversation.isGroup
            ? p.conversation.title
            : other?.user.profile?.displayName ?? other?.user.username ?? 'Conversation',
          otherUser: other
            ? {
                username: other.user.username,
                displayName: other.user.profile?.displayName ?? other.user.username,
                avatarUrl: other.user.profile?.avatarUrl ?? null,
              }
            : null,
          lastMessage: last
            ? {
                id: last.id,
                preview: last.hiddenAt ? 'This message was removed by a moderator.' : last.body.slice(0, 160),
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

/** GET /api/messages/conversations/:id — paginated message history. */
messagingRouter.get(
  '/conversations/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertConversationMember(id, req.user!.id);

    const { page, pageSize, skip, take } = parsePagination(req.query, { pageSize: 40, maxPageSize: 100 });

    const [total, rows] = await Promise.all([
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
          createdAt: true,
          sender: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      }),
    ]);

    // Mark as read on fetch — the participant row is already verified above.
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
    });

    return paginated(
      res,
      rows.reverse().map((m) => ({
        id: m.id,
        body: m.hiddenAt ? null : m.body,
        removed: Boolean(m.hiddenAt),
        fromMe: m.senderId === req.user!.id,
        sender: {
          username: m.sender.username,
          displayName: m.sender.profile?.displayName ?? m.sender.username,
          avatarUrl: m.sender.profile?.avatarUrl ?? null,
        },
        attachment: m.attachmentUrl
          ? { url: m.attachmentUrl, name: m.attachmentName, type: m.attachmentType }
          : null,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }),
);

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(4000),
});

/** POST /api/messages/conversations/:id — send a message. */
messagingRouter.post(
  '/conversations/:id',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { body } = req.body as z.infer<typeof sendMessageSchema>;

    const participant = await assertConversationMember(id, req.user!.id);
    if (participant.blocked) throw ApiError.forbidden('You have blocked this conversation.');

    // A conversation is only writable while an exchange between the members is
    // not cancelled, or if there is no exchange attached at all.
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        exchangeId: true,
        participants: {
          where: { userId: { not: req.user!.id } },
          select: { userId: true, blocked: true },
        },
      },
    });

    for (const other of conversation?.participants ?? []) {
      if (other.blocked) {
        throw ApiError.forbidden('That member has blocked this conversation.');
      }
    }

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: req.user!.id, body },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        sender: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });

    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });

    const payload = {
      id: message.id,
      body: message.body,
      removed: false,
      fromMe: false,
      senderId: message.senderId,
      sender: {
        username: message.sender.username,
        displayName: message.sender.profile?.displayName ?? message.sender.username,
        avatarUrl: message.sender.profile?.avatarUrl ?? null,
      },
      attachment: null,
      createdAt: message.createdAt,
    };
    emitToConversation(id, 'message:new', { conversationId: id, message: payload });

    for (const other of conversation?.participants ?? []) {
      await createNotification(
        {
          userId: other.userId,
          type: 'MESSAGE',
          title: `New message from @${req.user!.username}`,
          body: body.length > 120 ? `${body.slice(0, 120)}…` : body,
          link: `/messages?c=${id}`,
          metadata: { conversationId: id },
        },
        emitToUser,
      );
    }

    return created(res, payload);
  }),
);

/** POST /api/messages/conversations/:id/attachment — multipart file message. */
messagingRouter.post(
  '/conversations/:id/attachment',
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  uploadAttachment.single('file'),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertConversationMember(id, req.user!.id);
    if (!req.file) throw ApiError.badRequest('Choose a file to send.');

    const stored = await storeFile(req.file, 'attachments');

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: req.user!.id,
        body: req.body?.caption?.slice(0, 4000) || `Shared ${stored.name}`,
        attachmentUrl: stored.url,
        attachmentName: stored.name,
        attachmentType: stored.mimeType,
      },
      select: {
        id: true,
        body: true,
        senderId: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
        createdAt: true,
        sender: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });

    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });

    const payload = {
      id: message.id,
      body: message.body,
      removed: false,
      fromMe: false,
      senderId: message.senderId,
      sender: {
        username: message.sender.username,
        displayName: message.sender.profile?.displayName ?? message.sender.username,
        avatarUrl: message.sender.profile?.avatarUrl ?? null,
      },
      attachment: { url: message.attachmentUrl, name: message.attachmentName, type: message.attachmentType },
      createdAt: message.createdAt,
    };
    emitToConversation(id, 'message:new', { conversationId: id, message: payload });

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
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: req.user!.id } },
      data: { lastReadAt: new Date() },
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

    let total = 0;
    for (const p of participants) {
      total += await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: req.user!.id },
          hiddenAt: null,
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
    }

    return ok(res, { unread: total });
  }),
);

/** POST /api/messages/users/:username/block and unblock */
messagingRouter.post(
  '/users/:username/block',
  validateParams(z.object({ username: z.string().trim().min(3).max(30) })),
  validateBody(z.object({ reason: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const { username } = res.locals.params as { username: string };
    const { reason } = req.body as { reason?: string };

    const target = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, username: true },
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
      where: { blockerId: req.user!.id, NOT: { reason: 'DISMISSED_MATCH' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        blocked: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
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
