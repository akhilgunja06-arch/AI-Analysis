import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateParams, validateQuery } from '../lib/http';
import { noContent, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireVerified } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import {
  MATCH_WEIGHTS,
  rankMatches,
  type MatchCandidate,
  type MatchSubject,
} from '../services/matching.service';

export const matchesRouter = Router();

matchesRouter.use(requireAuth);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  requireReciprocal: z.enum(['true', 'false']).default('false'),
  includeDismissed: z.enum(['true', 'false']).default('false'),
});

async function loadSubject(userId: string): Promise<MatchSubject> {
  const [user, skills, availability] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, profile: { select: { timezone: true, languages: true } } },
    }),
    prisma.userSkill.findMany({
      where: { userId, isActive: true },
      select: { skillId: true, direction: true, level: true, skill: { select: { name: true } } },
    }),
    prisma.availability.findMany({
      where: { userId },
      select: { weekday: true, startMinute: true, endMinute: true },
    }),
  ]);

  if (!user) throw ApiError.notFound('Account not found.');

  const toRef = (s: (typeof skills)[number]) => ({
    skillId: s.skillId,
    skillName: s.skill.name,
    level: s.level,
  });

  return {
    userId: user.id,
    teaches: skills.filter((s) => s.direction === 'TEACH').map(toRef),
    wants: skills.filter((s) => s.direction === 'LEARN').map(toRef),
    languages: user.profile?.languages ?? [],
    timezone: user.profile?.timezone ?? 'UTC',
    availability,
  };
}

/**
 * GET /api/matches — ranked, explainable recommendations.
 *
 * Scores come from `matching.service.ts`, which is deterministic arithmetic.
 * The response includes the component breakdown and a human-readable reason
 * list so the UI can explain every recommendation.
 */
