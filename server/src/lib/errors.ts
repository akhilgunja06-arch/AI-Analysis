/**
 * Canonical API error type and the single place where HTTP status codes,
 * machine-readable codes, and client-safe messages are decided.
 *
 * `details` is always safe to show a user — never put secrets or stack traces in it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'The request could not be processed.', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication is required.', details?: unknown) {
    return new ApiError(401, 'UNAUTHORIZED', message, details);
  }
  static forbidden(message = 'You do not have permission to perform this action.', details?: unknown) {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }
  static notFound(message = 'The requested resource was not found.', details?: unknown) {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }
  static conflict(message = 'That action conflicts with the current state.', details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static unprocessable(message = 'The submitted data is invalid.', details?: unknown) {
    return new ApiError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }
  static tooMany(message = 'Too many requests. Please slow down.', details?: unknown) {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }
  static notImplemented(message = 'This optional integration is not configured.', details?: unknown) {
    return new ApiError(501, 'NOT_IMPLEMENTED', message, details);
  }
  static internal(message = 'Something went wrong on our side.', details?: unknown) {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  }
}

/** Field-level validation problems, shaped for direct rendering by the frontend. */
export type FieldIssue = { path: string; message: string };

export function validationError(issues: FieldIssue[]): ApiError {
  return new ApiError(422, 'VALIDATION_ERROR', 'Some fields need your attention.', { issues });
}
