import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../lib/errors';

/**
 * Object storage abstraction.
 *
 * Buckets mirror the object-storage layout the brief asks for. Each logical
 * bucket is a top-level directory under UPLOAD_DIR, and every object is keyed by
 * the owning user's UUID, so a member can never write into another member's
 * folder:
 *
 *   profile-images/{user_id}/{file_name}
 *   user-images/{user_id}/{file_name}
 *   user-videos/{user_id}/{file_name}
 *   message-attachments/{user_id}/{file_name}
 *   thumbnails/{user_id}/{file_name}
 *
 *  - `local` (development default): writes into UPLOAD_DIR and is served from
 *    /uploads. Private objects are only served through a signed URL.
 *  - `s3`: not wired up in this repository; callers refuse with an explicit 501
 *    rather than pretending the upload succeeded.
 */

export const BUCKETS = [
  'profile-images',
  'user-images',
  'user-videos',
  'message-attachments',
  'thumbnails',
] as const;

export type Bucket = (typeof BUCKETS)[number];

export function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
export const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
];

/** Only these types are ever accepted as an optimisable image upload. */
export const OPTIMIZABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function buildUpload(allow: string[], maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!allow.includes(file.mimetype)) {
        cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadAvatar = buildUpload(ALLOWED_IMAGE_TYPES, env.MAX_UPLOAD_BYTES);
export const uploadAttachment = buildUpload(ALLOWED_ATTACHMENT_TYPES, env.MAX_UPLOAD_BYTES);
export const uploadImage = buildUpload(OPTIMIZABLE_IMAGE_TYPES, env.MAX_IMAGE_UPLOAD_BYTES);
export const uploadVideo = buildUpload(ALLOWED_VIDEO_TYPES, env.MAX_VIDEO_UPLOAD_BYTES);
export const uploadVideoChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

/** Extension is derived from the MIME type, never from the client-supplied name. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/zip': '.zip',
};

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? '.bin';
}

const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

/** Best-effort content type for a stored key, derived from its extension. */
export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

export type StoredFile = {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

/**
 * Magic-byte sniffing. The declared Content-Type and the client filename are
 * both attacker-controlled, so the actual bytes decide what a file is.
 * Returns null when nothing matches.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  const b = buffer;
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) return 'image/gif';
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('ascii');
    if (brand.startsWith('qt')) return 'video/quicktime';
    return 'video/mp4';
  }
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'application/zip';
  return null;
}

/** Rejects a file whose declared type disagrees with its actual bytes. */
export function assertMimeMatchesBytes(buffer: Buffer, declared: string, allow: string[]): string {
  const sniffed = sniffMimeType(buffer);
  if (!sniffed) {
    throw ApiError.badRequest('That file could not be recognised as a supported image, video or document.');
  }
  // JPEG/PNG/WebP are exact; the video container families are close enough that
  // a declared mp4 may sniff as quicktime and vice versa, so compare families.
  const family = (m: string) => m.split('/')[0];
  const matches =
    sniffed === declared || (family(sniffed) === family(declared) && family(sniffed) === 'video');
  if (!matches || !allow.includes(sniffed)) {
    throw ApiError.badRequest(
      `The file content does not match its declared type (${declared}). Upload a supported file.`,
    );
  }
  return sniffed;
}

/** Sanitises a client filename for storage and echo-back. */
export function safeFileName(original: string): string {
  return path
    .basename(original)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'file';
}

/**
 * Builds a storage key inside a user's own folder. The user id is validated as a
 * UUID and the filename is sanitised, so `..` and absolute paths cannot escape
 * the bucket directory.
 */
export function buildKey(bucket: Bucket, userId: string, fileName: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw ApiError.internal('Invalid storage owner.');
  const safe = safeFileName(fileName);
  const stamp = Date.now().toString(36);
  const unique = crypto.randomBytes(6).toString('hex');
  const ext = path.extname(safe);
  const base = path.basename(safe, ext).slice(0, 60);
  return `${bucket}/${userId}/${stamp}-${unique}-${base}${ext}`;
}

/** Resolves a key to an absolute path, refusing anything outside UPLOAD_DIR. */
export function resolveKey(key: string): string {
  const safe = key.replace(/^\/+/, '');
  if (safe.split('/').includes('..')) {
    throw ApiError.badRequest('Invalid storage path.');
  }
  const target = path.resolve(env.uploadDirAbs, safe);
  if (target !== env.uploadDirAbs && !target.startsWith(env.uploadDirAbs + path.sep)) {
    throw ApiError.badRequest('Invalid storage path.');
  }
  return target;
}

export async function putObject(key: string, data: Buffer): Promise<{ size: number }> {
  if (env.STORAGE_PROVIDER === 's3') {
    throw ApiError.notImplemented(
      'S3 storage is not configured on this deployment. Set STORAGE_PROVIDER=local or provide S3 credentials.',
    );
  }
  const target = resolveKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data, { mode: 0o644 });
  return { size: data.byteLength };
}

export async function getObject(key: string): Promise<Buffer> {
  const target = resolveKey(key);
  return fs.readFile(target);
}

export function getObjectStream(key: string) {
  return createReadStream(resolveKey(key));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await fs.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export async function objectSize(key: string): Promise<number> {
  const stat = await fs.stat(resolveKey(key));
  return stat.size;
}

export async function removeObject(key: string): Promise<void> {
  if (env.STORAGE_PROVIDER === 's3') return;
  try {
    await fs.rm(resolveKey(key), { force: true });
  } catch {
    // A missing object is not an error for a delete.
  }
}

/**
 * Signed URLs for private media.
 *
 * The signature covers the object key and an expiry, so a link cannot be
 * repointed at another member's object and cannot be used indefinitely. Only the
 * server issues these; the browser never sees the signing secret.
 */
export function signMediaUrl(key: string, ttlSeconds = env.MEDIA_SIGNED_URL_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', env.mediaSigningSecret)
    .update(`${key}:${expires}`)
    .digest('hex');
  const params = new URLSearchParams({ key, expires: String(expires), sig });
  return `/api/media/file?${params.toString()}`;
}

/**
 * Turns a stored path into something the browser can fetch.
 *
 * Avatars and profile images live in a public bucket and are served directly.
 * Everything else — private images, videos and message attachments — is served
 * through a short-lived signed URL, so a stored path is never a permanent public
 * link. Already-absolute or already-signed values pass through untouched.
 */
export function mediaUrlFor(
  storedPath: string | null | undefined,
  options: { public?: boolean } = {},
): string | null {
  if (!storedPath) return null;
  if (storedPath.startsWith('http') || storedPath.startsWith('/api/media/file')) return storedPath;
  // Older rows stored a "/uploads/<key>" URL; reduce it back to a key.
  const key = storedPath.startsWith('/uploads/') ? storedPath.slice('/uploads/'.length) : storedPath;
  if (options.public && key.startsWith('profile-images/')) return publicUrl(key);
  return signMediaUrl(key);
}

export function verifyMediaSignature(key: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac('sha256', env.mediaSigningSecret)
    .update(`${key}:${expires}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Public URL for an object that is intentionally public (e.g. an avatar). */
export function publicUrl(key: string): string {
  return `/uploads/${key}`;
}

/** Stores an avatar or message attachment inside the owner's own folder. */
export async function storeFile(
  file: Express.Multer.File,
  folder: 'avatars' | 'attachments',
  ownerId: string,
): Promise<StoredFile> {
  const bucket: Bucket = folder === 'avatars' ? 'profile-images' : 'message-attachments';
  const ext = EXTENSION_BY_MIME[file.mimetype] ?? '.bin';
  const key = buildKey(bucket, ownerId, `${crypto.randomUUID()}${ext}`);

  await putObject(key, file.buffer);

  return {
    url: publicUrl(key),
    key,
    name: safeFileName(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
  };
}

export async function deleteStoredFile(key: string): Promise<void> {
  await removeObject(key);
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(env.uploadDirAbs, { recursive: true });
  await fs.mkdir(env.mediaTempDirAbs, { recursive: true });
  // Create each bucket root so the layout exists on a fresh install.
  await Promise.all(BUCKETS.map((b) => fs.mkdir(path.join(env.uploadDirAbs, b), { recursive: true })));
}

export async function sha256OfFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
