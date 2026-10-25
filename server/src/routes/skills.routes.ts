import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated, parsePagination } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth, requireModerator } from '../middleware/auth';
import { uuidSchema } from '../lib/validation';
import { recordAudit } from '../services/audit.service';

export const skillsRouter = Router();

/** Public: the skill taxonomy used by filters, chips and the explore page. */
skillsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.skillCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { skills: true } },
      },
    });

    // Live popularity: how many members currently teach in each category.
    const counts = await prisma.userSkill.groupBy({
      by: ['skillId'],
      where: { direction: 'TEACH', isActive: true },
      _count: { _all: true },
    });
    const skills = await prisma.skill.findMany({ select: { id: true, categoryId: true } });
    const teachersByCategory = new Map<string, number>();
    const skillToCategory = new Map(skills.map((s) => [s.id, s.categoryId]));
    for (const row of counts) {
      const categoryId = skillToCategory.get(row.skillId);
      if (!categoryId) continue;
      teachersByCategory.set(categoryId, (teachersByCategory.get(categoryId) ?? 0) + row._count._all);
    }

    return ok(
      res,
      categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        skillCount: c._count.skills,
        teacherCount: teachersByCategory.get(c.id) ?? 0,
      })),
    );
  }),
);

/** Public: search the taxonomy. Used by the skill pickers. */
skillsRouter.get(
  '/',
  validateQuery(
    z.object({
      search: z.string().trim().max(80).optional(),
      categoryId: uuidSchema.optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { search, categoryId, limit } = res.locals.query as {
      search?: string;
      categoryId?: string;
      limit: number;
    };

    const skills = await prisma.skill.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { userSkills: true } },
      },
    });

    return ok(
      res,
      skills.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
        memberCount: s._count.userSkills,
      })),
    );
  }),
);

/**
 * Trending skills, computed from real activity: how many members currently
 * teach or want each skill. Nothing here is invented.
 */
skillsRouter.get(
  '/trending',
  validateQuery(z.object({ limit: z.coerce.number().int().min(1).max(24).default(8) })),
  asyncHandler(async (req, res) => {
    const { limit } = res.locals.query as { limit: number };

    const grouped = await prisma.userSkill.groupBy({
      by: ['skillId'],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { skillId: 'desc' } },
      take: limit,
    });

    const skills = await prisma.skill.findMany({
      where: { id: { in: grouped.map((g) => g.skillId) } },
      select: { id: true, name: true, slug: true, category: { select: { name: true, slug: true } } },
    });
    const byId = new Map(skills.map((s) => [s.id, s]));

    const teachCounts = await prisma.userSkill.groupBy({
      by: ['skillId'],
      where: { skillId: { in: grouped.map((g) => g.skillId) }, direction: 'TEACH', isActive: true },
      _count: { _all: true },
    });
    const learnCounts = await prisma.userSkill.groupBy({
      by: ['skillId'],
      where: { skillId: { in: grouped.map((g) => g.skillId) }, direction: 'LEARN', isActive: true },
      _count: { _all: true },
    });
    const teachById = new Map(teachCounts.map((t) => [t.skillId, t._count._all]));
    const learnById = new Map(learnCounts.map((t) => [t.skillId, t._count._all]));

    return ok(
      res,
      grouped
        .map((g) => {
          const skill = byId.get(g.skillId);
          if (!skill) return null;
          return {
            id: skill.id,
            name: skill.name,
            slug: skill.slug,
            category: skill.category,
            teachers: teachById.get(g.skillId) ?? 0,
            learners: learnById.get(g.skillId) ?? 0,
            totalActivity: g._count._all,
          };
        })
        .filter(Boolean),
    );
  }),
);

// ------------------------------------------------- everything below needs auth

skillsRouter.use(requireAuth);

/** GET /api/skills/mine — the member's teach/learn lists for /my-skills. */
skillsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const skills = await prisma.userSkill.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ direction: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        direction: true,
        level: true,
        description: true,
        outcomes: true,
        portfolioUrl: true,
        yearsExperience: true,
        isActive: true,
        createdAt: true,
        skill: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return ok(res, {
      teaches: skills.filter((s) => s.direction === 'TEACH'),
      wants: skills.filter((s) => s.direction === 'LEARN'),
    });
  }),
);

const userSkillSchema = z.object({
  skillId: uuidSchema,
  direction: z.enum(['TEACH', 'LEARN']),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  outcomes: z.string().trim().max(1000).optional().or(z.literal('')),
  portfolioUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a full URL starting with http:// or https://')
    .optional()
    .or(z.literal('')),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  isActive: z.boolean().default(true),
});

