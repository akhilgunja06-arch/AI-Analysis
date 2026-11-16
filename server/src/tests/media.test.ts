import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../app';
import { env } from '../config/env';
import {
  api,
  createAccount,
  prisma,
  resetDatabase,
  uploadFile,
  type TestAccount,
} from './helpers';

const execFileAsync = promisify(execFile);

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

/** A real PNG with EXIF metadata, so metadata stripping is actually testable. */
async function makePng(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .withMetadata({ exif: { IFD0: { Copyright: 'test', Software: 'vitest' } } })
    .png()
    .toBuffer();
}

async function makeJpeg(width = 2400, height = 1600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/** A real, small MP4 produced by ffmpeg (testsrc), for byte-integrity checks. */
async function makeMp4(): Promise<Buffer> {
  const out = path.join(os.tmpdir(), `ss-test-${crypto.randomUUID()}.mp4`);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-v', 'error',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=1:size=320x240:rate=30',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-y', out,
      ],
      { timeout: 60_000 },
    );
    return await fs.readFile(out);
  } finally {
    await fs.rm(out, { force: true });
  }
}

describe('media > image optimisation', () => {
  it('optimises a PNG, strips EXIF, and reports the saving', async () => {
    const user = await createAccount(baseUrl);
    const png = await makePng();

    const res = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'photo.png',
      contentType: 'image/png',
    }, { token: user.token });

    expect(res.status).toBe(201);
    const asset = res.body.data;
    expect(asset.mediaType).toBe('IMAGE');
    expect(asset.compressionStatus).toBe('OPTIMIZED');
    expect(asset.mimeType).toBe('image/webp');
    // Original size is recorded and the stored object is not larger.
    expect(asset.originalSizeBytes).toBe(png.byteLength);
    expect(asset.storedSizeBytes).toBeLessThanOrEqual(asset.originalSizeBytes);
    // Aspect ratio preserved.
    expect(asset.width / asset.height).toBeCloseTo(1600 / 1200, 1);
    // A thumbnail exists.
    expect(asset.thumbnailUrl).toBeTruthy();

    // EXIF must not survive the optimisation.
    const stored = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    const storedPath = path.resolve(env.uploadDirAbs, stored!.storagePath);
    const meta = await sharp(storedPath).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('resizes an excessively large photograph within the maximum dimension', async () => {
    const user = await createAccount(baseUrl);
    const jpeg = await makeJpeg(4000, 3000);

    const res = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: jpeg,
      filename: 'huge.jpg',
      contentType: 'image/jpeg',
    }, { token: user.token, fields: { kind: 'gallery' } });

    expect(res.status).toBe(201);
    expect(res.body.data.width).toBeLessThanOrEqual(2560);
    expect(res.body.data.height).toBeLessThanOrEqual(2560);
    // Ratio is preserved.
    expect(res.body.data.width / res.body.data.height).toBeCloseTo(4 / 3, 1);
  });

  it('rejects a file whose bytes do not match its declared image type', async () => {
    const user = await createAccount(baseUrl);
    // Declared as a PNG but actually a PDF.
    const res = await uploadFile(baseUrl, '/api/media/images', 'file', {
      buffer: Buffer.from('%PDF-1.7 not an image at all'),
      filename: 'evil.png',
      contentType: 'image/png',
    }, { token: user.token });

    expect(res.status).toBe(400);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it('refuses an unauthenticated upload', async () => {
    const png = await makePng(200, 200);
    const res = await uploadFile(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'x.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(401);
  });
});

describe('media > video integrity', () => {
  it('stores the original video bytes unchanged and verifies the checksum', async () => {
    const user = await createAccount(baseUrl);
    const mp4 = await makeMp4();

    const res = await uploadFile<{ data: any }>(baseUrl, '/api/media/videos', 'file', {
      buffer: mp4,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    }, { token: user.token });

    expect(res.status).toBe(201);
    const asset = res.body.data;
    expect(asset.mediaType).toBe('VIDEO');
    // Never re-encoded.
    expect(asset.compressionStatus).toBe('SKIPPED');
    expect(asset.storedSizeBytes).toBe(mp4.byteLength);
    expect(asset.originalSizeBytes).toBe(mp4.byteLength);
    expect(asset.checksumSha256).toBe(crypto.createHash('sha256').update(mp4).digest('hex'));
    // Dimensions read from the real file.
    expect(asset.width).toBe(320);
    expect(asset.height).toBe(240);
    expect(asset.durationSeconds).toBeGreaterThan(0);

    // The stored bytes must be identical to what was uploaded.
    const record = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    const onDisk = await fs.readFile(path.resolve(env.uploadDirAbs, record!.storagePath));
    expect(onDisk.byteLength).toBe(mp4.byteLength);
    expect(crypto.createHash('sha256').update(onDisk).digest('hex')).toBe(asset.checksumSha256);

    // The integrity endpoint re-hashes and confirms a match.
    const check = await api<{ data: { matches: boolean } }>(
      baseUrl,
      'GET',
      `/api/media/${asset.id}/integrity`,
      { token: user.token },
    );
    expect(check.status).toBe(200);
    expect(check.body.data.matches).toBe(true);
  });

  it('accepts a resumable chunked upload and assembles it byte-for-byte', async () => {
    const user = await createAccount(baseUrl);
    const mp4 = await makeMp4();

    const started = await api<{ data: { uploadId: string } }>(baseUrl, 'POST', '/api/media/uploads', {
      token: user.token,
      body: {
        clientUploadId: `client-${crypto.randomUUID()}`,
        fileName: 'big.mp4',
        mimeType: 'video/mp4',
        totalBytes: mp4.byteLength,
      },
    });
    expect(started.status).toBe(201);
    const uploadId = started.body.data.uploadId;

    // Split into two chunks and send them in order.
    const half = Math.floor(mp4.byteLength / 2);
    const chunks = [mp4.subarray(0, half), mp4.subarray(half)];

    for (let i = 0; i < chunks.length; i += 1) {
      const res = await uploadFile(
        baseUrl,
        `/api/media/uploads/${uploadId}/chunk?index=${i}`,
        'chunk',
        { buffer: chunks[i], filename: `chunk-${i}`, contentType: 'application/octet-stream' },
        { token: user.token, method: 'PUT' },
      );
      expect(res.status).toBe(200);
    }

    const completed = await api<{ data: any }>(
      baseUrl,
      'POST',
      `/api/media/uploads/${uploadId}/complete`,
      { token: user.token },
    );
    expect(completed.status).toBe(201);
    expect(completed.body.data.storedSizeBytes).toBe(mp4.byteLength);
    expect(completed.body.data.checksumSha256).toBe(
      crypto.createHash('sha256').update(mp4).digest('hex'),
    );
  });

  it('rejects an out-of-order chunk so the file can never be shuffled', async () => {
    const user = await createAccount(baseUrl);
    const mp4 = await makeMp4();

    const started = await api<{ data: { uploadId: string } }>(baseUrl, 'POST', '/api/media/uploads', {
      token: user.token,
      body: {
        clientUploadId: `client-${crypto.randomUUID()}`,
        fileName: 'big.mp4',
        mimeType: 'video/mp4',
        totalBytes: mp4.byteLength,
      },
    });
    const uploadId = started.body.data.uploadId;

    // Send index 1 first; the server expects index 0.
    const res = await uploadFile(
      baseUrl,
      `/api/media/uploads/${uploadId}/chunk?index=1`,
      'chunk',
      { buffer: mp4.subarray(0, 100), filename: 'c', contentType: 'application/octet-stream' },
      { token: user.token, method: 'PUT' },
    );
    expect(res.status).toBe(409);
  });

  it('refuses a video declared as mp4 whose bytes are an image', async () => {
    const user = await createAccount(baseUrl);
    const png = await makePng(100, 100);
    const res = await uploadFile(baseUrl, '/api/media/videos', 'file', {
      buffer: png,
      filename: 'fake.mp4',
      contentType: 'video/mp4',
    }, { token: user.token });
    expect(res.status).toBe(400);
  });
});

describe('media > authorization', () => {
  it('never exposes a private image to another member, and signs it for the owner', async () => {
    const owner = await createAccount(baseUrl);
    const other = await createAccount(baseUrl);
    const png = await makePng(300, 300);

    const up = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'private.png',
      contentType: 'image/png',
    }, { token: owner.token });
    const asset = up.body.data;
    // Private assets are served through a signed URL, never a public path.
    expect(asset.url).toContain('/api/media/file?');
    expect(asset.url).not.toContain('/uploads/');

    // The owner can read it.
    const mine = await api(baseUrl, 'GET', `/api/media/${asset.id}`, { token: owner.token });
    expect(mine.status).toBe(200);

    // Another member cannot, and gets the same 404 as a missing id.
    const theirs = await api(baseUrl, 'GET', `/api/media/${asset.id}`, { token: other.token });
    expect(theirs.status).toBe(404);
  });

  it('refuses to delete another member’s media', async () => {
    const owner = await createAccount(baseUrl);
    const other = await createAccount(baseUrl);
    const png = await makePng(120, 120);

    const up = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'mine.png',
      contentType: 'image/png',
    }, { token: owner.token });

    const del = await api(baseUrl, 'DELETE', `/api/media/${up.body.data.id}`, { token: other.token });
    expect(del.status).toBe(404);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it('serves a private object through a valid signature and rejects a tampered one', async () => {
    const owner = await createAccount(baseUrl);
    const png = await makePng(150, 150);
    const up = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'signed.png',
      contentType: 'image/png',
    }, { token: owner.token });

    const url = new URL(up.body.data.url, baseUrl);
    const good = await fetch(url);
    expect(good.status).toBe(200);

    // Tampering with the key must invalidate the signature.
    url.searchParams.set('key', `${url.searchParams.get('key')}x`);
    const tampered = await fetch(url);
    expect(tampered.status).toBe(403);
  });

  it('rejects a path-traversal key', async () => {
    const res = await api(baseUrl, 'GET', '/api/media/file?key=../../etc/passwd&expires=9999999999&sig=deadbeefdeadbeef');
    expect(res.status).toBe(403);
  });

  it('never serves a private object from the static /uploads mount', async () => {
    const owner = await createAccount(baseUrl);
    const png = await makePng(200, 200);
    const up = await uploadFile<{ data: any }>(baseUrl, '/api/media/images', 'file', {
      buffer: png,
      filename: 'private.png',
      contentType: 'image/png',
    }, { token: owner.token });

    const record = await prisma.mediaAsset.findUnique({ where: { id: up.body.data.id } });
    // The raw storage path must not be reachable as a permanent public URL.
    const res = await fetch(`${baseUrl}/uploads/${record!.storagePath}`);
    expect(res.status).toBe(404);

    // The signed URL still works.
    const signed = await fetch(new URL(up.body.data.url, baseUrl));
    expect(signed.status).toBe(200);
  });
});

