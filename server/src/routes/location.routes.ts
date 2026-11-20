import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateQuery } from '../lib/http';
import { noContent, ok } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/errors';
import { blockedPartnerIds } from '../lib/blockFilters';
import {
  DISTANCE_OPTIONS_KM,
  approximate,
  boundingBox,
  distanceKm,
  isValidCoordinate,
  placeLabel,
  type NearbyMember,
} from '../services/location.service';

export const locationRouter = Router();

locationRouter.use(requireAuth);

const coordinateSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

const saveLocationSchema = coordinateSchema.extend({
  label: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  /** Must be true: storing a location without consent is not allowed. */
  consent: z.literal(true),
  sharingEnabled: z.boolean().default(false),
});

/**
 * GET /api/location/me — the caller's own saved location.
 *
 * Returned at full precision to its owner only; everyone else sees the grid
 * approximation from the nearby endpoint.
 */
locationRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const row = await prisma.userLocation.findUnique({ where: { userId: req.user!.id } });
    if (!row) return ok(res, null);

    return ok(res, {
      latitude: row.latitude,
      longitude: row.longitude,
      label: row.label,
      city: row.city,
      region: row.region,
      country: row.country,
      place: placeLabel(row),
      sharingEnabled: row.sharingEnabled,
      consentAt: row.consentAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    });
  }),
);

/** PUT /api/location/me — save or replace the caller's location. */
locationRouter.put(
  '/me',
  writeLimiter,
  validateBody(saveLocationSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof saveLocationSchema>;
    if (!isValidCoordinate(body.latitude, body.longitude)) {
      throw ApiError.badRequest('Those coordinates are not on Earth.');
    }

    const data = {
      latitude: body.latitude,
      longitude: body.longitude,
      label: body.label ?? null,
      city: body.city ?? null,
      region: body.region ?? null,
      country: body.country ?? null,
      sharingEnabled: body.sharingEnabled,
      consentAt: new Date(),
    };

    const row = await prisma.userLocation.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...data },
      update: data,
    });

    return ok(res, {
      latitude: row.latitude,
      longitude: row.longitude,
      place: placeLabel(row),
      sharingEnabled: row.sharingEnabled,
      consentAt: row.consentAt?.toISOString() ?? null,
    });
  }),
);

/**
 * PATCH /api/location/me/sharing — flip visibility without moving the pin.
 *
 * Turning sharing on requires consent, so it is recorded at that moment.
 */
locationRouter.patch(
  '/me/sharing',
  writeLimiter,
  validateBody(z.object({ sharingEnabled: z.boolean(), consent: z.literal(true).optional() })),
  asyncHandler(async (req, res) => {
    const { sharingEnabled, consent } = req.body as { sharingEnabled: boolean; consent?: true };
    const existing = await prisma.userLocation.findUnique({ where: { userId: req.user!.id } });
    if (!existing) throw ApiError.badRequest('Save a location before changing its visibility.');

    const row = await prisma.userLocation.update({
      where: { userId: req.user!.id },
      data: {
        sharingEnabled,
        // Re-stamp consent whenever visibility is turned back on.
        ...(sharingEnabled && consent ? { consentAt: new Date() } : {}),
      },
    });

    return ok(res, { sharingEnabled: row.sharingEnabled });
  }),
);

/** DELETE /api/location/me — forget the location entirely. */
locationRouter.delete(
  '/me',
  writeLimiter,
  asyncHandler(async (req, res) => {
    await prisma.userLocation.deleteMany({ where: { userId: req.user!.id } });
    return noContent(res);
  }),
);

/**
 * GET /api/location/nearby — members within a radius who chose to share.
 *
 * Only rows with `sharingEnabled` and a recorded consent are eligible. The
 * caller's own row is excluded, as are blocked pairs. Coordinates are snapped
 * before they are returned.
 */
locationRouter.get(
  '/nearby',
  validateQuery(
    z.object({
      radiusKm: z.coerce.number().int().positive().max(50).default(10),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      limit: z.coerce.number().int().positive().max(100).default(50),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as {
      radiusKm: number;
      latitude?: number;
      longitude?: number;
      limit: number;
    };
    const callerId = req.user!.id;

    // The centre is either the caller's saved location or an explicit point
    // from the map (so a member can look around before saving anything).
    let center = { latitude: query.latitude, longitude: query.longitude };
    if (center.latitude === undefined || center.longitude === undefined) {
      const mine = await prisma.userLocation.findUnique({ where: { userId: callerId } });
      if (!mine) {
        throw ApiError.badRequest('Set a location, or pass latitude and longitude.');
      }
      center = { latitude: mine.latitude, longitude: mine.longitude };
    }
    const origin = { latitude: center.latitude!, longitude: center.longitude! };
    if (!isValidCoordinate(origin.latitude, origin.longitude)) {
      throw ApiError.badRequest('Those coordinates are not on Earth.');
    }

    const excluded = await blockedPartnerIds(prisma, callerId);
    excluded.add(callerId);

    const box = boundingBox(origin, query.radiusKm);
    const rows = await prisma.userLocation.findMany({
      where: {
        sharingEnabled: true,
        consentAt: { not: null },
        userId: { notIn: [...excluded] },
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLon, lte: box.maxLon },
        user: { status: 'ACTIVE' },
      },
      select: {
        latitude: true,
        longitude: true,
        label: true,
        city: true,
        region: true,
        country: true,
        user: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true, headline: true } },
            skills: {
              where: { isActive: true, direction: 'TEACH' },
              take: 3,
              select: { level: true, skill: { select: { name: true, slug: true } } },
            },
          },
        },
      },
    });

    const members: NearbyMember[] = rows
      .map((row) => {
        const distance = distanceKm(origin, row);
        return {
          id: row.user.id,
          username: row.user.username,
          displayName: row.user.profile?.displayName ?? row.user.username,
          avatarUrl: row.user.profile?.avatarUrl ?? null,
          headline: row.user.profile?.headline ?? null,
          teaches: row.user.skills.map((s) => ({
            name: s.skill.name,
            slug: s.skill.slug,
            level: s.level,
          })),
          location: approximate(row),
          place: placeLabel(row),
          distanceKm: Number(distance.toFixed(2)),
        };
      })
      // The bounding box is a square; drop the corners that fall outside the
      // circle the member actually asked for.
      .filter((m) => m.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit);

    return ok(res, { center: approximate(origin), radiusKm: query.radiusKm, members });
  }),
);

/** GET /api/location/options — the radius choices the UI offers. */
locationRouter.get('/options', (_req, res) => ok(res, { radii: DISTANCE_OPTIONS_KM }));