/** POST /api/skills/mine — add a teachable skill or a learning goal. */
skillsRouter.post(
  '/mine',
  validateBody(userSkillSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof userSkillSchema>;

    const skill = await prisma.skill.findUnique({ where: { id: body.skillId }, select: { id: true, name: true } });
    if (!skill) throw ApiError.notFound('That skill does not exist in the taxonomy.');

    // Duplicate detection: one row per member/skill/direction (also a DB constraint).
    const duplicate = await prisma.userSkill.findUnique({
      where: {
        userId_skillId_direction: {
          userId: req.user!.id,
          skillId: body.skillId,
          direction: body.direction,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(409, 'DUPLICATE', `You have already added ${skill.name} as a skill to ${body.direction === 'TEACH' ? 'teach' : 'learn'}.`, {
        fields: ['skillId', 'direction'],
      });
    }

    if (body.direction === 'TEACH' && body.level === 'EXPERT' && !body.portfolioUrl && !body.description) {
      throw ApiError.unprocessable(
        'Claiming expert level requires a description or a portfolio link as evidence.',
        { issues: [{ path: 'portfolioUrl', message: 'Add evidence of your expertise.' }] },
      );
    }

    const record = await prisma.userSkill.create({
      data: {
        userId: req.user!.id,
        skillId: body.skillId,
        direction: body.direction,
        level: body.level,
        description: body.description || null,
        outcomes: body.outcomes || null,
        portfolioUrl: body.portfolioUrl || null,
        yearsExperience: body.yearsExperience ?? null,
        isActive: body.isActive,
      },
      select: {
        id: true,
        direction: true,
        level: true,
        description: true,
        outcomes: true,
        portfolioUrl: true,
        yearsExperience: true,
        isActive: true,
        skill: { select: { id: true, name: true, slug: true, category: { select: { name: true } } } },
      },
    });

    return created(res, record);
  }),
);

/** PATCH /api/skills/mine/:id — edit one of your own entries. */
skillsRouter.patch(
  '/mine/:id',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(userSkillSchema.partial().omit({ skillId: true, direction: true })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const existing = await prisma.userSkill.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw ApiError.notFound('That skill entry was not found.');
    if (existing.userId !== req.user!.id) throw ApiError.forbidden('You can only edit your own skills.');

    const body = req.body as Partial<z.infer<typeof userSkillSchema>>;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value === '' ? null : value;
    }
    if (Object.keys(data).length === 0) throw ApiError.badRequest('No changes were provided.');

    const updated = await prisma.userSkill.update({
      where: { id },
      data,
      select: {
        id: true,
        direction: true,
        level: true,
        description: true,
        outcomes: true,
        portfolioUrl: true,
        yearsExperience: true,
        isActive: true,
        skill: { select: { id: true, name: true, slug: true, category: { select: { name: true } } } },
      },
    });
    return ok(res, updated);
  }),
);

/** DELETE /api/skills/mine/:id */
skillsRouter.delete(
  '/mine/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const existing = await prisma.userSkill.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw ApiError.notFound('That skill entry was not found.');
    if (existing.userId !== req.user!.id) throw ApiError.forbidden('You can only remove your own skills.');

    await prisma.userSkill.delete({ where: { id } });
    return noContent(res);
  }),
);

// ------------------------------------------------------- moderator taxonomy

/** Staff-only taxonomy management lives under /api/admin, but skill creation is
 * exposed here for moderators because it is used by the same taxonomy screen. */
skillsRouter.post(
  '/',
  requireModerator,
  validateBody(
    z.object({
      name: z.string().trim().min(2).max(80),
      categoryId: uuidSchema,
      description: z.string().trim().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { name, categoryId, description } = req.body as {
      name: string;
      categoryId: string;
      description?: string;
    };

    const category = await prisma.skillCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw ApiError.notFound('That category does not exist.');

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await prisma.skill.findFirst({ where: { OR: [{ name }, { slug }] }, select: { id: true } });
    if (existing) throw ApiError.conflict('That skill already exists.');

    const skill = await prisma.skill.create({
      data: { name, slug, description, categoryId },
      select: { id: true, name: true, slug: true, description: true, category: { select: { name: true } } },
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'skill.created',
      entityType: 'Skill',
      entityId: skill.id,
      summary: `Skill "${name}" created`,
      ipAddress: req.ip,
    });

    return created(res, skill);
  }),
);