describe('favorites', () => {
  it('adds, lists, checks and removes a favourite, and blocks self-favourites', async () => {
    const me = await createAccount(baseUrl);
    const them = await createAccount(baseUrl);

    const add = await api(baseUrl, 'POST', `/api/favorites/${them.username}`, { token: me.token });
    expect(add.status).toBe(201);

    // Adding twice is idempotent.
    const again = await api(baseUrl, 'POST', `/api/favorites/${them.username}`, { token: me.token });
    expect(again.status).toBe(200);
    expect(await prisma.favorite.count()).toBe(1);

    const list = await api<{ data: any[] }>(baseUrl, 'GET', '/api/favorites', { token: me.token });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].member.username).toBe(them.username);

    const check = await api<{ data: { isFavorite: boolean } }>(
      baseUrl,
      'GET',
      `/api/favorites/${them.username}`,
      { token: me.token },
    );
    expect(check.body.data.isFavorite).toBe(true);

    const self = await api(baseUrl, 'POST', `/api/favorites/${me.username}`, { token: me.token });
    expect(self.status).toBe(400);

    const remove = await api(baseUrl, 'DELETE', `/api/favorites/${them.username}`, { token: me.token });
    expect(remove.status).toBe(204);
    expect(await prisma.favorite.count()).toBe(0);
  });

  it('keeps each member’s favourites private to them', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const c = await createAccount(baseUrl);

    await api(baseUrl, 'POST', `/api/favorites/${c.username}`, { token: a.token });

    const bList = await api<{ data: any[] }>(baseUrl, 'GET', '/api/favorites', { token: b.token });
    expect(bList.body.data).toHaveLength(0);
  });
});

