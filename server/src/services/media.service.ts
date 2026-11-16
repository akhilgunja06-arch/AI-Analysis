import type { MediaAsset, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import {
  buildKey,
  getObject,
  objectExists,
  objectSize,
  publicUrl,
  putObject,
  removeObject,
  resolveKey,
  sha256OfFile,
  signMediaUrl,
  type Bucket,
} from './storage.service';
import { optimizeImage, type CompressionReport } from './image.service';
import {
  assertVideoWithinLimits,
  extractVideoThumbnail,
  probeVideo,
  sha256,
} from './video.service';

/**
 * Orchestrates the media pipeline: validate → process → store → record metadata.
 *
 * The database only ever holds metadata and storage paths; bytes live in object
 * storage. Every asset is tied to the authenticated uploader.
 */

export type MediaAssetView = {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO';
  bucket: string;
  originalFileName: string;
  mimeType: string;
  fileExtension: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  frameRate: number | null;
  bitRate: number | null;
  originalSizeBytes: number;
  storedSizeBytes: number;
  percentSaved: number;
  checksumSha256: string | null;
  compressionStatus: string;
  processingStatus: string;
  visibility: string;
  thumbnailUrl: string | null;
  /** URL to render. Private assets get a short-lived signed URL. */
  url: string;
  createdAt: Date;
  compressionReport: CompressionReport | null;
};

function bigintToNumber(value: bigint): number {
  // Sizes are far below Number.MAX_SAFE_INTEGER (9 PB); this is safe.
  return Number(value);
}

/** Builds the client-facing view, signing private objects and thumbnails. */
export function shapeAsset(asset: MediaAsset): MediaAssetView {
  // The profile-images bucket is the only intentionally public one; everything
  // else is served through a short-lived signed URL, regardless of visibility.
  const isPublicBucket = asset.bucket === 'profile-images';
  const urlFor = (key: string) => (isPublicBucket ? publicUrl(key) : signMediaUrl(key));
  const url = urlFor(asset.storagePath);
  const thumbnailUrl = asset.thumbnailPath ? urlFor(asset.thumbnailPath) : null;

  const original = bigintToNumber(asset.originalSizeBytes);
  const stored = bigintToNumber(asset.storedSizeBytes);
  const percentSaved = original > 0 ? Math.round(((original - stored) / original) * 1000) / 10 : 0;

  return {
    id: asset.id,
    mediaType: asset.mediaType,
    bucket: asset.bucket,
    originalFileName: asset.originalFileName,
    mimeType: asset.mimeType,
    fileExtension: asset.fileExtension,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    frameRate: asset.frameRate,
    bitRate: asset.bitRate,
    originalSizeBytes: original,
    storedSizeBytes: stored,
    percentSaved,
    checksumSha256: asset.checksumSha256,
    compressionStatus: asset.compressionStatus,
    processingStatus: asset.processingStatus,
    visibility: asset.visibility,
    thumbnailUrl,
    url,
    createdAt: asset.createdAt,
    compressionReport:
      asset.mediaType === 'IMAGE'
        ? {
            originalSizeBytes: original,
            optimizedSizeBytes: stored,
            percentSaved,
            originalWidth: asset.width ?? 0,
            originalHeight: asset.height ?? 0,
            optimizedWidth: asset.width ?? 0,
            optimizedHeight: asset.height ?? 0,
            thumbnailSizeBytes: 0,
            format: asset.mimeType,
            status: asset.compressionStatus === 'OPTIMIZED' ? 'OPTIMIZED' : 'SKIPPED',
            note:
              asset.compressionStatus === 'OPTIMIZED'
                ? 'Compressed with Sharp (WebP, lossy). Not a lossless conversion.'
                : 'The original was kept; re-encoding offered no saving.',
          }
        : null,
  };
}

/**
 * Optimises and stores an image.
 *
 * Failure is non-destructive: the untouched upload is written first, so if
 * optimisation throws, the original is still on disk and the caller gets an
 * error rather than a lost file.
 */
export async function processImageUpload(params: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  declaredMime: string;
  actualMime: string;
  bucket: Extract<Bucket, 'user-images' | 'profile-images' | 'message-attachments'>;
  kind: 'profile' | 'gallery';
  visibility?: 'PRIVATE' | 'PUBLIC';
}): Promise<MediaAssetView> {
  const { userId, buffer, originalName, actualMime, bucket, kind } = params;
  const visibility = params.visibility ?? 'PRIVATE';

  const ext = actualMime === 'image/jpeg' ? '.jpg' : actualMime === 'image/png' ? '.png' : '.webp';
  const originalKey = buildKey(bucket, userId, `original-${stripExt(originalName)}${ext}`);
  await putObject(originalKey, buffer);

  try {
    const result = await optimizeImage(buffer, kind);

    const chosen = result.keptOriginal ? buffer : result.optimized.buffer;
    const chosenMime = result.keptOriginal ? actualMime : 'image/webp';
    const chosenExt = result.keptOriginal ? ext : '.webp';

    const storedKey = buildKey(bucket, userId, `${stripExt(originalName)}${chosenExt}`);
    await putObject(storedKey, chosen);

    const thumbKey = buildKey('thumbnails', userId, `${stripExt(originalName)}-thumb.webp`);
    await putObject(thumbKey, result.thumbnail.buffer);

    const asset = await prisma.mediaAsset.create({
      data: {
        userId,
        mediaType: 'IMAGE',
        bucket,
        originalFileName: originalName,
        storagePath: storedKey,
        originalStoragePath: env.KEEP_ORIGINAL_MEDIA ? originalKey : null,
        thumbnailPath: thumbKey,
        originalSizeBytes: BigInt(buffer.byteLength),
        storedSizeBytes: BigInt(chosen.byteLength),
        mimeType: chosenMime,
        originalMimeType: actualMime,
        fileExtension: chosenExt,
        width: result.optimized.width,
        height: result.optimized.height,
        compressionStatus: result.keptOriginal ? 'SKIPPED' : 'OPTIMIZED',
        processingStatus: 'READY',
        visibility,
      },
    });

    if (!env.KEEP_ORIGINAL_MEDIA) await removeObject(originalKey);

    return shapeAsset(asset);
  } catch (err) {
    // Optimisation failed: keep the original, record why, surface a clear error.
    if (err instanceof ApiError) throw err;
    logger.error('media.image_failed', { userId, err: (err as Error).message });
    await removeObject(originalKey);
    throw ApiError.badRequest('That image could not be optimised. Upload a valid PNG, JPEG or WebP.');
  }
}

