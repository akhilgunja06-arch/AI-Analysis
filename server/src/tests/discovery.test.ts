import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { api, createAccount, resetDatabase, type TestAccount } from './helpers';

/**
 * Member search, location sharing and the learning agent.
 *
 * These run against a real server and a real database, so the consent rules,
 * the coordinate rounding and the block filters are exercised as shipped.
 */

let server: Server;
let baseUrl: string;
let alice: TestAccount;
let bob: TestAccount;
let blocked: TestAccount;

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

  const category = await prisma.skillCategory.create({
    data: { name: 'Test Category', slug: 'test-category', description: 'Fixtures for these tests' },
  });
  await prisma.skill.createMany({
    data: [
      { name: 'Test Python', slug: 'test-python', categoryId: category.id },
      { name: 'Test Speaking', slug: 'test-speaking', categoryId: category.id },
    ],
  });

  alice = await createAccount(baseUrl, { displayName: 'Alice Search' });
  bob = await createAccount(baseUrl, { displayName: 'Bob Search' });
  blocked = await createAccount(baseUrl, { displayName: 'Blocked Search' });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('GET /api/members/search', () => {
  it('requires authentication', async () => {
    const res = await api(baseUrl, 'GET', '/api/members/search?q=alice');
    expect(res.status).toBe(401);
  });

  it('finds a member by username', async () => {
    const res = await api(baseUrl, 'GET', `/api/members/search?q=${alice.username}`, {
      token: bob.token,
    });
    expect(res.status).toBe(200);
    const results = res.body.data as { username: string }[];
    expect(results.some((row) => row.username === alice.username)).toBe(true);
  });

  it('never exposes an email address', async () => {
    const res = await api(baseUrl, 'GET', `/api/members/search?q=${alice.username}`, {
      token: bob.token,
    });
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('@example.com');
    expect(serialised).not.toContain('passwordHash');
  });

  it('omits members the caller has blocked', async () => {
    await prisma.userBlock.create({
      data: { blockerId: bob.id, blockedId: blocked.id, reason: 'test' },
    });

    const res = await api(baseUrl, 'GET', `/api/members/search?q=${blocked.username}`, {
      token: bob.token,
    });
    expect(res.status).toBe(200);
    const results = res.body.data as { username: string }[];
    expect(results.some((row) => row.username === blocked.username)).toBe(false);
  });

  it('rejects an empty query', async () => {
    const res = await api(baseUrl, 'GET', '/api/members/search?q=', { token: bob.token });
    expect(res.status).toBe(422);
  });
});

describe('location sharing', () => {
  it('refuses to save a point without consent', async () => {
    const res = await api(baseUrl, 'PUT', '/api/location/me', {
      token: alice.token,
      body: { latitude: 17.385, longitude: 78.486, sharingEnabled: true },
    });
    expect(res.status).toBe(422);

    const stored = await prisma.userLocation.findUnique({ where: { userId: alice.id } });
    expect(stored).toBeNull();
  });

  it('never returns another member an exact coordinate', async () => {
    const exact = { latitude: 17.38504, longitude: 78.48665 };

    const saved = await api(baseUrl, 'PUT', '/api/location/me', {
      token: alice.token,
      body: { ...exact, sharingEnabled: true, consent: true },
    });
    expect(saved.status).toBe(200);

    await api(baseUrl, 'PUT', '/api/location/me', {
      token: bob.token,
      body: { latitude: 17.386, longitude: 78.487, sharingEnabled: true, consent: true },
    });

    const nearby = await api(baseUrl, 'GET', '/api/location/nearby?radiusKm=25', {
      token: bob.token,
    });
    const row = (
      nearby.body.data as {
        members: { username: string; location: { latitude: number; longitude: number } }[];
      }
    ).members.find((member) => member.username === alice.username);

    expect(row).toBeDefined();
    // Snapped to a ~1 km grid, so the exact point is not recoverable.
    expect(row!.location.latitude).not.toBe(exact.latitude);
    expect(row!.location.longitude).not.toBe(exact.longitude);
    expect(row!.location.latitude).toBe(17.39);
    expect(row!.location.longitude).toBe(78.49);
  });

  it('hides a member who turned sharing off', async () => {
    await api(baseUrl, 'PUT', '/api/location/me', {
      token: bob.token,
      body: { latitude: 17.386, longitude: 78.487, sharingEnabled: true, consent: true },
    });

    const before = await api(baseUrl, 'GET', '/api/location/nearby?radiusKm=25', {
      token: alice.token,
    });
    expect(before.status).toBe(200);
    const beforeNames = (before.body.data as { members: { username: string }[] }).members.map(
      (member) => member.username,
    );
    expect(beforeNames).toContain(bob.username);

    await api(baseUrl, 'PATCH', '/api/location/me/sharing', {
      token: bob.token,
      body: { sharingEnabled: false },
    });

    const after = await api(baseUrl, 'GET', '/api/location/nearby?radiusKm=25', {
      token: alice.token,
    });
    const afterNames = (after.body.data as { members: { username: string }[] }).members.map(
      (member) => member.username,
    );
    expect(afterNames).not.toContain(bob.username);
  });

  it('reports the distance between two members', async () => {
    const res = await api(baseUrl, 'GET', '/api/location/nearby?radiusKm=25', {
      token: alice.token,
    });
    const members = (res.body.data as { members: { distanceKm: number }[] }).members;
    for (const member of members) {
      expect(member.distanceKm).toBeGreaterThanOrEqual(0);
      expect(member.distanceKm).toBeLessThanOrEqual(25);
    }
  });

  it('deletes the saved point on request', async () => {
    const res = await api(baseUrl, 'DELETE', '/api/location/me', { token: alice.token });
    expect(res.status).toBe(204);

    const stored = await prisma.userLocation.findUnique({ where: { userId: alice.id } });
    expect(stored).toBeNull();
  });

  it('requires a location before listing nearby members', async () => {
    const res = await api(baseUrl, 'GET', '/api/location/nearby?radiusKm=10', {
      token: alice.token,
    });
    expect(res.status).toBe(400);
  });
});

