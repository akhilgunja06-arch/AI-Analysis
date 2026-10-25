import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody } from '../lib/http';
import { ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import {
  bioSchema,
  displayNameSchema,
  languageSchema,
  shortText,
  timezoneSchema,
  urlSchema,
} from '../lib/validation';
import { profileCompletion } from '../services/member.service';
import { uploadAvatar, storeFile } from '../services/storage.service';
import { recordAudit } from '../services/audit.service';

export const profileRouter = Router();

profileRouter.use(requireAuth);

const profileSchema = z.object({
  displayName: displayNameSchema.optional(),
  headline: shortText(120).optional().or(z.literal('')),
  bio: bioSchema.optional().or(z.literal('')),
  location: shortText(120).optional().or(z.literal('')),
  timezone: timezoneSchema.optional(),
  languages: languageSchema.optional(),
  websiteUrl: urlSchema,
  githubUrl: urlSchema,
  linkedinUrl: urlSchema,
  preferredFormat: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).optional(),
  learningGoals: z.string().trim().max(2000).optional().or(z.literal('')),
  weeklyAvailabilityHours: z.coerce.number().int().min(0).max(80).optional(),
});

/** GET /api/profile — the signed-in member's own editable profile. */
profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        profile: true,
        preference: true,
      },
    });
    if (!user) throw ApiError.notFound('Account not found.');
    const completion = await computeCompletion(user.id);
    return ok(res, {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
      memberSince: user.createdAt,
      profile: user.profile,
      preferences: user.preference,
      completion,
    });
  }),
);

/** PATCH /api/profile — partial update. Unknown fields are stripped by Zod. */
profileRouter.patch(
  '/',
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof profileSchema>;

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value === '' ? null : value;
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest('No profile fields were provided.');
    }

    const profile = await prisma.profile.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, displayName: 'New member', ...data },
      update: data,
    });

    const completion = await computeCompletion(req.user!.id);
    return ok(res, { profile, completion });
  }),
);

/** POST /api/profile/avatar — multipart upload, image types only. */
profileRouter.post(
  '/avatar',
  uploadAvatar.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Choose an image to upload.');
    const stored = await storeFile(req.file, 'avatars');
    const profile = await prisma.profile.update({
      where: { userId: req.user!.id },
      data: { avatarUrl: stored.url },
    });
    return ok(res, { avatarUrl: profile.avatarUrl });
  }),
);

/** Availability: replace-all semantics keeps the weekly grid consistent. */
const availabilitySchema = z.object({
  windows: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        startMinute: z.coerce.number().int().min(0).max(1439),
        endMinute: z.coerce.number().int().min(1).max(1440),
        format: z.enum(['ONLINE', 'IN_PERSON', 'EITHER']).default('ONLINE'),
      }),
    )
    .max(40, 'You can define at most 40 weekly windows.'),
});

profileRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const availability = await prisma.availability.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    return ok(res, availability);
  }),
);

profileRouter.put(
  '/availability',
  validateBody(availabilitySchema),
  asyncHandler(async (req, res) => {
    const { windows } = req.body as z.infer<typeof availabilitySchema>;

    for (const w of windows) {
      if (w.endMinute <= w.startMinute) {
        throw ApiError.unprocessable('Each availability window must end after it starts.', {
          issues: [{ path: 'windows', message: 'End time must be after start time.' }],
        });
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({ where: { userId: req.user!.id } });
      if (windows.length === 0) return [];
      await tx.availability.createMany({
        data: windows.map((w) => ({ ...w, userId: req.user!.id })),
      });
      return tx.availability.findMany({
        where: { userId: req.user!.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      });
    });

    return ok(res, saved);
  }),
);

/** Onboarding progress: saved step + completion, so a member can resume. */
const onboardingSchema = z.object({
  step: z.coerce.number().int().min(1).max(5).optional(),
  completed: z.boolean().optional(),
});

profileRouter.get(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user!.id },
      select: { onboardingStep: true, onboardingCompletedAt: true },
    });
    const completion = await computeCompletion(req.user!.id);
    return ok(res, {
      step: profile?.onboardingStep ?? 1,
      completed: Boolean(profile?.onboardingCompletedAt),
      completion,
    });
  }),
);

profileRouter.patch(
  '/onboarding',
  validateBody(onboardingSchema),
  asyncHandler(async (req, res) => {
    const { step, completed } = req.body as z.infer<typeof onboardingSchema>;

    if (completed === true) {
      const completion = await computeCompletion(req.user!.id);
      if (completion.percent < 60) {
        throw ApiError.unprocessable(
          'Finish a little more of your profile before completing onboarding.',
          { issues: completion.missing.map((m) => ({ path: 'profile', message: m })) },
        );
      }
    }

    const profile = await prisma.profile.update({
      where: { userId: req.user!.id },
      data: {
        ...(step !== undefined ? { onboardingStep: step } : {}),
        ...(completed === true ? { onboardingCompletedAt: new Date() } : {}),
      },
    });

    if (completed === true) {
      await recordAudit({
        actorId: req.user!.id,
        action: 'profile.onboarding_completed',
        entityType: 'Profile',
        entityId: profile.id,
        summary: 'Member completed onboarding',
        ipAddress: req.ip,
      });
    }

    return ok(res, { step: profile.onboardingStep, completed: Boolean(profile.onboardingCompletedAt) });
  }),
);

async function computeCompletion(userId: string) {
  const [profile, teaches, wants, availability] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.userSkill.count({ where: { userId, direction: 'TEACH', isActive: true } }),
    prisma.userSkill.count({ where: { userId, direction: 'LEARN', isActive: true } }),
    prisma.availability.count({ where: { userId } }),
  ]);

  return profileCompletion({
    hasAvatar: Boolean(profile?.avatarUrl),
    hasDisplayName: Boolean(profile?.displayName && profile.displayName !== 'New member'),
    hasBio: Boolean(profile?.bio && profile.bio.length >= 20),
    hasLocation: Boolean(profile?.location),
    hasLanguages: Boolean(profile?.languages && profile.languages.length > 0),
    hasTimezone: Boolean(profile?.timezone && profile.timezone !== 'UTC') || Boolean(profile?.timezone),
    teachesCount: teaches,
    wantsCount: wants,
    availabilityCount: availability,
    hasGoals: Boolean(profile?.learningGoals && profile.learningGoals.length >= 10),
  });
}
