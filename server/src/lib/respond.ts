import type { Response } from 'express';

/**
 * Every successful API response uses the same envelope:
 *   { "data": ..., "meta": { ... } }
 * Errors use:
 *   { "error": { "code", "message", "details" } }
 */

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>) {
  return res.status(status).json(meta ? { data, meta } : { data });
}

export function created<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return ok(res, data, 201, meta);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  extraMeta: Record<string, unknown> = {},
) {
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const meta: PaginationMeta & Record<string, unknown> = {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    ...extraMeta,
  };
  return res.status(200).json({ data: items, meta });
}

export function parsePagination(
  query: Record<string, unknown>,
  defaults: { pageSize?: number; maxPageSize?: number } = {},
): { page: number; pageSize: number; skip: number; take: number } {
  const maxPageSize = defaults.maxPageSize ?? 50;
  const defPageSize = defaults.pageSize ?? 12;

  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const requested = Number.parseInt(String(query.pageSize ?? defPageSize), 10) || defPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, requested));

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
