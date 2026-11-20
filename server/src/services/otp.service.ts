import crypto from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ApiError } from '../lib/errors';
import { sha256 } from '../lib/auth';
import { sendOtpEmail } from './email.service';

/**
 * Email one-time codes for account verification.
 *
 * Security properties:
 *  - the six-digit code is generated with crypto.randomInt, never Math.random;
 *  - only a hash of the code is stored, so a database read does not reveal it;
 *  - a code expires after OTP_TTL_SECONDS (five minutes by default);
 *  - a code is single-use and tracks attempts, so guessing is bounded;
 *  - issuing a new code invalidates any outstanding one for that purpose;
 *  - a resend cooldown stops a member from being flooded with mail;
 *  - the code is never logged and never returned in an API response.
 */

function hashCode(userId: string, code: string): string {
  // Bound to the user id so a hash from one account cannot be replayed on another.
  return sha256(`${userId}:${code}:${env.PASSWORD_PEPPER}`);
}

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export type IssueOtpResult = {
  delivered: boolean;
  /** Only ever populated in non-production, so tests and local runs work. */
  devCode?: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

/**
 * Issues a fresh code for the given purpose and emails it.
 * Throws a 429 when the resend cooldown has not elapsed.
 */
export async function issueEmailOtp(params: {
  userId: string;
  email: string;
  displayName: string;
  purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}): Promise<IssueOtpResult> {
  const purpose = params.purpose ?? 'EMAIL_VERIFICATION';

  const latest = await prisma.otpCode.findFirst({
    where: { userId: params.userId, purpose, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    const remaining = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsed);
    if (remaining > 0) {
      throw new ApiError(
        429,
        'OTP_RESEND_TOO_SOON',
        `Please wait ${remaining} seconds before requesting another code.`,
        { retryAfterSeconds: remaining },
      );
    }
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  await prisma.$transaction([
    // Supersede anything outstanding for this purpose.
    prisma.otpCode.updateMany({
      where: { userId: params.userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: {
        userId: params.userId,
        purpose,
        destination: params.email.toLowerCase(),
        codeHash: hashCode(params.userId, code),
        expiresAt,
      },
    }),
  ]);

  const delivery = await sendOtpEmail(params.email, params.displayName, code, env.OTP_TTL_SECONDS);

  return {
    delivered: delivery.delivered,
    ...(env.isProd ? {} : { devCode: code }),
    expiresInSeconds: env.OTP_TTL_SECONDS,
    resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export type VerifyOtpResult = { verified: true; userId: string };

/**
 * Verifies and consumes a code without applying any account change, so callers
 * decide what the verified code authorises. Wrong codes increment the attempt
 * counter and lock the code once OTP_MAX_ATTEMPTS is reached.
 */
export async function consumeEmailOtp(params: {
  userId: string;
  code: string;
  purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}): Promise<void> {
  const purpose = params.purpose ?? 'EMAIL_VERIFICATION';
  const code = params.code.trim();

  if (!/^\d{6}$/.test(code)) {
    throw ApiError.badRequest('Enter the six-digit code from your email.');
  }

  const record = await prisma.otpCode.findFirst({
    where: { userId: params.userId, purpose, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true, expiresAt: true, attempts: true },
  });

  if (!record) {
    throw ApiError.badRequest('That code is not valid. Request a new one.');
  }
  if (record.expiresAt < new Date()) {
    throw ApiError.badRequest('That code has expired. Request a new one.');
  }
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(params.userId, code), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = env.OTP_MAX_ATTEMPTS - record.attempts - 1;
    throw ApiError.badRequest(
      remaining > 0
        ? `That code is not correct. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
        : 'That code is not correct and no attempts remain. Request a new code.',
    );
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  logger.info('otp.verified', { userId: params.userId, purpose });
}

/** Verifies a code and activates the account. */
export async function verifyEmailOtp(params: {
  userId: string;
  code: string;
  purpose?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}): Promise<VerifyOtpResult> {
  await consumeEmailOtp({ ...params, purpose: 'EMAIL_VERIFICATION' });
  await prisma.user.update({
    where: { id: params.userId },
    data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
  });
  return { verified: true, userId: params.userId };
}

/** Removes expired rows. Called opportunistically; never required for correctness. */
export async function pruneExpiredOtps(): Promise<void> {
  try {
    await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  } catch (err) {
    logger.debug('otp.prune_failed', { err });
  }
}
