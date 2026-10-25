import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../lib/errors';

/**
 * Object storage abstraction.
 *  - `local` (development default): writes into UPLOAD_DIR and is served from /uploads
 *  - `s3`: not wired up in this repository; the endpoint refuses with an explicit
 *    501 rather than pretending the upload succeeded.
 */

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
];

function buildUpload(allow: string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!allow.includes(file.mimetype)) {
        cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadAvatar = buildUpload(ALLOWED_IMAGE_TYPES);
export const uploadAttachment = buildUpload(ALLOWED_ATTACHMENT_TYPES);

/** Extension is derived from the MIME type, never from the client-supplied name. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/zip': '.zip',
};

export type StoredFile = {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

export async function storeFile(
  file: Express.Multer.File,
  folder: 'avatars' | 'attachments',
): Promise<StoredFile> {
  if (env.STORAGE_PROVIDER === 's3') {
    throw ApiError.notImplemented(
      'S3 storage is not configured on this deployment. Set STORAGE_PROVIDER=local or provide S3 credentials.',
    );
  }

  const ext = EXTENSION_BY_MIME[file.mimetype] ?? '.bin';
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
  const target = path.join(env.uploadDirAbs, key);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, file.buffer, { mode: 0o644 });

  return {
    url: `/uploads/${key}`,
    key,
    // Sanitise the original name before it is ever echoed back to a client.
    name: path.basename(file.originalname).replace(/[^\w.\- ]+/g, '_').slice(0, 120),
    mimeType: file.mimetype,
    size: file.size,
  };
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (env.STORAGE_PROVIDER === 's3') return;
  // Guard against path traversal in a stored key.
  const safe = key.replace(/^\/+/, '');
  if (safe.includes('..')) return;
  const target = path.join(env.uploadDirAbs, safe);
  if (!target.startsWith(env.uploadDirAbs)) return;
  await fs.rm(target, { force: true });
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(env.uploadDirAbs, { recursive: true });
}
