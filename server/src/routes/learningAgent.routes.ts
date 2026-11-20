import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateQuery } from '../lib/http';
import { ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/errors';
import { blockedPartnerIds } from '../lib/blockFilters';
import { env } from '../config/env';
import { analyseSkill, skillChat, type SkillChatMessage } from '../services/skillAnalysis.service';
import { findResources } from '../services/resource.service';
import { reviewText } from '../services/moderation.service';
import { enforceModeration } from '../services/enforcement.service';
import { onlineUserIds } from '../realtime';

export const learningAgentRouter = Router();

learningAgentRouter.use(requireAuth);

/** Prior chat turns replayed for continuity, matching the study assistant. */
const CHAT_HISTORY_TURNS = 12;

const skillNameSchema = z.string().trim().min(2).max(80);

/**
 * POST /api/learning-agent/analyse — a structured guide for one skill.
 *
 * The AI call is the expensive part, so the endpoint is write-limited. The
 * response separates the generated guide from the resource list: resources can
 * be unavailable without the guide being wrong, and the client labels each
 * part accordingly.
 */
learningAgentRouter.post(
  '/analyse',
  writeLimiter,
  validateBody(
    z.object({
      skill: skillNameSchema,
      language: z.enum(['en', 'te']).default('en'),
      /** Skip the model call when the client already holds a fresh guide. */
      includeResources: z.boolean().default(true),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { skill, language, includeResources } = req.body as {
      skill: string;
      language: 'en' | 'te';
      includeResources: boolean;
    };

    if (!env.aiEnabled) {
      throw new ApiError(
        501,
        'AI_NOT_CONFIGURED',
        'The Skill Learning Agent needs an AI provider. Ask an administrator to set AI_API_KEY.',
        { requiredEnv: env.aiMissingEnv.length ? env.aiMissingEnv : ['AI_API_KEY', 'AI_MODEL'] },
      );
    }

    const [analysis, resources] = await Promise.all([
      analyseSkill(skill, language),
      includeResources ? findResources(skill) : Promise.resolve(null),
    ]);

    return ok(res, {
      analysis,
      resources: resources?.resources ?? [],
      resourceSource: resources?.source ?? 'none',
      resourceNotice: resources?.notice ?? null,
      model: env.groqModel,
    });
  }),
);

/**
 * GET /api/learning-agent/resources — resources without generating a guide.
 */
learningAgentRouter.get(
  '/resources',
  validateQuery(z.object({ skill: skillNameSchema })),
  asyncHandler(async (req, res) => {
    const { skill } = res.locals.query as { skill: string };
    const result = await findResources(skill);
    return ok(res, result);
  }),
);

/**
 * GET /api/learning-agent/mentors — real members who teach or want this skill.
 *
 * Matching is a case-insensitive comparison on the stored skill name. Nothing
 * is synthesised: an empty list means nobody on the platform has listed that
 * skill yet, which the client states plainly.
 */
learningAgentRouter.get(
  '/mentors',
  validateQuery(
    z.object({
      skill: skillNameSchema,
      limit: z.coerce.number().int().positive().max(24).default(8),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { skill, limit } = res.locals.query as { skill: string; limit: number };
    const callerId = req.user!.id;

    const excluded = await blockedPartnerIds(prisma, callerId);
    excluded.add(callerId);

    const rows = await prisma.userSkill.findMany({
      where: {
        isActive: true,
        skill: { name: { equals: skill, mode: 'insensitive' } },
        user: {
          status: 'ACTIVE',
          id: { notIn: [...excluded] },
          OR: [{ preference: null }, { preference: { publicProfile: true } }],
        },
      },
      select: {
        direction: true,
        level: true,
        user: {
          select: {
            id: true,
            username: true,
            lastSeenAt: true,
            profile: { select: { displayName: true, avatarUrl: true, headline: true } },
            location: { select: { city: true, region: true, country: true, sharingEnabled: true } },
            skills: {
              where: { isActive: true, direction: 'TEACH' },
              take: 4,
              select: { level: true, skill: { select: { name: true, slug: true } } },
            },
          },
        },
      },
      take: limit * 4,
    });

    // A member can appear twice (teaches and wants); prefer the "teaches" row.
    const byUser = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byUser.get(row.user.id);
      if (!existing || (existing.direction === 'LEARN' && row.direction === 'TEACH')) {
        byUser.set(row.user.id, row);
      }
    }

    const mentors = [...byUser.values()]
      .sort((a, b) => {
        // Teachers first, then by recency of activity.
        if (a.direction !== b.direction) return a.direction === 'TEACH' ? -1 : 1;
        return (b.user.lastSeenAt?.getTime() ?? 0) - (a.user.lastSeenAt?.getTime() ?? 0);
      })
      .slice(0, limit)
      .map((row) => ({
        id: row.user.id,
        username: row.user.username,
        displayName: row.user.profile?.displayName ?? row.user.username,
        avatarUrl: row.user.profile?.avatarUrl ?? null,
        headline: row.user.profile?.headline ?? null,
        direction: row.direction,
        level: row.level,
        teaches: row.user.skills.map((s) => ({ name: s.skill.name, slug: s.skill.slug, level: s.level })),
        // City only, and only when the member chose to share a location.
        place:
          row.user.location?.sharingEnabled
            ? [row.user.location.city, row.user.location.region, row.user.location.country]
                .filter(Boolean)
                .join(', ') || null
            : null,
        online: onlineUserIds().has(row.user.id),
        lastSeenAt: row.user.lastSeenAt?.toISOString() ?? null,
      }));

    return ok(res, {
      skill,
      mentors,
      notice: mentors.length
        ? null
        : `Nobody on SkillSpring has listed ${skill} yet. Try a related skill, or add it to your own skills.`,
    });
  }),
);

/**
 * GET /api/learning-agent/mutual-matches — two-way skill exchange candidates.
 *
 * A candidate is a real member where both directions hold at once:
 *   - they teach a skill the caller wants to learn, and
 *   - they want to learn a skill the caller teaches.
 * Only rows that satisfy both are returned, so the "why you match" text is
 * always backed by stored data.
 */
learningAgentRouter.get(
  '/mutual-matches',
  validateQuery(z.object({ limit: z.coerce.number().int().positive().max(24).default(10) })),
  asyncHandler(async (req, res) => {
    const { limit } = res.locals.query as { limit: number };
    const callerId = req.user!.id;

    const excluded = await blockedPartnerIds(prisma, callerId);
    excluded.add(callerId);

    const [mine, candidates] = await Promise.all([
      prisma.userSkill.findMany({
        where: { userId: callerId, isActive: true },
        select: { skillId: true, direction: true, level: true, skill: { select: { name: true } } },
      }),
      prisma.userSkill.findMany({
        where: {
          isActive: true,
          userId: { notIn: [...excluded] },
          user: {
            status: 'ACTIVE',
            OR: [{ preference: null }, { preference: { publicProfile: true } }],
          },
        },
        select: {
          userId: true,
          skillId: true,
          direction: true,
          level: true,
          skill: { select: { name: true, slug: true } },
          user: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarUrl: true, headline: true } },
              location: { select: { city: true, region: true, country: true, sharingEnabled: true } },
            },
          },
        },
      }),
    ]);

    const iTeach = new Map(mine.filter((s) => s.direction === 'TEACH').map((s) => [s.skillId, s]));
    const iWant = new Map(mine.filter((s) => s.direction === 'LEARN').map((s) => [s.skillId, s]));

    if (!iTeach.size || !iWant.size) {
      return ok(res, {
        matches: [],
        notice:
          'Add at least one skill you teach and one you want to learn, then mutual matches appear here.',
      });
    }

    type Bucket = {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      headline: string | null;
      place: string | null;
      theyTeach: { name: string; slug: string; level: string }[];
      theyWant: { name: string; slug: string; level: string }[];
    };
    const byUser = new Map<string, Bucket>();

    for (const row of candidates) {
      const teachesWhatIWant = row.direction === 'TEACH' && iWant.has(row.skillId);
      const wantsWhatITeach = row.direction === 'LEARN' && iTeach.has(row.skillId);
      if (!teachesWhatIWant && !wantsWhatITeach) continue;

      const bucket =
        byUser.get(row.userId) ??
        {
          userId: row.userId,
          username: row.user.username,
          displayName: row.user.profile?.displayName ?? row.user.username,
          avatarUrl: row.user.profile?.avatarUrl ?? null,
          headline: row.user.profile?.headline ?? null,
          place: row.user.location?.sharingEnabled
            ? [row.user.location.city, row.user.location.region, row.user.location.country]
                .filter(Boolean)
                .join(', ') || null
            : null,
          theyTeach: [],
          theyWant: [],
        };

      const entry = { name: row.skill.name, slug: row.skill.slug, level: row.level };
      if (teachesWhatIWant && !bucket.theyTeach.some((s) => s.slug === entry.slug)) {
        bucket.theyTeach.push(entry);
      }
      if (wantsWhatITeach && !bucket.theyWant.some((s) => s.slug === entry.slug)) {
        bucket.theyWant.push(entry);
      }
      byUser.set(row.userId, bucket);
    }

    const matches = [...byUser.values()]
      // Reciprocal only: both halves must be present.
      .filter((b) => b.theyTeach.length > 0 && b.theyWant.length > 0)
      .map((b) => ({
        ...b,
        why: `They teach ${b.theyTeach.map((s) => s.name).join(', ')}, which you want to learn, and they want to learn ${b.theyWant
          .map((s) => s.name)
          .join(', ')}, which you teach.`,
        // Levels are informational: a beginner and an advanced learner can still
        // trade, so this describes the pairing rather than filtering it.
        levelFit: b.theyTeach.some((t) => {
          const wanted = [...iWant.values()].find((s) => s.skill.name === t.name);
          return wanted ? wanted.level === t.level : false;
        })
          ? 'SAME_LEVEL'
          : 'DIFFERENT_LEVEL',
      }))
      .slice(0, limit);

    return ok(res, {
      matches,
      notice: matches.length
        ? null
        : 'No mutual exchanges found yet. Mutual matches need someone who teaches what you want and wants what you teach.',
    });
  }),
);

