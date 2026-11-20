import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateBody, validateParams, validateQuery } from '../lib/http';
import { created, noContent, ok, paginated } from '../lib/respond';
import { ApiError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/errors';
import { uuidSchema } from '../lib/validation';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  assertMimeMatchesBytes,
  buildKey,
  contentTypeForKey,
  getObjectStream,
  isBucket,
  objectSize,
  safeFileName,
  uploadImage,
  uploadVideo,
  uploadVideoChunk,
  verifyMediaSignature,
  type Bucket,
} from '../services/storage.service';
import {
  deleteAsset,
  listAssets,
  loadAssetForViewer,
  processImageUpload,
  processVideoUpload,
  shapeAsset,
  verifyVideoIntegrity,
} from '../services/media.service';
import { probeVideo, assertVideoWithinLimits } from '../services/video.service';
import { recordAudit } from '../services/audit.service';

export const mediaRouter = Router();

// ---------------------------------------------------------------------------
// Signed file delivery. Mounted before requireAuth because the signature itself
// is the credential, and it is scoped to one key and one expiry.
// ---------------------------------------------------------------------------

const signedQuerySchema = z.object({
  key: z.string().min(1).max(400),
  expires: z.coerce.number().int(),
  sig: z.string().min(16).max(128),
});

/**
 * GET /api/media/file — serves a private object through a short-lived signed
 * URL. The signature is verified in constant time and is bound to the key, so it
 * cannot be replayed against a different object or after it expires.
 */
mediaRouter.get(
  '/file',
  validateQuery(signedQuerySchema),
  asyncHandler(async (req, res) => {
    const { key, expires, sig } = res.locals.query as z.infer<typeof signedQuerySchema>;
    if (!verifyMediaSignature(key, expires, sig)) {
      throw ApiError.forbidden('This link is invalid or has expired.');
    }

    // Only keys inside a known bucket can be served.
    const bucket = key.split('/')[0];
    if (!isBucket(bucket)) throw ApiError.notFound('That file could not be found.');

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', contentTypeForKey(key));
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = getObjectStream(key);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That file could not be found.' } });
      else res.destroy();
    });
    stream.pipe(res);
  }),
);

// Everything below requires an authenticated, verified member.
mediaRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

const imageUploadFields = {
  visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
  bucket: z.enum(['user-images', 'profile-images']).default('user-images'),
  kind: z.enum(['profile', 'gallery']).default('gallery'),
};

/**
 * POST /api/media/images — validate, optimise, store and record metadata.
 *
 * The declared MIME type is checked against the actual bytes before anything is
 * written, so a renamed executable cannot enter storage as an image.
 */
mediaRouter.post(
  '/images',
  requireAuth,
  uploadLimiter,
  uploadImage.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Choose an image to upload.');

    const parsed = z.object(imageUploadFields).safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.unprocessable('Invalid upload options.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '_', message: i.message })),
      });
    }
    const { visibility, bucket, kind } = parsed.data;

    const actualMime = assertMimeMatchesBytes(req.file.buffer, req.file.mimetype, ALLOWED_IMAGE_TYPES);

    const asset = await processImageUpload({
      userId: req.user!.id,
      buffer: req.file.buffer,
      originalName: safeFileName(req.file.originalname),
      declaredMime: req.file.mimetype,
      actualMime,
      bucket,
      kind,
      visibility,
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'media.image_uploaded',
      entityType: 'MediaAsset',
      entityId: asset.id,
      summary: `Image uploaded (${asset.originalSizeBytes} → ${asset.storedSizeBytes} bytes)`,
      ipAddress: req.ip,
    });

    return created(res, asset);
  }),
);

// ---------------------------------------------------------------------------
// Video upload — original bytes preserved
// ---------------------------------------------------------------------------

/**
 * POST /api/media/videos — stores the exact bytes uploaded. No transcoding.
 */
mediaRouter.post(
  '/videos',
  requireAuth,
  uploadLimiter,
  uploadVideo.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Choose a video to upload.');

    const parsed = z
      .object({
        visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
        bucket: z.enum(['user-videos', 'message-attachments']).default('user-videos'),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      throw ApiError.unprocessable('Invalid upload options.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '_', message: i.message })),
      });
    }

    const actualMime = assertMimeMatchesBytes(req.file.buffer, req.file.mimetype, ALLOWED_VIDEO_TYPES);

    const asset = await processVideoUpload({
      userId: req.user!.id,
      buffer: req.file.buffer,
      originalName: safeFileName(req.file.originalname),
      declaredMime: req.file.mimetype,
      actualMime,
      bucket: parsed.data.bucket,
      visibility: parsed.data.visibility,
    });

    await recordAudit({
      actorId: req.user!.id,
      action: 'media.video_uploaded',
      entityType: 'MediaAsset',
      entityId: asset.id,
      summary: `Video stored without re-encoding (${asset.originalSizeBytes} bytes)`,
      ipAddress: req.ip,
    });

    return created(res, asset);
  }),
);