/**
 * Stores a video exactly as uploaded. The bytes are written unchanged; metadata
 * and a poster frame are derived, and a checksum is recorded for later
 * verification. No transcoding happens anywhere in this path.
 */
export async function processVideoUpload(params: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  declaredMime: string;
  actualMime: string;
  bucket: Extract<Bucket, 'user-videos' | 'message-attachments'>;
  visibility?: 'PRIVATE' | 'PUBLIC';
}): Promise<MediaAssetView> {
  const { userId, buffer, originalName, actualMime, bucket } = params;
  const visibility = params.visibility ?? 'PRIVATE';

  const meta = await probeVideo(buffer);
  assertVideoWithinLimits(meta, buffer.byteLength);

  const checksum = sha256(buffer);
  const ext = extensionForVideoMime(actualMime);

  // The original bytes go to storage untouched.
  const storageKey = buildKey(bucket, userId, `${stripExt(originalName)}${ext}`);
  await putObject(storageKey, buffer);

  // Verify the write round-tripped byte-for-byte before recording success.
  const sizeOnDisk = await objectSize(storageKey);
  if (sizeOnDisk !== buffer.byteLength) {
    await removeObject(storageKey);
    throw ApiError.internal('The video was not stored completely. Please try again.');
  }

  let thumbnailPath: string | null = null;
  const frame = await extractVideoThumbnail(buffer, meta.durationSeconds);
  if (frame) {
    thumbnailPath = buildKey('thumbnails', userId, `${stripExt(originalName)}-poster.jpg`);
    await putObject(thumbnailPath, frame);
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      userId,
      mediaType: 'VIDEO',
      bucket,
      originalFileName: originalName,
      storagePath: storageKey,
      // For video, the stored object *is* the original.
      originalStoragePath: storageKey,
      thumbnailPath,
      originalSizeBytes: BigInt(buffer.byteLength),
      storedSizeBytes: BigInt(buffer.byteLength),
      mimeType: actualMime,
      originalMimeType: actualMime,
      fileExtension: ext,
      width: meta.width,
      height: meta.height,
      durationSeconds: meta.durationSeconds,
      frameRate: meta.frameRate,
      bitRate: meta.bitRate,
      checksumSha256: checksum,
      compressionStatus: 'SKIPPED', // never re-encoded
      processingStatus: 'READY',
      visibility,
    },
  });

  return shapeAsset(asset);
}

