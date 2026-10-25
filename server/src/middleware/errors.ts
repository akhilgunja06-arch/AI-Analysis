import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}.`));
}

/**
 * Central error handler. Guarantees:
 *  - one JSON shape for every failure
 *  - 5xx details are never sent to the client
 *  - the full error is logged server-side (with secrets redacted)
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = new ApiError(422, 'VALIDATION_ERROR', 'Some fields need your attention.', {
      issues: err.issues.map((i) => ({ path: i.path.join('.') || '_', message: i.message })),
    });
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
        const fields = Array.isArray(target) ? target.join(', ') : String(target);
        apiError = new ApiError(409, 'DUPLICATE', `That value is already in use (${fields}).`, {
          fields: Array.isArray(target) ? target : [String(target)],
        });
        break;
      }
      case 'P2003':
        apiError = new ApiError(409, 'REFERENCE_ERROR', 'A related record is missing or still in use.');
        break;
      case 'P2025':
        apiError = ApiError.notFound('That record no longer exists.');
        break;
      default:
        apiError = ApiError.internal();
        break;
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    apiError = ApiError.badRequest('The request contained invalid data.');
  } else if (err instanceof Error && err.name === 'MulterError') {
    apiError = ApiError.badRequest(
      err.message.includes('File too large')
        ? `Files must be smaller than ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`
        : 'The file upload could not be processed.',
    );
  } else {
    apiError = ApiError.internal();
  }

  const logMeta = {
    status: apiError.status,
    code: apiError.code,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    ip: req.ip,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  };

  if (apiError.status >= 500) logger.error('request_failed', logMeta);
  else logger.warn('request_rejected', logMeta);

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
    },
  });
}

/** Rejects browser cross-origin state changes that do not come from an allowed origin. */
export function csrfOriginGuard(req: Request, _res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = req.headers.origin;
  // Requests without an Origin header (curl, server-to-server, tests) are allowed;
  // the bearer-token requirement is what actually protects them.
  if (!origin) return next();
  if (env.corsOrigins.includes(origin)) return next();

  return next(ApiError.forbidden('Requests from this origin are not allowed.'));
}

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, _res, next) => next(ApiError.tooMany()),
});

/** Stricter limiter for credential endpoints to blunt brute-force attempts. */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  keyGenerator: (req) => `${req.ip ?? 'unknown'}:${String(req.body?.email ?? '').toLowerCase()}`,
  handler: (_req, _res, next) =>
    next(ApiError.tooMany('Too many attempts. Please wait a few minutes and try again.')),
});

/** Limits content creation to slow down spam and flooding. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, _res, next) => next(ApiError.tooMany('You are posting too quickly. Please slow down.')),
});
