import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { validationError } from './errors';

/**
 * Wraps an async handler so rejected promises reach the error middleware
 * instead of becoming unhandled rejections.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function toIssues(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || '_',
    message: issue.message,
  }));
}

/** Validates `req.body`, replacing it with the parsed (and coerced) value. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(validationError(toIssues(result.error)));
    req.body = result.data as z.infer<T>;
    return next();
  };
}

/** Validates `req.query`. The parsed value is stored on `res.locals.query`. */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(validationError(toIssues(result.error)));
    res.locals.query = result.data;
    return next();
  };
}

/** Validates `req.params`, stored on `res.locals.params`. */
export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(validationError(toIssues(result.error)));
    res.locals.params = result.data;
    return next();
  };
}

/** Typed accessors for the validated values above. */
export function q<T extends ZodTypeAny>(res: Response, _schema?: T): z.infer<T> {
  return res.locals.query as z.infer<T>;
}
export function p<T extends ZodTypeAny>(res: Response, _schema?: T): z.infer<T> {
  return res.locals.params as z.infer<T>;
}