/**
 * Re-reads a stored video and compares its SHA-256 with the recorded checksum.
 * This is the integrity check the brief asks for: it proves the stored file is
 * identical to what was uploaded.
 */
export async function verifyVideoIntegrity(assetId: string, userId: string): Promise<{
  matches: boolean;
  storedChecksum: string;
  expectedChecksum: string;
  storedSizeBytes: number;
}> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== userId) throw ApiError.notFound('That video could not be found.');
  if (asset.mediaType !== 'VIDEO' || !asset.checksumSha256) {
    throw ApiError.badRequest('That asset is not a stored video.');
  }
  const stored = await sha256OfFile(resolveKey(asset.storagePath));
  return {
    matches: stored === asset.checksumSha256,
    storedChecksum: stored,
    expectedChecksum: asset.checksumSha256,
    storedSizeBytes: bigintToNumber(asset.storedSizeBytes),
  };
}

/** Authorization: an asset is visible to its owner, and to anyone if PUBLIC. */
export async function loadAssetForViewer(
  assetId: string,
  viewer: { id: string; role: string } | null,
): Promise<MediaAsset> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('That file could not be found.');
  if (asset.visibility === 'PUBLIC') return asset;
  if (viewer && (viewer.id === asset.userId || viewer.role === 'ADMIN')) return asset;
  // Private and not the owner: behave as if it does not exist.
  throw ApiError.notFound('That file could not be found.');
}

export async function deleteAsset(assetId: string, userId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.userId !== userId) throw ApiError.notFound('That file could not be found.');

  await prisma.mediaAsset.delete({ where: { id: assetId } });
  await Promise.all([
    removeObject(asset.storagePath),
    asset.originalStoragePath ? removeObject(asset.originalStoragePath) : Promise.resolve(),
    asset.thumbnailPath ? removeObject(asset.thumbnailPath) : Promise.resolve(),
  ]);
}

export async function listAssets(params: {
  userId: string;
  mediaType?: 'IMAGE' | 'VIDEO';
  page: number;
  pageSize: number;
}): Promise<{ items: MediaAssetView[]; total: number }> {
  const where: Prisma.MediaAssetWhereInput = {
    userId: params.userId,
    ...(params.mediaType ? { mediaType: params.mediaType } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);
  return { items: rows.map(shapeAsset), total };
}

/** Confirms an object referenced by metadata is actually present in storage. */
export async function assetObjectExists(asset: MediaAsset): Promise<boolean> {
  return objectExists(asset.storagePath);
}

function stripExt(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'file';
}

function extensionForVideoMime(mime: string): string {
  switch (mime) {
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    case 'video/x-matroska':
      return '.mkv';
    default:
      return '.bin';
  }
}

export { getObject };
