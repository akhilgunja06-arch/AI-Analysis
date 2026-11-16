import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { env } from '../config/env';

export const aiRouter = Router();

aiRouter.use(requireAuth);

/**
 * AI conversation history.
 *
 * These endpoints persist a member's own AI conversation history. Reading and
 * writing is scoped to the authenticated owner on every request — a
 * conversation id from another account behaves as if it does not exist.
 *
 * Generating an assistant reply requires a configured model provider. When none
 * is configured the endpoint records the member's message and returns an
 * explicit 501 rather than inventing a reply or claiming a model answered.
 */

/** Confirms the conversation belongs to the caller, or throws a 404. */
async function assertOwnedConversation(conversationId: string, userId: string) {
  const conversation = await prisma.aiConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userId: true, title: true },
  });
  // Same response whether it is missing or simply not theirs.
  if (!conversation || conversation.userId !== userId) {
    throw ApiError.notFound('That conversation could not be found.');
  }
  return conversation;
}

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

/** GET /api/ai/conversations — the member's own conversations, paginated. */
aiRouter.get(
  '/conversations',
  validateQuery(
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(20),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { page: number; pageSize: number };
    const where = { userId: req.user!.id };

    const [total, rows] = await Promise.all([
      prisma.aiConversation.count({ where }),
      prisma.aiConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return paginated(
      res,
      rows.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }),
);

/** POST /api/ai/conversations — start a new conversation. */
aiRouter.post(
  '/conversations',
  validateBody(createConversationSchema),
  asyncHandler(async (req, res) => {
    const { title } = req.body as z.infer<typeof createConversationSchema>;
    const conversation = await prisma.aiConversation.create({
      data: { userId: req.user!.id, ...(title ? { title } : {}) },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return created(res, { ...conversation, messageCount: 0 });
  }),
);

/** GET /api/ai/conversations/:id — the messages of an owned conversation. */
aiRouter.get(
  '/conversations/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const conversation = await assertOwnedConversation(id, req.user!.id);

    const messages = await prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return ok(res, { ...conversation, messages });
  }),
);

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Write a message first.').max(8000),
});

/**
 * POST /api/ai/conversations/:id/messages — append the member's message and,
 * when a provider is configured, an assistant reply.
 */
aiRouter.post(
  '/conversations/:id/messages',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { content } = req.body as z.infer<typeof sendMessageSchema>;
    await assertOwnedConversation(id, req.user!.id);

    const userMessage = await prisma.aiMessage.create({
      data: { conversationId: id, userId: req.user!.id, role: 'USER', content },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    // First user message becomes the conversation title, if still the default.
    const conversation = await prisma.aiConversation.findUnique({
      where: { id },
      select: { title: true, _count: { select: { messages: true } } },
    });
    if (conversation && conversation.title === 'New conversation' && conversation._count.messages === 1) {
      await prisma.aiConversation.update({
        where: { id },
        data: { title: content.slice(0, 80) },
      });
    } else {
      await prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } });
    }

    if (!env.aiEnabled) {
      // The member's message is stored; no assistant reply is fabricated.
      throw new ApiError(
        501,
        'AI_NOT_CONFIGURED',
        'The assistant is not configured on this deployment. Your message was saved, but no reply was generated.',
        { requiredEnv: ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'], savedMessageId: userMessage.id },
      );
    }

    throw new ApiError(
      501,
      'AI_NOT_IMPLEMENTED',
      'A model provider is configured but this build does not yet call it. Your message was saved.',
      { provider: env.AI_PROVIDER, savedMessageId: userMessage.id },
    );
  }),
);

/** DELETE /api/ai/conversations/:id — removes an owned conversation. */
aiRouter.delete(
  '/conversations/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertOwnedConversation(id, req.user!.id);
    await prisma.aiConversation.delete({ where: { id } });
    return noContent(res);
  }),
);