describe('skill learning agent', () => {
  it('reports honestly when no AI provider is configured', async () => {
    const res = await api(baseUrl, 'GET', '/api/learning-agent/status', { token: alice.token });
    expect(res.status).toBe(200);
    const data = res.body.data as { ai: { enabled: boolean } };
    // This deployment has no AI key; the flag must reflect that rather than
    // claiming the feature works.
    if (process.env.AI_API_KEY || process.env.GROQ_API_KEY) return;
    expect(data.ai.enabled).toBe(false);
  });

  it('returns 501 AI_NOT_CONFIGURED instead of a fabricated guide', async () => {
    if (process.env.AI_API_KEY || process.env.GROQ_API_KEY) return;
    const res = await api(baseUrl, 'POST', '/api/learning-agent/analyse', {
      token: alice.token,
      body: { skill: 'Python', language: 'en' },
    });
    expect(res.status).toBe(501);
    expect((res.body.error as { code: string }).code).toBe('AI_NOT_CONFIGURED');
  });

  it('returns curated resources marked unverified when search is unavailable', async () => {
    if (process.env.SEARCH_API_KEY) return;
    const res = await api(baseUrl, 'GET', '/api/learning-agent/resources?skill=Python', {
      token: alice.token,
    });
    expect(res.status).toBe(200);
    const data = res.body.data as {
      source: string;
      resources: { url: string; verified: boolean }[];
      notice: string | null;
    };
    expect(data.source).toBe('curated');
    expect(data.notice).toBeTruthy();
    for (const resource of data.resources) {
      // Every link is a real https URL, never a placeholder.
      expect(resource.url.startsWith('https://')).toBe(true);
      expect(resource.verified).toBe(false);
    }
  });

  it('lists real members who teach a skill', async () => {
    const skill = await prisma.skill.findFirstOrThrow({ where: { slug: 'test-python' } });
    expect(skill).not.toBeNull();

    await prisma.userSkill.create({
      data: { userId: bob.id, skillId: skill!.id, direction: 'TEACH', level: 'EXPERT' },
    });

    const res = await api(
      baseUrl,
      'GET',
      `/api/learning-agent/mentors?skill=${encodeURIComponent(skill!.name)}`,
      { token: alice.token },
    );
    expect(res.status).toBe(200);
    const data = res.body.data as { mentors: { username: string; direction: string }[] };
    const row = data.mentors.find((mentor) => mentor.username === bob.username);
    expect(row).toBeDefined();
    expect(row!.direction).toBe('TEACH');
  });

  it('excludes blocked members from the mentor list', async () => {
    const skill = await prisma.skill.findFirstOrThrow({ where: { slug: 'test-python' } });
    await prisma.userSkill.create({
      data: { userId: blocked.id, skillId: skill!.id, direction: 'TEACH', level: 'EXPERT' },
    });

    const res = await api(
      baseUrl,
      'GET',
      `/api/learning-agent/mentors?skill=${encodeURIComponent(skill!.name)}`,
      { token: bob.token },
    );
    const data = res.body.data as { mentors: { username: string }[] };
    expect(data.mentors.some((mentor) => mentor.username === blocked.username)).toBe(false);
  });

  it('returns mutual matches for members with complementary skills', async () => {
    const taught = await prisma.skill.findFirstOrThrow({ where: { slug: 'test-python' } });
    const wanted = await prisma.skill.findFirstOrThrow({ where: { slug: 'test-speaking' } });

    // alice teaches A and wants B; bob teaches B and wants A.
    await prisma.userSkill.createMany({
      data: [
        { userId: alice.id, skillId: taught!.id, direction: 'TEACH', level: 'ADVANCED' },
        { userId: alice.id, skillId: wanted!.id, direction: 'LEARN', level: 'BEGINNER' },
        { userId: bob.id, skillId: wanted!.id, direction: 'TEACH', level: 'ADVANCED' },
        { userId: bob.id, skillId: taught!.id, direction: 'LEARN', level: 'BEGINNER' },
      ],
    });

    const res = await api(baseUrl, 'GET', '/api/learning-agent/mutual-matches', {
      token: alice.token,
    });
    expect(res.status).toBe(200);
    const data = res.body.data as { matches: { username: string }[] };
    expect(data.matches.some((match) => match.username === bob.username)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await api(baseUrl, 'GET', '/api/learning-agent/mutual-matches');
    expect(res.status).toBe(401);
  });
});
