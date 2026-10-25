import { PrismaClient } from '@prisma/client';

/**
 * Shared test helpers: a Prisma client bound to the test database and a small
 * factory for creating accounts through the real HTTP API, so tests exercise
 * the same code paths a browser would.
 */

export const prisma = new PrismaClient();

export const TEST_PASSWORD = 'TestPassword#2026';

let counter = 0;
export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

export type TestAccount = {
  id: string;
  email: string;
  username: string;
  token: string;
  cookies: string[];
};

type ApiResponse<T> = { status: number; body: T; cookies: string[] };

export async function api<T = any>(
  baseUrl: string,
  method: string,
  path: string,
  options: { body?: unknown; token?: string; cookies?: string[] } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookies?.length) headers.Cookie = options.cookies.join('; ');

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: res.status, body: body as T, cookies: setCookie };
}

/**
 * Registers a member through the API, verifies their email with the token the
 * API returns in non-production, and returns a usable access token.
 */
export async function createAccount(
  baseUrl: string,
  overrides: { displayName?: string; role?: 'MEMBER' | 'MODERATOR' | 'ADMIN'; verify?: boolean } = {},
): Promise<TestAccount> {
  const suffix = uniqueSuffix();
  const email = `test-${suffix}@example.com`;
  const username = `test${suffix}`.slice(0, 30).toLowerCase();

  const registered = await api<{
    data: { user: { id: string }; accessToken: string; devVerificationToken?: string };
  }>(baseUrl, 'POST', '/api/auth/register', {
    body: {
      email,
      username,
      password: TEST_PASSWORD,
      displayName: overrides.displayName ?? `Test ${suffix}`,
      acceptedTerms: true,
    },
  });

  if (registered.status !== 201) {
    throw new Error(`Registration failed: ${registered.status} ${JSON.stringify(registered.body)}`);
  }

  const { user, accessToken, devVerificationToken } = registered.body.data;

  if (overrides.verify !== false && devVerificationToken) {
    const verified = await api(baseUrl, 'POST', '/api/auth/verify-email', {
      body: { token: devVerificationToken },
    });
    if (verified.status !== 200) {
      throw new Error(`Verification failed: ${JSON.stringify(verified.body)}`);
    }
  }

  if (overrides.role && overrides.role !== 'MEMBER') {
    await prisma.user.update({ where: { id: user.id }, data: { role: overrides.role } });
  }

  // Re-login so the token carries the updated role, then read it from the DB.
  const login = await api<{ data: { accessToken: string } }>(baseUrl, 'POST', '/api/auth/login', {
    body: { email, password: TEST_PASSWORD },
  });
  if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);

  return {
    id: user.id,
    email,
    username,
    token: login.body.data.accessToken ?? accessToken,
    cookies: login.cookies,
  };
}

/** Adds a skill to a member's teach or learn list. */
export async function addSkill(
  baseUrl: string,
  account: TestAccount,
  skillId: string,
  direction: 'TEACH' | 'LEARN',
  level = 'INTERMEDIATE',
) {
  const res = await api(baseUrl, 'POST', '/api/skills/mine', {
    token: account.token,
    body: { skillId, direction, level },
  });
  if (res.status !== 201) {
    throw new Error(`addSkill failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/** Creates a taxonomy category + skill directly, for tests that need a clean slate. */
export async function createSkill(baseUrl: string, admin: TestAccount, name: string): Promise<string> {
  const categorySlug = `test-category-${uniqueSuffix()}`;
  const category = await prisma.skillCategory.create({
    data: { slug: categorySlug, name: `Test Category ${categorySlug}`, sortOrder: 999 },
  });
  const res = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/skills', {
    token: admin.token,
    body: { name: `${name} ${uniqueSuffix()}`, categoryId: category.id },
  });
  if (res.status !== 201) throw new Error(`createSkill failed: ${JSON.stringify(res.body)}`);
  return res.body.data.id;
}

/** Wipes every table. Order matters for foreign keys, though cascades help. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "SupportTicket", "UserBlock", "Report",
      "CommunityCommentVote", "CommunityPostVote", "CommunityComment", "CommunityPost",
      "Follow", "Review", "Notification",
      "Message", "ConversationParticipant", "Conversation",
      "ExchangeEvent", "ExchangeNote", "Milestone", "Session", "ExchangeParticipant",
      "ExchangeRequest", "Exchange",
      "Availability", "UserSkill", "Skill", "SkillCategory",
      "AuthToken", "AuthSession", "UserPreference", "Profile", "User"
    RESTART IDENTITY CASCADE;
  `);
}