// ---------------------------------------------------------------------------
// Resumable (chunked) upload for large videos
// ---------------------------------------------------------------------------

const startSessionSchema = z.object({
  clientUploadId: z.string().trim().min(8).max(120),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  totalBytes: z.coerce.number().int().positive(),
  bucket: z.enum(['user-videos', 'message-attachments']).default('user-videos'),
});

/**
 * POST /api/media/uploads — opens (or resumes) a chunked upload session.
 *
 * Keyed by (user, clientUploadId), so a client that retries after a dropped
 * connection rejoins the same session instead of starting a duplicate.
 */
mediaRouter.post(
  '/uploads',
  requireAuth,
  validateBody(startSessionSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof startSessionSchema>;

    if (body.totalBytes > env.MAX_VIDEO_UPLOAD_BYTES) {
      throw ApiError.badRequest(
        `Videos are limited to ${Math.round(env.MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      );
    }

    const existing = await prisma.mediaUploadSession.findUnique({
      where: { userId_clientUploadId: { userId: req.user!.id, clientUploadId: body.clientUploadId } },
    });

    if (existing && existing.status === 'IN_PROGRESS') {
      return ok(res, {
        uploadId: existing.id,
        receivedBytes: Number(existing.receivedBytes),
        chunkCount: existing.chunkCount,
        resumed: true,
      });
    }
    if (existing && existing.status === 'COMPLETED') {
      throw ApiError.conflict('That upload has already been completed.');
    }

    const tempKey = buildKey('user-videos', req.user!.id, `upload-${body.clientUploadId}.part`);

    const session = await prisma.mediaUploadSession.create({
      data: {
        userId: req.user!.id,
        clientUploadId: body.clientUploadId,
        mediaType: 'VIDEO',
        bucket: body.bucket,
        originalFileName: safeFileName(body.fileName),
        mimeType: body.mimeType,
        totalBytes: BigInt(body.totalBytes),
        storagePath: tempKey,
        expiresAt: new Date(Date.now() + env.MEDIA_UPLOAD_TTL_MINUTES * 60 * 1000),
      },
    });

    return created(res, {
      uploadId: session.id,
      receivedBytes: 0,
      chunkCount: 0,
      resumed: false,
    });
  }),
);

/**
 * PUT /api/media/uploads/:id/chunk?index=N — appends one chunk.
 *
 * Chunks must arrive in order (index must equal the number already received).
 * Out-of-order chunks are rejected so the assembled file is always the original
 * byte sequence and never a shuffled one.
 */
mediaRouter.put(
  '/uploads/:id/chunk',
  requireAuth,
  validateParams(z.object({ id: uuidSchema })),
  uploadVideoChunk.single('chunk'),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    if (!req.file) throw ApiError.badRequest('No chunk data was received.');

    const index = Number.parseInt(String(req.query.index ?? ''), 10);
    if (!Number.isInteger(index) || index < 0) {
      throw ApiError.badRequest('A non-negative chunk index is required.');
    }

    const session = await prisma.mediaUploadSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user!.id) throw ApiError.notFound('That upload could not be found.');
    if (session.status !== 'IN_PROGRESS') throw ApiError.conflict('That upload is no longer accepting chunks.');
    if (session.expiresAt < new Date()) {
      await prisma.mediaUploadSession.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw ApiError.conflict('That upload session has expired. Start a new upload.');
    }
    if (index !== session.chunkCount) {
      throw ApiError.conflict(`Expected chunk ${session.chunkCount} but received ${index}.`);
    }

    const tempAbs = path.resolve(env.uploadDirAbs, session.storagePath!);
    await fs.mkdir(path.dirname(tempAbs), { recursive: true });
    await fs.appendFile(tempAbs, req.file.buffer);

    const receivedBytes = Number(session.receivedBytes) + req.file.buffer.byteLength;
    if (receivedBytes > Number(session.totalBytes)) {
      // Roll back the appended bytes so accounting stays consistent.
      await fs.rm(tempAbs, { force: true });
      await prisma.mediaUploadSession.update({
        where: { id },
        data: { receivedBytes: 0n, chunkCount: 0, status: 'ABORTED' },
      });
      throw ApiError.badRequest('That chunk would exceed the declared file size.');
    }

    await prisma.mediaUploadSession.update({
      where: { id },
      data: { receivedBytes: BigInt(receivedBytes), chunkCount: index + 1 },
    });

    return ok(res, { receivedBytes, chunkCount: index + 1 });
  }),
);

/**
 * POST /api/media/uploads/:id/complete — assembles, verifies and stores.
 *
 * The assembled bytes are checked against the declared size and probed for
 * duration before anything is accepted, so a truncated upload fails cleanly.
 */
mediaRouter.post(
  '/uploads/:id/complete',
  requireAuth,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };

    const session = await prisma.mediaUploadSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user!.id) throw ApiError.notFound('That upload could not be found.');
    if (session.status === 'COMPLETED') throw ApiError.conflict('That upload is already complete.');
    if (Number(session.receivedBytes) !== Number(session.totalBytes)) {
      throw ApiError.badRequest(
        `The upload is incomplete (${session.receivedBytes} of ${session.totalBytes} bytes received).`,
      );
    }

    const tempAbs = path.resolve(env.uploadDirAbs, session.storagePath!);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(tempAbs);
    } catch {
      throw ApiError.badRequest('The uploaded data could not be found. Start the upload again.');
    }

    try {
      const actualMime = assertMimeMatchesBytes(buffer, session.mimeType, ALLOWED_VIDEO_TYPES);
      const meta = await probeVideo(buffer);
      assertVideoWithinLimits(meta, buffer.byteLength);

      const asset = await processVideoUpload({
        userId: req.user!.id,
        buffer,
        originalName: session.originalFileName,
        declaredMime: session.mimeType,
        actualMime,
        bucket: session.bucket as Extract<Bucket, 'user-videos' | 'message-attachments'>,
        visibility: 'PRIVATE',
      });

      await prisma.mediaUploadSession.update({
        where: { id },
        data: { status: 'COMPLETED', assetId: asset.id },
      });
      await fs.rm(tempAbs, { force: true });

      return created(res, asset);
    } catch (err) {
      // Keep the partial file for a resume attempt, but mark the failure.
      await prisma.mediaUploadSession.update({ where: { id }, data: { status: 'ABORTED' } });
      throw err;
    }
  }),
);

/** DELETE /api/media/uploads/:id — abandons a resumable upload and frees space. */
mediaRouter.delete(
  '/uploads/:id',
  requireAuth,
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const session = await prisma.mediaUploadSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user!.id) throw ApiError.notFound('That upload could not be found.');

    if (session.storagePath) {
      await fs.rm(path.resolve(env.uploadDirAbs, session.storagePath), { force: true });
    }
    await prisma.mediaUploadSession.update({ where: { id }, data: { status: 'ABORTED' } });
    return noContent(res);
  }),
);

// ---------------------------------------------------------------------------
// Listing, viewing, verifying, deleting
// ---------------------------------------------------------------------------

/** GET /api/media — the member's own uploads, paginated and filterable. */
mediaRouter.get(
  '/',
  validateQuery(
    z.object({
      type: z.enum(['IMAGE', 'VIDEO']).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(48).default(24),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { type?: 'IMAGE' | 'VIDEO'; page: number; pageSize: number };
    const { items, total } = await listAssets({
      userId: req.user!.id,
      mediaType: query.type,
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginated(res, items, total, query.page, query.pageSize);
  }),
);

/** GET /api/media/:id — metadata plus a signed URL, owner or public only. */
mediaRouter.get(
  '/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const asset = await loadAssetForViewer(id, { id: req.user!.id, role: req.user!.role });
    return ok(res, shapeAsset(asset));
  }),
);

/** GET /api/media/:id/integrity — re-hashes a stored video and compares. */
mediaRouter.get(
  '/:id/integrity',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const result = await verifyVideoIntegrity(id, req.user!.id);
    return ok(res, result);
  }),
);

/** DELETE /api/media/:id — removes the asset and every stored object it owns. */
mediaRouter.delete(
  '/:id',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    await deleteAsset(id, req.user!.id);
    return noContent(res);
  }),
);

/**
 * POST /api/media/:id/visibility — flips an asset between private and public.
 * Only the owner can do this; it is the switch that decides whether a plain
 * (unsigned) URL is used.
 */
mediaRouter.post(
  '/:id/visibility',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ visibility: z.enum(['PRIVATE', 'PUBLIC']) })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const { visibility } = req.body as { visibility: 'PRIVATE' | 'PUBLIC' };

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.userId !== req.user!.id) throw ApiError.notFound('That file could not be found.');

    const updated = await prisma.mediaAsset.update({ where: { id }, data: { visibility } });
    return ok(res, shapeAsset(updated));
  }),
);

/** GET /api/media/:id/download — streams the private object to its owner. */
mediaRouter.get(
  '/:id/download',
  validateParams(z.object({ id: uuidSchema })),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.params as { id: string };
    const asset = await loadAssetForViewer(id, { id: req.user!.id, role: req.user!.role });

    try {
      const size = await objectSize(asset.storagePath);
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Content-Length', String(size));
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(asset.originalFileName)}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      getObjectStream(asset.storagePath).pipe(res);
    } catch (err) {
      logger.error('media.download_failed', { assetId: id, err: (err as Error).message });
      throw ApiError.notFound('That file could not be found.');
    }
  }),
);
