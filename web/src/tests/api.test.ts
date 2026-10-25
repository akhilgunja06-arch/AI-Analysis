import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, assetUrl, request, setAccessToken } from '@/lib/api';

/** Minimal fetch double that records calls and returns scripted responses. */
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('unwraps the { data } envelope and keeps pagination meta', async () => {
    mockFetch(() => jsonResponse({ data: [{ id: 'a' }], meta: { page: 2, pageSize: 10, total: 21, totalPages: 3, hasNext: true, hasPrev: true } }));

    const result = await request<{ id: string }[]>('/skills');

    expect(result.data).toEqual([{ id: 'a' }]);
    expect(result.meta?.page).toBe(2);
  });

  it('returns the raw payload when there is no envelope', async () => {
    mockFetch(() => jsonResponse([1, 2, 3]));
    const result = await request<number[]>('/plain');
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('attaches the bearer token only while one is set', async () => {
    const calls = mockFetch(() => jsonResponse({ data: null }));

    await request('/first');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();

    setAccessToken('token-123');
    await request('/second');
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
  });

  it('always sends credentials so the refresh cookie travels', async () => {
    const calls = mockFetch(() => jsonResponse({ data: null }));
    await request('/anything');
    expect(calls[0]!.init.credentials).toBe('include');
  });

  it('serialises a JSON body and sets the content type', async () => {
    const calls = mockFetch(() => jsonResponse({ data: null }));
    await request('/things', { method: 'POST', body: { name: 'Python' } });

    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.body).toBe(JSON.stringify({ name: 'Python' }));
    expect((calls[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('encodes query parameters, dropping empty values', async () => {
    const calls = mockFetch(() => jsonResponse({ data: null }));
    await request('/members', { query: { search: 'react hooks', page: 3, status: undefined, sort: '' } });

    const url = new URL(calls[0]!.url, 'http://localhost');
    expect(url.searchParams.get('search')).toBe('react hooks');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.has('status')).toBe(false);
  });

  it('turns a server error envelope into an ApiError with the server message', async () => {
    mockFetch(() => jsonResponse({ error: { code: 'FORBIDDEN', message: 'You are not part of this exchange.' } }, 403));

    await expect(request('/exchanges/1')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'You are not part of this exchange.',
    });
  });

  it('exposes validation issues for rendering next to inputs', async () => {
    mockFetch(() =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please check the highlighted fields.',
            details: { issues: [{ path: 'email', message: 'That email address is already registered.' }] },
          },
        },
        422,
      ),
    );

    try {
      await request('/auth/register', { method: 'POST', body: {} });
      throw new Error('expected the request to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.isValidation).toBe(true);
      expect(apiError.issues).toEqual([
        { path: 'email', message: 'That email address is already registered.' },
      ]);
    }
  });

  it('reports a network failure as a retryable ApiError rather than throwing raw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const err = await request('/members').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetworkError).toBe(true);
    expect((err as ApiError).status).toBe(0);
  });

  it('refreshes once on a 401 and replays the original request', async () => {
    let attempts = 0;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ data: { accessToken: 'fresh-token', user: { id: 'u1' } } });
      }
      attempts += 1;
      if (attempts === 1) return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired.' } }, 401);
      return jsonResponse({ data: { ok: true } });
    });

    const result = await request<{ ok: boolean }>('/dashboard');

    expect(result.data).toEqual({ ok: true });
    expect(calls.some((call) => call.url.includes('/auth/refresh'))).toBe(true);
    // The replay carries the newly issued token.
    const replay = calls[calls.length - 1]!;
    expect((replay.init.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  it('does not attempt a refresh when the caller opts out', async () => {
    const calls = mockFetch(() => jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'No.' } }, 401));

    await expect(request('/auth/login', { method: 'POST', skipRefresh: true })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).not.toContain('/auth/refresh');
  });

  it('builds absolute asset URLs for uploaded files', () => {
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl('/uploads/avatars/a.png')).toContain('/uploads/avatars/a.png');
    expect(assetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });
});
