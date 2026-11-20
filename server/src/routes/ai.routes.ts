import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { env } from '../config/env';
import { completeChat, probeProvider, type ChatTurn } from '../services/groq.service';
import { reviewText } from '../services/moderation.service';
import { enforceModeration } from '../services/enforcement.service';
import { aiLimiter, writeLimiter } from '../middleware/errors';
import { logger } from '../lib/logger';

export const aiRouter = Router();

aiRouter.use(requireAuth);

/**
 * AI conversation history.
 *
 * These endpoints persist a member's own AI conversation history. Reading and
 * writing is scoped to the authenticated owner on every request — a
 * conversation id from another account behaves as if it does not exist.
 *
 * Generating an assistant reply requires AI_API_KEY. When it is missing the
 * endpoint records the member's message and returns an explicit 501 rather than
 * inventing a reply or claiming a model answered.
 */

/** How many prior turns are replayed to the model for continuity. */
const HISTORY_TURNS = 20;

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
  requireAuth,
  writeLimiter,
  aiLimiter,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(sendMessageSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { content } = req.body as z.infer<typeof sendMessageSchema>;
    await assertOwnedConversation(id, req.user!.id);

    // The assistant is study-only for the same reason peer chat is. A prompt
    // that would be blocked in a conversation is blocked here too.
    const decision = await reviewText({
      userId: req.user!.id,
      text: content,
      surface: 'AI_PROMPT',
    });
    if (decision.verdict === 'BLOCK') {
      await enforceModeration(req.user!.id, decision);
      throw new ApiError(422, 'AI_PROMPT_BLOCKED', decision.reason, {
        category: decision.category,
        severity: decision.severity,
      });
    }

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
        'The AI Study Assistant is not configured on this deployment. Your message was saved, but no reply was generated.',
        { requiredEnv: ['AI_API_KEY', 'AI_MODEL'], savedMessageId: userMessage.id },
      );
    }

    // Replay the recent thread so the model has context, oldest first.
    const priorMessages = await prisma.aiMessage.findMany({
      where: { conversationId: id, id: { not: userMessage.id } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    });

    const turns: ChatTurn[] = [
      ...priorMessages.reverse().map((m) => ({
        role: (m.role === 'ASSISTANT' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
      { role: 'user', content },
    ];

    let completion;
    try {
      completion = await completeChat(turns);
    } catch (err) {
      // The member's message is already saved, so a provider failure never
      // loses their question — the client can retry against the same thread.
      logger.warn('ai.completion_failed', { conversationId: id, err });
      throw err;
    }

    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: id,
        userId: req.user!.id,
        role: 'ASSISTANT',
        content: completion.content,
      },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    await prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } });

    return created(res, {
      userMessage,
      assistantMessage,
      model: completion.model,
      usage: completion.usage ?? null,
      finishReason: completion.finishReason,
      ...(decision.verdict === 'WARN' ? { notice: decision.reason } : {}),
    });
  }),
);

/** POST /api/ai/conversations/:id/retry — regenerate the last assistant reply. */
aiRouter.post(
  '/conversations/:id/retry',
  requireAuth,
  writeLimiter,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await assertOwnedConversation(id, req.user!.id);

    if (!env.aiEnabled) {
      throw new ApiError(501, 'AI_NOT_CONFIGURED', 'The AI Study Assistant is not configured on this deployment.', {
        requiredEnv: ['AI_API_KEY', 'AI_MODEL'],
      });
    }

    const history = await prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TURNS + 1,
      select: { id: true, role: true, content: true },
    });
    history.reverse();

    // Drop a trailing assistant reply; the retry replaces it.
    const last = history[history.length - 1];
    if (last?.role === 'ASSISTANT') {
      await prisma.aiMessage.delete({ where: { id: last.id } });
      history.pop();
    }
    if (history.length === 0) {
      throw ApiError.badRequest('There is no question to retry yet.');
    }

    const completion = await completeChat(
      history.map((m) => ({
        role: (m.role === 'ASSISTANT' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    );

    const assistantMessage = await prisma.aiMessage.create({
      data: { conversationId: id, userId: req.user!.id, role: 'ASSISTANT', content: completion.content },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    await prisma.aiConversation.update({ where: { id }, data: { updatedAt: new Date() } });

    return created(res, {
      assistantMessage,
      model: completion.model,
      usage: completion.usage ?? null,
      finishReason: completion.finishReason,
    });
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

/**
 * GET /api/ai/connection — proves the provider actually answers.
 *
 * `GET /api/support/status` only reports that a key exists; it cannot tell an
 * operator whether that key works, whether the model name is valid, or whether
 * the account is rate limited. This endpoint makes one real, minimal call and
 * reports the outcome. It never returns the key, and it caches nothing so a
 * fixed key is picked up on the next request.
 */
aiRouter.get(
  '/connection',
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();

    if (!env.aiEnabled) {
      return ok(res, {
        provider: env.aiProvider,
        requestedProvider: env.aiProviderRequested,
        providerSupported: !env.aiProviderUnsupported,
        model: null,
        ok: false,
        code: 'AI_NOT_CONFIGURED',
        message: env.aiProviderUnsupported
          ? `AI_PROVIDER="${env.aiProviderRequested}" is not supported. Set AI_PROVIDER=groq.`
          : 'Set AI_API_KEY on the server to enable the assistant.',
        requiredEnv: env.aiProviderUnsupported ? ['AI_PROVIDER', 'AI_API_KEY'] : ['AI_API_KEY'],
        latencyMs: null,
      });
    }

    const result = await probeProvider();
    return ok(res, {
      provider: env.aiProvider,
      requestedProvider: env.aiProviderRequested,
      providerSupported: true,
      model: env.groqModel,
      ok: result.ok,
      code: result.ok ? null : result.detail ?? 'AI_UPSTREAM_ERROR',
      message: result.ok
        ? 'The assistant answered a live request.'
        : 'The assistant could not answer. Check the server logs for the upstream status.',
      latencyMs: result.ok ? Date.now() - startedAt : null,
    });
  }),
);