/**
 * POST /api/learning-agent/chat — learning chat scoped to one skill.
 *
 * Stateless by design: the client replays the thread, which keeps this endpoint
 * free of a second conversation store and lets the member keep context in the
 * page. Prompts pass the same moderation policy as every other surface.
 */
learningAgentRouter.post(
  '/chat',
  writeLimiter,
  validateBody(
    z.object({
      skill: skillNameSchema,
      language: z.enum(['en', 'te']).default('en'),
      messages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(4000),
          }),
        )
        .min(1)
        .max(40),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { skill, language, messages } = req.body as {
      skill: string;
      language: 'en' | 'te';
      messages: SkillChatMessage[];
    };

    const last = messages[messages.length - 1];
    if (last.role !== 'user') {
      throw ApiError.badRequest('The last message must come from you.');
    }

    const decision = await reviewText({
      userId: req.user!.id,
      text: last.content,
      surface: 'AI_PROMPT',
    });
    if (decision.verdict === 'BLOCK') {
      await enforceModeration(req.user!.id, decision);
      throw new ApiError(422, 'AI_PROMPT_BLOCKED', decision.reason, {
        category: decision.category,
        severity: decision.severity,
      });
    }

    if (!env.aiEnabled) {
      throw new ApiError(
        501,
        'AI_NOT_CONFIGURED',
        'The Skill Learning Agent needs an AI provider. Ask an administrator to set AI_API_KEY.',
        { requiredEnv: env.aiMissingEnv.length ? env.aiMissingEnv : ['AI_API_KEY', 'AI_MODEL'] },
      );
    }

    const reply = await skillChat({
      skill,
      language,
      history: messages.slice(-CHAT_HISTORY_TURNS),
    });

    return ok(res, {
      reply,
      model: env.groqModel,
      ...(decision.verdict === 'WARN' ? { notice: decision.reason } : {}),
    });
  }),
);

/** GET /api/learning-agent/status — what the agent can actually do here. */
learningAgentRouter.get(
  '/status',
  asyncHandler(async (_req, res) =>
    ok(res, {
      ai: { enabled: env.aiEnabled, provider: env.aiProvider, model: env.aiEnabled ? env.groqModel : null },
      resourceSearch: { enabled: env.searchEnabled, provider: env.searchEnabled ? 'tavily' : null },
      missingEnv: env.aiMissingEnv,
    }),
  ),
);
