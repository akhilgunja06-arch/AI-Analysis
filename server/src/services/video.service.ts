import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { ApiError } from '../lib/errors';

const execFileAsync = promisify(execFile);

/**
 * Video handling.
 *
 * The original video is never re-encoded. The exact bytes that arrive are what
 * gets stored: no resolution change, no bitrate change, no frame-rate change and
 * no container conversion. `ffprobe` is used only to *read* metadata, and
 * `ffmpeg` only to extract a separate poster frame — neither writes over the
 * original.
 *
 * A SHA-256 of the uploaded bytes is recorded so integrity can be re-verified
 * after storage (see verifyVideoIntegrity).
 */

export type VideoMetadata = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitRate: number | null;
  codec: string | null;
};

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  duration?: string;
};

type FfprobeResult = {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string; format_name?: string };
};

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [num, den] = value.split('/').map(Number);
  if (!num || !den || !Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : null;
}

/** Reads video metadata with ffprobe. Returns nulls when ffprobe is unavailable. */
export async function probeVideo(input: Buffer): Promise<VideoMetadata> {
  const tmp = path.join(os.tmpdir(), `ss-probe-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(tmp, input);
    const { stdout } = await execFileAsync(
      env.FFPROBE_PATH,
      [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        tmp,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    );
    const parsed = JSON.parse(stdout) as FfprobeResult;
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    const duration = Number(parsed.format?.duration ?? video?.duration ?? NaN);
    const bitRate = Number(parsed.format?.bit_rate ?? video?.bit_rate ?? NaN);

    return {
      durationSeconds: Number.isFinite(duration) ? Math.round(duration * 1000) / 1000 : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      frameRate: parseFrameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
      bitRate: Number.isFinite(bitRate) ? Math.round(bitRate) : null,
      codec: video?.codec_type ? (video as { codec_name?: string }).codec_name ?? null : null,
    };
  } catch (err) {
    logger.warn('video.probe_failed', { err: (err as Error).message });
    return { durationSeconds: null, width: null, height: null, frameRate: null, bitRate: null, codec: null };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Extracts a single poster frame from the original without altering it. The
 * frame is captured one second in (or at 0 for very short clips).
 */
export async function extractVideoThumbnail(input: Buffer, durationSeconds: number | null): Promise<Buffer | null> {
  const tmpIn = path.join(os.tmpdir(), `ss-vid-${crypto.randomUUID()}`);
  const tmpOut = path.join(os.tmpdir(), `ss-thumb-${crypto.randomUUID()}.jpg`);
  try {
    await fs.writeFile(tmpIn, input);
    const seek = durationSeconds && durationSeconds > 2 ? '1' : '0';
    await execFileAsync(
      env.FFPROBE_PATH.replace(/ffprobe$/, 'ffmpeg'),
      [
        '-v', 'error',
        '-ss', seek,
        '-i', tmpIn,
        '-frames:v', '1',
        '-vf', 'scale=400:-2',
        '-q:v', '4',
        '-y', tmpOut,
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    );
    return await fs.readFile(tmpOut);
  } catch (err) {
    logger.warn('video.thumbnail_failed', { err: (err as Error).message });
    return null;
  } finally {
    await fs.rm(tmpIn, { force: true });
    await fs.rm(tmpOut, { force: true });
  }
}

/**
 * Validates a video against the configured limits. Duration is only enforced
 * when it could be determined; an unreadable duration is not treated as zero.
 */
export function assertVideoWithinLimits(meta: VideoMetadata, sizeBytes: number): void {
  if (sizeBytes > env.MAX_VIDEO_UPLOAD_BYTES) {
    throw ApiError.badRequest(
      `Videos are limited to ${Math.round(env.MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    );
  }
  if (meta.durationSeconds !== null && meta.durationSeconds > env.MAX_VIDEO_DURATION_SECONDS) {
    throw ApiError.badRequest(
      `Videos are limited to ${env.MAX_VIDEO_DURATION_SECONDS} seconds.`,
    );
  }
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
