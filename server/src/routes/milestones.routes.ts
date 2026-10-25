import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams } from '../lib/http';
import { created, noContent, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';

export const milestonesRouter = Router();

/** Members of an exchange may read and write its milestones and shared notes. */
async function assertExchangeMember(exchangeId: string, userId: string) {
  const participant = await prisma.exchangeParticipant.findUnique({
    where: { exchangeId_userId: { exchangeId, userId } },
    select: { id: true, exchange: { select: { id: true, status: true } } },
  });
  if (!participant) throw ApiError.forbidden('You are not part of this exchange.');
  return participant;
}

const milestoneSchema = z.object({
  title: z.string().trim().min(3, 'Give the milestone a title.').max(160),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  dueAt: z.coerce.date().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

milestonesRouter.post(
  '/exchanges/:exchangeId/milestones',
  requireAuth,
  requireVerified,
  validateParams(z.object({ exchangeId: uuidSchema })),
  validateBody(milestoneSchema),
  asyncHandler(async (req, res) => {
    const { exchangeId } = res.locals.params as { exchangeId: string };
    const { exchange } = await assertExchangeMember(exchangeId, req.user!.id);

    if (['COMPLETED', 'CANCELLED', 'DECLINED', 'WITHDRAWN'].includes(exchange.status)) {
      throw ApiError.conflict('This exchange is closed, so milestones can no longer be added.');
    }

    const body = req.body as z.infer<typeof milestoneSchema>;
    const milestone = await prisma.milestone.create({
      data: {
        exchangeId,
        authorId: req.user!.id,
        title: body.title,
        description: body.description || null,
        dueAt: body.dueAt ?? null,
        sortOrder: body.sortOrder,
      },
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
    });

    await prisma.exchangeEvent.create({
      data: {
        exchangeId,
        actorId: req.user!.id,
        type: 'milestone.created',
        summary: `Milestone "${body.title}" added`,
      },
    });

    return created(res, milestone);
  }),
);

const milestonePatchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

milestonesRouter.patch(
  '/milestones/:id',
  requireAuth,
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(milestonePatchSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const existing = await prisma.milestone.findUnique({
      where: { id },
      select: { id: true, exchangeId: true, title: true, status: true },
    });
    if (!existing) throw ApiError.notFound('That milestone could not be found.');
    await assertExchangeMember(existing.exchangeId, req.user!.id);

    const body = req.body as z.infer<typeof milestonePatchSchema>;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value === '' ? null : value;
    }
    if (body.status === 'DONE') data.completedAt = new Date();
    if (body.status && body.status !== 'DONE') data.completedAt = null;

    const milestone = await prisma.milestone.update({
      where: { id },
      data,
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
    });

    if (body.status && body.status !== existing.status) {
      await prisma.exchangeEvent.create({
        data: {
          exchangeId: existing.exchangeId,
          actorId: req.user!.id,
          type: 'milestone.updated',
          summary: `Milestone "${existing.title}" set to ${body.status.replace('_', ' ').toLowerCase()}`,
        },
      });
    }

    return ok(res, milestone);
  }),
);

milestonesRouter.delete(
  '/milestones/:id',
  requireAuth,
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const existing = await prisma.milestone.findUnique({
      where: { id },
      select: { id: true, exchangeId: true, authorId: true, title: true },
    });
    if (!existing) throw ApiError.notFound('That milestone could not be found.');
    const participant = await assertExchangeMember(existing.exchangeId, req.user!.id);

    // Authors may delete their own milestones; either participant may remove one
    // that is still pending, which keeps the shared plan tidy.
    if (existing.authorId !== req.user!.id && participant.exchange.status === 'COMPLETED') {
      throw ApiError.forbidden('You can only remove milestones you created once an exchange is complete.');
    }

    await prisma.milestone.delete({ where: { id } });
    return noContent(res);
  }),
);

// ---------------------------------------------------------------- shared notes

const noteSchema = z.object({
  body: z.string().trim().min(1, 'Write something before saving.').max(4000),
  resourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a full URL starting with http:// or https://')
    .optional()
    .or(z.literal('')),
});

milestonesRouter.get(
  '/exchanges/:exchangeId/notes',
  requireAuth,
  validateParams(z.object({ exchangeId: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { exchangeId } = res.locals.params as { exchangeId: string };
    await assertExchangeMember(exchangeId, req.user!.id);

    const notes = await prisma.exchangeNote.findMany({
      where: { exchangeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        body: true,
        resourceUrl: true,
        createdAt: true,
        authorId: true,
        author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });
    return ok(res, notes);
  }),
);

milestonesRouter.post(
  '/exchanges/:exchangeId/notes',
  requireAuth,
  requireVerified,
  validateParams(z.object({ exchangeId: uuidSchema })),
  validateBody(noteSchema),
  asyncHandler(async (req, res) => {
    const { exchangeId } = res.locals.params as { exchangeId: string };
    await assertExchangeMember(exchangeId, req.user!.id);

    const body = req.body as z.infer<typeof noteSchema>;
    const note = await prisma.exchangeNote.create({
      data: {
        exchangeId,
        authorId: req.user!.id,
        body: body.body,
        resourceUrl: body.resourceUrl || null,
      },
      select: {
        id: true,
        body: true,
        resourceUrl: true,
        createdAt: true,
        authorId: true,
        author: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });
    return created(res, note);
  }),
);

milestonesRouter.delete(
  '/notes/:id',
  requireAuth,
  requireVerified,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const note = await prisma.exchangeNote.findUnique({
      where: { id },
      select: { id: true, authorId: true, exchangeId: true },
    });
    if (!note) throw ApiError.notFound('That note could not be found.');
    await assertExchangeMember(note.exchangeId, req.user!.id);
    if (note.authorId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden('You can only delete notes you wrote.');
    }
    await prisma.exchangeNote.delete({ where: { id } });
    return noContent(res);
  }),
);
