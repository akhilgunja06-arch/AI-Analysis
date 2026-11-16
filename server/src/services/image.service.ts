import sharp from 'sharp';
import type { Metadata } from 'sharp';
import { ApiError } from '../lib/errors';

/**
 * Server-side image optimisation.
 *
 * Compression is performed by Sharp (libvips) — a deterministic image-processing
 * engine, not an AI service. The "adaptive" part is a small set of heuristics
 * derived from the image's own characteristics (dimensions, alpha channel,
 * luminance detail, source format) that choose quality, maximum dimension and
 * output format. No model is consulted, so nothing here claims to be AI.
 *
 * Guarantees:
 *  - Metadata (including GPS) is stripped: output is written without
 *    `withMetadata`, so EXIF/GPS do not survive.
 *  - Aspect ratio is preserved (only the longest edge is bounded).
 *  - A result is never kept when it is larger than, or visibly worse than, the
 *    source: the caller compares sizes and can keep the original instead.
 *  - Animated images are not flattened; they are left to the original.
 */

export type ImageKind = 'profile' | 'gallery' | 'thumbnail';

export type ImageVariant = {
  buffer: Buffer;
  format: 'webp' | 'jpeg' | 'png' | 'avif';
  mimeType: string;
  width: number;
  height: number;
  size: number;
};

export type ImageOptimizationResult = {
  optimized: ImageVariant;
  thumbnail: ImageVariant;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  /** True when re-encoding did not produce a worthwhile saving. */
  keptOriginal: boolean;
  settings: AdaptiveSettings;
  report: CompressionReport;
};

export type AdaptiveSettings = {
  maxDimension: number;
  quality: number;
  format: 'webp';
  /** 0..1 luminance detail score used to pick quality. */
  detailScore: number;
  hasAlpha: boolean;
  reason: string;
};

export type CompressionReport = {
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  percentSaved: number;
  originalWidth: number;
  originalHeight: number;
  optimizedWidth: number;
  optimizedHeight: number;
  thumbnailSizeBytes: number;
  format: string;
  status: 'OPTIMIZED' | 'SKIPPED';
  note: string;
};

const MAX_DIMENSION: Record<ImageKind, number> = {
  profile: 1024,
  gallery: 2560,
  thumbnail: 400,
};

const BASE_QUALITY: Record<ImageKind, number> = {
  profile: 86, // profile photographs keep more detail
  gallery: 80,
  thumbnail: 74,
};

const THUMB_MAX = 400;

function mimeFor(format: string): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Heuristic settings from the image's own statistics.
 *
 * `detailScore` is derived from the standard deviation of the luminance channel:
 * a flat image (low deviation) tolerates stronger compression, a busy one
 * (high deviation) is given more quality so text and edges survive.
 */
async function chooseSettings(input: Buffer, kind: ImageKind, meta: Metadata): Promise<AdaptiveSettings> {
  const maxDimension = MAX_DIMENSION[kind];
  let detailScore = 0.5;
  try {
    const stats = await sharp(input).greyscale().stats();
    const stdev = stats.channels[0]?.stdev ?? 0;
    // Normalise: ~0 for flat, approaching 1 for very busy images.
    detailScore = Math.max(0, Math.min(1, stdev / 90));
  } catch {
    detailScore = 0.5;
  }

  // 0.6..1.4 multiplier around the base quality, clamped to a safe band.
  const quality = Math.round(
    Math.max(62, Math.min(92, BASE_QUALITY[kind] * (0.85 + detailScore * 0.5))),
  );

  const hasAlpha = Boolean(meta.hasAlpha);
  const reason =
    detailScore > 0.6
      ? 'Detailed image: quality raised to preserve text and edges.'
      : detailScore < 0.25
        ? 'Flat image: quality lowered for a smaller file with no visible loss.'
        : 'Typical image: balanced quality and size.';

  return { maxDimension, quality, format: 'webp', detailScore, hasAlpha, reason };
}

async function render(
  input: Buffer,
  maxDimension: number,
  quality: number,
): Promise<ImageVariant> {
  const pipeline = sharp(input, { failOn: 'none' })
    .rotate() // honour EXIF orientation before EXIF is stripped
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    // No withMetadata() call: EXIF/GPS/ICC are dropped from the output.
    .webp({ quality, effort: 4 });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    format: 'webp',
    mimeType: mimeFor('webp'),
    width: info.width,
    height: info.height,
    size: info.size,
  };
}

/**
 * Optimises an image and produces a thumbnail. Throws a 4xx ApiError for input
 * that is not a decodable image; callers must keep the original in that case.
 */
export async function optimizeImage(
  input: Buffer,
  kind: Exclude<ImageKind, 'thumbnail'> = 'gallery',
): Promise<ImageOptimizationResult> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'none' }).metadata();
  } catch {
    throw ApiError.badRequest('That image could not be read. Upload a valid PNG, JPEG or WebP.');
  }

  if (!meta.width || !meta.height) {
    throw ApiError.badRequest('That image has no readable dimensions.');
  }

  // Animated images (multi-page WebP/GIF) are left untouched rather than
  // flattened into a single frame.
  if ((meta.pages ?? 1) > 1) {
    throw ApiError.badRequest('Animated images are not optimised. Upload a still image.');
  }

  const settings = await chooseSettings(input, kind, meta);
  const optimized = await render(input, settings.maxDimension, settings.quality);
  const thumbnail = await render(input, THUMB_MAX, 74);

  const percentSaved = input.byteLength > 0
    ? Math.round(((input.byteLength - optimized.size) / input.byteLength) * 1000) / 10
    : 0;

  // Keep the original when re-encoding did not actually help. This is what stops
  // an already-optimal file from being replaced by a larger or worse one.
  const keptOriginal = optimized.size >= input.byteLength;

  return {
    optimized,
    thumbnail,
    originalWidth: meta.width,
    originalHeight: meta.height,
    originalSize: input.byteLength,
    keptOriginal,
    settings,
    report: {
      originalSizeBytes: input.byteLength,
      optimizedSizeBytes: keptOriginal ? input.byteLength : optimized.size,
      percentSaved: keptOriginal ? 0 : percentSaved,
      originalWidth: meta.width,
      originalHeight: meta.height,
      optimizedWidth: optimized.width,
      optimizedHeight: optimized.height,
      thumbnailSizeBytes: thumbnail.size,
      format: keptOriginal ? `original (${meta.format ?? 'unknown'})` : 'webp',
      status: keptOriginal ? 'SKIPPED' : 'OPTIMIZED',
      note: keptOriginal
        ? 'Re-encoding produced no saving, so the original was kept. WebP is lossy, not lossless.'
        : `${settings.reason} WebP is lossy, so this is not a lossless conversion.`,
    },
  };
}

/** Reads just the dimensions without writing anything. */
export async function imageDimensions(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
