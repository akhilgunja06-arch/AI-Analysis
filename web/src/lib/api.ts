/**
 * Typed API client.
 *
 * Responsibilities:
 *  - one place that knows the response envelope ({ data, meta } / { error })
 *  - one place that turns a failure into a usable ApiError
 *  - automatic single retry through POST /auth/refresh when the access token has
 *    expired, then replay of the original request
 *  - no secrets are ever read from or written to localStorage: the refresh token
 *    lives in an httpOnly cookie, the access token only in memory
 */

// Defaults to a same-origin path so the dev server proxy (and any reverse proxy
// in front of a build) can forward /api to the backend without the browser
// needing to know the API's host. Set VITE_API_URL when they live apart.
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export type ApiFieldIssue = { path: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isNetworkError: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isNetworkError = isNetworkError;
  }

  /** Field-level problems, for rendering next to inputs. */
  get issues(): ApiFieldIssue[] {
    const details = this.details as { issues?: ApiFieldIssue[] } | undefined;
    return details?.issues ?? [];
  }

  get isValidation() {
    return this.code === 'VALIDATION_ERROR' || this.status === 422;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isRateLimited() {
    return this.status === 429;
  }
  get isNotImplemented() {
    return this.status === 501;
  }
}

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  [key: string]: unknown;
};

export type ApiResult<T> = { data: T; meta?: PaginationMeta };

// ---------------------------------------------------------------- token store

/**
 * The access token is held in memory only. It is deliberately not persisted, so
 * an XSS foothold cannot read a long-lived credential out of storage. Sessions
 * survive a reload because the refresh cookie is httpOnly and rotated on use.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

// -------------------------------------------------------------------- core

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry (used by the refresh call itself). */
  skipRefresh?: boolean;
  /** Send FormData instead of JSON. */
  formData?: FormData;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('http') ? path : `${API_URL}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(res: Response, payload: unknown): ApiError {
  const envelope = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
  const error = envelope?.error;
  return new ApiError(
    res.status,
    error?.code ?? `HTTP_${res.status}`,
    error?.message ?? defaultMessage(res.status),
    error?.details,
  );
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return 'The request could not be processed.';
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You do not have permission to do that.';
    case 404:
      return 'We could not find what you were looking for.';
    case 409:
      return 'That action conflicts with the current state.';
    case 429:
      return 'Too many requests. Please slow down and try again shortly.';
    case 501:
      return 'This optional integration is not configured on this deployment.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

async function attemptRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const payload = (await parseBody(res)) as { data?: { accessToken?: string } } | null;
      const token = payload?.data?.accessToken;
      if (!token) return false;
      accessToken = token;
      return true;
    } catch {
      return false;
    } finally {
      // Allow a later request to try again once this one settles.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body,
    // Required for the httpOnly refresh cookie.
    credentials: 'include',
    signal: options.signal,
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  let res: Response;

  try {
    res = await rawRequest(path, options);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'We could not reach the server. Check your connection and try again.',
      undefined,
      true,
    );
  }

  // Expired access token: refresh once, then replay the original request.
  if (res.status === 401 && !options.skipRefresh) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      try {
        res = await rawRequest(path, options);
      } catch {
        throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach the server.', undefined, true);
      }
    } else {
      accessToken = null;
      onUnauthenticated?.();
      throw toApiError(res, await parseBody(res));
    }
  }

  const payload = await parseBody(res);

  if (!res.ok) {
    if (res.status === 401) {
      accessToken = null;
      onUnauthenticated?.();
    }
    throw toApiError(res, payload);
  }

  const envelope = payload as { data?: T; meta?: PaginationMeta } | null;
  if (envelope && typeof envelope === 'object' && 'data' in envelope) {
    return { data: envelope.data as T, meta: envelope.meta };
  }
  return { data: payload as T };
}

/** Convenience wrappers. */
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
};

/** Attempts to restore a session on boot using the refresh cookie. */
export async function bootstrapSession(): Promise<boolean> {
  return attemptRefresh();
}

/** Absolute URL for an upload path returned by the API. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const origin = API_URL.replace(/\/api\/?$/, '');
  return `${origin}${path}`;
}