describe('ai conversations', () => {
  it('persists a member’s own conversation and history', async () => {
    const me = await createAccount(baseUrl);

    const createdConv = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: me.token,
      body: { title: 'Learning plan' },
    });
    expect(createdConv.status).toBe(201);
    const id = createdConv.body.data.id;

    // Sending a message saves it, then returns 501 because no model is configured.
    const sent = await api<{ error: { code: string; details: { savedMessageId: string } } }>(
      baseUrl,
      'POST',
      `/api/ai/conversations/${id}/messages`,
      { token: me.token, body: { content: 'Teach me Python' } },
    );
    expect(sent.status).toBe(501);
    expect(sent.body.error.code).toBe('AI_NOT_CONFIGURED');

    const fetched = await api<{ data: { messages: { role: string; content: string }[] } }>(
      baseUrl,
      'GET',
      `/api/ai/conversations/${id}`,
      { token: me.token },
    );
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.messages).toHaveLength(1);
    expect(fetched.body.data.messages[0].content).toBe('Teach me Python');
    expect(fetched.body.data.messages[0].role).toBe('USER');
  });

  it('never lets a member read another member’s AI conversation', async () => {
    const me = await createAccount(baseUrl);
    const other = await createAccount(baseUrl);

    const createdConv = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: me.token,
      body: { title: 'Private' },
    });
    const id = createdConv.body.data.id;

    const theirs = await api(baseUrl, 'GET', `/api/ai/conversations/${id}`, { token: other.token });
    expect(theirs.status).toBe(404);

    const list = await api<{ data: any[] }>(baseUrl, 'GET', '/api/ai/conversations', { token: other.token });
    expect(list.body.data).toHaveLength(0);

    const del = await api(baseUrl, 'DELETE', `/api/ai/conversations/${id}`, { token: other.token });
    expect(del.status).toBe(404);
    expect(await prisma.aiConversation.count()).toBe(1);
  });
});
