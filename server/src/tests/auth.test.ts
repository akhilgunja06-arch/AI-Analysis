import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { api, createAccount, resetDatabase, TEST_PASSWORD, uniqueSuffix } from './helpers';

/**
 * Authentication and authorisation.
 *
 * These run against a real HTTP server and a real PostgreSQL database — no
 * mocks — so the middleware chain, the database constraints and the password
 * hashing are all genuinely exercised.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await resetDatabase();
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

describe('registration', () => {
  it('creates an account, hashes the password, and never returns the hash', async () => {
    const suffix = uniqueSuffix();
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `reg-${suffix}@example.com`,
        username: `reg${suffix}`,
        password: TEST_PASSWORD,
        displayName: 'Registration Test',
        acceptedTerms: true,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.username).toBe(`reg${suffix}`);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);

    const stored = await prisma.user.findUnique({
      where: { email: `reg-${suffix}@example.com` },
      select: { passwordHash: true, status: true },
    });
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toContain(TEST_PASSWORD);
    expect(stored?.passwordHash.startsWith('$2')).toBe(true);
    // Unverified until the email link is used.
    expect(stored?.status).toBe('PENDING_VERIFICATION');
  });

  it('normalises the email to lower case and stores the username lower case', async () => {
    const suffix = uniqueSuffix();
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `MiXeD-${suffix}@Example.COM`,
        username: `MiXeD${suffix}`,
        password: TEST_PASSWORD,
        displayName: 'Mixed Case',
        acceptedTerms: true,
      },
    });
    expect(res.status).toBe(201);
    const stored = await prisma.user.findUnique({ where: { username: `mixed${suffix}`.toLowerCase() } });
    expect(stored?.email).toBe(`mixed-${suffix}@example.com`);
  });

  it('rejects a weak password with field-level details', async () => {
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `weak-${uniqueSuffix()}@example.com`,
        username: `weak${uniqueSuffix()}`,
        password: 'password',
        displayName: 'Weak',
        acceptedTerms: true,
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details.issues as { path: string }[]).map((i) => i.path);
    expect(paths).toContain('password');
  });

  it('rejects registration without accepting the terms', async () => {
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `noterms-${uniqueSuffix()}@example.com`,
        username: `noterms${uniqueSuffix()}`,
        password: TEST_PASSWORD,
        displayName: 'No Terms',
        acceptedTerms: false,
      },
    });
    expect(res.status).toBe(422);
  });

  it('refuses a duplicate email and reports which field clashed', async () => {
    const account = await createAccount(baseUrl);
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: account.email,
        username: `different${uniqueSuffix()}`,
        password: TEST_PASSWORD,
        displayName: 'Duplicate',
        acceptedTerms: true,
      },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields).toContain('email');
  });

  it('refuses a reserved username', async () => {
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `reserved-${uniqueSuffix()}@example.com`,
        username: 'admin',
        password: TEST_PASSWORD,
        displayName: 'Reserved',
        acceptedTerms: true,
      },
    });
    expect(res.status).toBe(422);
  });
});

describe('login', () => {
  it('signs in with correct credentials and sets an httpOnly refresh cookie', async () => {
    const account = await createAccount(baseUrl);
    const res = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: TEST_PASSWORD },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const refresh = res.cookies.find((c) => c.startsWith('ss_refresh='));
    expect(refresh).toBeTruthy();
    expect(refresh).toContain('HttpOnly');
  });

  it('returns the same error for an unknown email and a wrong password', async () => {
    const account = await createAccount(baseUrl);

    const wrongPassword = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: 'WrongPassword#2026' },
    });
    const unknownEmail = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: `nobody-${uniqueSuffix()}@example.com`, password: TEST_PASSWORD },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('does not leak whether an account exists via the forgot-password endpoint', async () => {
    const account = await createAccount(baseUrl);
    const known = await api(baseUrl, 'POST', '/api/auth/forgot-password', { body: { email: account.email } });
    const unknown = await api(baseUrl, 'POST', '/api/auth/forgot-password', {
      body: { email: `ghost-${uniqueSuffix()}@example.com` },
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.data.message).toBe(unknown.body.data.message);
  });
});

describe('email verification', () => {
  it('activates the account and rejects a reused token', async () => {
    const suffix = uniqueSuffix();
    const registered = await api<{ data: { user: { id: string }; devVerificationToken: string } }>(
      baseUrl,
      'POST',
      '/api/auth/register',
      {
        body: {
          email: `verify-${suffix}@example.com`,
          username: `verify${suffix}`,
          password: TEST_PASSWORD,
          displayName: 'Verify Me',
          acceptedTerms: true,
        },
      },
    );

    const token = registered.body.data.devVerificationToken;
    const first = await api(baseUrl, 'POST', '/api/auth/verify-email', { body: { token } });
    expect(first.status).toBe(200);

    const user = await prisma.user.findUnique({
      where: { id: registered.body.data.user.id },
      select: { status: true, emailVerifiedAt: true },
    });
    expect(user?.status).toBe('ACTIVE');
    expect(user?.emailVerifiedAt).toBeTruthy();

    // Single use only.
    const second = await api(baseUrl, 'POST', '/api/auth/verify-email', { body: { token } });
    expect(second.status).toBe(400);
  });

  it('rejects a forged token', async () => {
    const res = await api(baseUrl, 'POST', '/api/auth/verify-email', {
      body: { token: 'definitely-not-a-real-token-value' },
    });
    expect(res.status).toBe(400);
  });
});

describe('password reset', () => {
  it('resets the password and invalidates existing sessions', async () => {
    const account = await createAccount(baseUrl);

    const forgot = await api<{ data: { devResetToken: string } }>(baseUrl, 'POST', '/api/auth/forgot-password', {
      body: { email: account.email },
    });
    expect(forgot.status).toBe(200);
    const resetToken = forgot.body.data.devResetToken;
    expect(resetToken).toBeTruthy();

    const newPassword = 'BrandNewPassword#2026';
    const reset = await api(baseUrl, 'POST', '/api/auth/reset-password', {
      body: { token: resetToken, password: newPassword },
    });
    expect(reset.status).toBe(200);

    // The old token is spent.
    const reuse = await api(baseUrl, 'POST', '/api/auth/reset-password', {
      body: { token: resetToken, password: 'AnotherPassword#2026' },
    });
    expect(reuse.status).toBe(400);

    // The old access token no longer works because every session was revoked.
    const withOldToken = await api(baseUrl, 'GET', '/api/auth/me', { token: account.token });
    expect(withOldToken.status).toBe(401);

    // The old password no longer works; the new one does.
    const oldLogin = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: TEST_PASSWORD },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: newPassword },
    });
    expect(newLogin.status).toBe(200);
  });

  it('refuses to reset with a weak password', async () => {
    const account = await createAccount(baseUrl);
    const forgot = await api<{ data: { devResetToken: string } }>(baseUrl, 'POST', '/api/auth/forgot-password', {
      body: { email: account.email },
    });
    const res = await api(baseUrl, 'POST', '/api/auth/reset-password', {
      body: { token: forgot.body.data.devResetToken, password: 'weak' },
    });
    expect(res.status).toBe(422);
  });
});

describe('session management', () => {
  it('rejects requests with no token, a malformed token, or a revoked session', async () => {
    expect((await api(baseUrl, 'GET', '/api/auth/me')).status).toBe(401);
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: 'not-a-jwt' })).status).toBe(401);

    const account = await createAccount(baseUrl);
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: account.token })).status).toBe(200);

    const logout = await api(baseUrl, 'POST', '/api/auth/logout', {
      token: account.token,
      cookies: account.cookies,
    });
    expect(logout.status).toBe(204);

    // The session row is revoked, so the still-valid JWT is refused.
    const afterLogout = await api(baseUrl, 'GET', '/api/auth/me', { token: account.token });
    expect(afterLogout.status).toBe(401);
  });

  it('rotates the refresh token and refuses the old one', async () => {
    const account = await createAccount(baseUrl);
    const login = await api<{ data: { accessToken: string } }>(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: TEST_PASSWORD },
    });
    const originalCookies = login.cookies;

    const first = await api(baseUrl, 'POST', '/api/auth/refresh', { cookies: originalCookies });
    expect(first.status).toBe(200);
    expect(first.cookies.length).toBeGreaterThan(0);

    // Replaying the original cookie must fail, because it was rotated away.
    const replay = await api(baseUrl, 'POST', '/api/auth/refresh', { cookies: originalCookies });
    expect(replay.status).toBe(401);
  });

  it('lists sessions and revokes a single one', async () => {
    const account = await createAccount(baseUrl);
    const second = await api<{ data: { accessToken: string } }>(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: TEST_PASSWORD },
    });

    const listed = await api<{ data: { sessions: { id: string; current: boolean }[] } }>(
      baseUrl,
      'GET',
      '/api/auth/sessions',
      { token: second.body.data.accessToken },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data.sessions.length).toBeGreaterThanOrEqual(2);

    const other = listed.body.data.sessions.find((s) => !s.current);
    expect(other).toBeTruthy();

    const revoked = await api(baseUrl, 'DELETE', `/api/auth/sessions/${other!.id}`, {
      token: second.body.data.accessToken,
    });
    expect(revoked.status).toBe(200);
  });
});

describe('password change', () => {
  it('requires the current password and revokes other sessions', async () => {
    const account = await createAccount(baseUrl);
    const otherSession = await api<{ data: { accessToken: string } }>(baseUrl, 'POST', '/api/auth/login', {
      body: { email: account.email, password: TEST_PASSWORD },
    });

    const wrong = await api(baseUrl, 'PATCH', '/api/settings/password', {
      token: account.token,
      body: { currentPassword: 'NotMyPassword#2026', newPassword: 'Different#2026Aa' },
    });
    expect(wrong.status).toBe(401);

    const changed = await api(baseUrl, 'PATCH', '/api/settings/password', {
      token: account.token,
      body: { currentPassword: TEST_PASSWORD, newPassword: 'Different#2026Aa' },
    });
    expect(changed.status).toBe(200);

    // The other session was revoked, this one still works.
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: otherSession.body.data.accessToken })).status).toBe(401);
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: account.token })).status).toBe(200);
  });

  it('refuses reusing the same password', async () => {
    const account = await createAccount(baseUrl);
    const res = await api(baseUrl, 'PATCH', '/api/settings/password', {
      token: account.token,
      body: { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD },
    });
    expect(res.status).toBe(422);
  });
});

describe('unverified accounts', () => {
  it('can read their profile but cannot send exchange requests', async () => {
    const unverified = await createAccount(baseUrl, { verify: false });
    const target = await createAccount(baseUrl);

    expect((await api(baseUrl, 'GET', '/api/profile', { token: unverified.token })).status).toBe(200);

    const blocked = await api(baseUrl, 'POST', '/api/exchanges/requests', {
      token: unverified.token,
      body: { recipientId: target.id },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details?.reason).toBe('EMAIL_NOT_VERIFIED');
  });
});