matchesRouter.get(
  '/',
  validateQuery(querySchema),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof querySchema>;
    const subject = await loadSubject(req.user!.id);

    const dismissed = await prisma.userBlock.findMany({
      where: { blockerId: req.user!.id, reason: { startsWith: 'DISMISSED_MATCH' } },
      select: { blockedId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.blockedId));

    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: req.user!.id }, { blockedId: req.user!.id }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set<string>();
    for (const b of blocks) blockedIds.add(b.blockerId === req.user!.id ? b.blockedId : b.blockerId);
    blockedIds.add(req.user!.id);

    // Only consider members whose profile is public and who are not blocked.
    const candidates = await prisma.user.findMany({
      where: {
        id: { notIn: [...blockedIds] },
        status: 'ACTIVE',
        role: { not: 'ADMIN' },
        OR: [{ preference: null }, { preference: { publicProfile: true } }],
        skills: { some: { isActive: true } },
      },
      select: {
        id: true,
        username: true,
        profile: { select: { timezone: true, languages: true } },
        skills: {
          where: { isActive: true },
          select: { skillId: true, direction: true, level: true, skill: { select: { name: true } } },
        },
        availability: { select: { weekday: true, startMinute: true, endMinute: true } },
      },
      take: 400,
    });

    const ratings = await prisma.review.groupBy({
      by: ['subjectId'],
      where: { subjectId: { in: candidates.map((c) => c.id) }, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const ratingById = new Map(ratings.map((r) => [r.subjectId, r]));

    const matchCandidates: MatchCandidate[] = candidates.map((c) => {
      const rating = ratingById.get(c.id);
      return {
        userId: c.id,
        username: c.username,
        teaches: c.skills
          .filter((s) => s.direction === 'TEACH')
          .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
        wants: c.skills
          .filter((s) => s.direction === 'LEARN')
          .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
        languages: c.profile?.languages ?? [],
        timezone: c.profile?.timezone ?? 'UTC',
        availability: c.availability,
        averageRating: rating?._avg.rating ?? null,
        reviewCount: rating?._count._all ?? 0,
      };
    });

    let results = rankMatches(subject, matchCandidates);

    if (query.requireReciprocal === 'true') {
      results = results.filter(
        (r) => r.breakdown.skillTeachToLearn > 0 && r.breakdown.skillLearnToTeach > 0,
      );
    }
    if (query.minScore > 0) {
      results = results.filter((r) => r.score >= query.minScore);
    }
    if (query.includeDismissed !== 'true') {
      results = results.filter((r) => !dismissedIds.has(r.userId));
    }
    results = results.slice(0, query.limit);

    // Attach display data for the cards.
    const profiles = await prisma.profile.findMany({
      where: { userId: { in: results.map((r) => r.userId) } },
      select: {
        userId: true,
        displayName: true,
        avatarUrl: true,
        headline: true,
        location: true,
        timezone: true,
      },
    });
    const profileById = new Map(profiles.map((p) => [p.userId, p]));

    return ok(res, {
      matches: results.map((r) => ({
        ...r,
        profile: profileById.get(r.userId) ?? null,
        dismissed: dismissedIds.has(r.userId),
      })),
      criteria: {
        description:
          'Scores are deterministic. Each component is weighted and summed; there is no machine-learning model involved.',
        weights: MATCH_WEIGHTS,
        yourSkillCounts: { teaches: subject.teaches.length, wants: subject.wants.length },
      },
      counts: {
        candidatesEvaluated: matchCandidates.length,
        returned: results.length,
      },
    });
  }),
);

/** GET /api/matches/:userId — explain a single match in detail. */
matchesRouter.get(
  '/:userId',
  validateParams(z.object({ userId: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { userId } = res.locals.params as { userId: string };
    if (userId === req.user!.id) throw ApiError.badRequest('You cannot match with yourself.');

    const subject = await loadSubject(req.user!.id);

    const candidateRow = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        status: true,
        profile: { select: { displayName: true, avatarUrl: true, headline: true, timezone: true, languages: true } },
        skills: {
          where: { isActive: true },
          select: { skillId: true, direction: true, level: true, skill: { select: { name: true } } },
        },
        availability: { select: { weekday: true, startMinute: true, endMinute: true } },
      },
    });
    if (!candidateRow || candidateRow.status !== 'ACTIVE') {
      throw ApiError.notFound('That member could not be found.');
    }

    const rating = await prisma.review.aggregate({
      where: { subjectId: userId, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const candidate: MatchCandidate = {
      userId: candidateRow.id,
      username: candidateRow.username,
      teaches: candidateRow.skills
        .filter((s) => s.direction === 'TEACH')
        .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
      wants: candidateRow.skills
        .filter((s) => s.direction === 'LEARN')
        .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
      languages: candidateRow.profile?.languages ?? [],
      timezone: candidateRow.profile?.timezone ?? 'UTC',
      availability: candidateRow.availability,
      averageRating: rating._avg.rating ?? null,
      reviewCount: rating._count._all,
    };

    const results = rankMatches(subject, [candidate]);
    return ok(res, {
      match: { ...results[0], profile: candidateRow.profile },
      weights: MATCH_WEIGHTS,
    });
  }),
);

/**
 * POST /api/matches/:userId/dismiss — hides a recommendation for this member.
 * Stored as a UserBlock row with a namespaced reason so the directory listing
 * itself is unaffected (dismissing is not blocking).
 */
matchesRouter.post(
  '/:userId/dismiss',
  validateParams(z.object({ userId: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { userId } = res.locals.params as { userId: string };
    if (userId === req.user!.id) throw ApiError.badRequest('You cannot dismiss yourself.');

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw ApiError.notFound('That member could not be found.');

    await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: userId } },
      create: { blockerId: req.user!.id, blockedId: userId, reason: 'DISMISSED_MATCH' },
      update: { reason: 'DISMISSED_MATCH' },
    });

    return ok(res, { dismissed: true });
  }),
);

/** DELETE /api/matches/:userId/dismiss — restores a dismissed recommendation. */
matchesRouter.delete(
  '/:userId/dismiss',
  validateParams(z.object({ userId: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { userId } = res.locals.params as { userId: string };
    await prisma.userBlock.deleteMany({
      where: { blockerId: req.user!.id, blockedId: userId, reason: 'DISMISSED_MATCH' },
    });
    return noContent(res);
  }),
);

/**
 * Optional AI-assisted suggestions. Returns 501 unless AI_PROVIDER and an API
 * key are configured — the platform never pretends a model produced this text.
 */
matchesRouter.get(
  '/ai/suggestions',
  requireVerified,
  asyncHandler(async (_req, res) => {
    throw ApiError.notImplemented(
      'AI-assisted suggestions are not configured on this deployment. The deterministic matching engine on /api/matches remains fully available.',
      { requiredEnv: ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'] },
    );
  }),
);
