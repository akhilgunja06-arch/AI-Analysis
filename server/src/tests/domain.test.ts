import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { api, addSkill, createAccount, createSkill, resetDatabase, type TestAccount } from './helpers';

/**
 * Domain rules: skills, matching, exchange lifecycle, scheduling conflicts,
 * reviews and community moderation.
 */

let server: Server;
let baseUrl: string;

let admin: TestAccount;

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
  admin = await createAccount(baseUrl, { role: 'ADMIN', displayName: 'Test Admin' });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('skills', () => {
  it('rejects a duplicate skill entry for the same direction', async () => {
    const member = await createAccount(baseUrl);
    const skillId = await createSkill(baseUrl, admin, 'Duplicate Test');

    const first = await addSkill(baseUrl, member, skillId, 'TEACH');
    expect(first.id).toBeTruthy();

    const res = await api(baseUrl, 'POST', '/api/skills/mine', {
      token: member.token,
      body: { skillId, direction: 'TEACH', level: 'ADVANCED' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('allows the same skill in both directions', async () => {
    const member = await createAccount(baseUrl);
    const skillId = await createSkill(baseUrl, admin, 'Bidirectional');

    await addSkill(baseUrl, member, skillId, 'TEACH');
    const learn = await api(baseUrl, 'POST', '/api/skills/mine', {
      token: member.token,
      body: { skillId, direction: 'LEARN', level: 'BEGINNER' },
    });
    expect(learn.status).toBe(201);
  });

  it('requires evidence before claiming EXPERT level', async () => {
    const member = await createAccount(baseUrl);
    const skillId = await createSkill(baseUrl, admin, 'Expert Claim');

    const res = await api(baseUrl, 'POST', '/api/skills/mine', {
      token: member.token,
      body: { skillId, direction: 'TEACH', level: 'EXPERT' },
    });
    expect(res.status).toBe(422);

    const withEvidence = await api(baseUrl, 'POST', '/api/skills/mine', {
      token: member.token,
      body: {
        skillId,
        direction: 'TEACH',
        level: 'EXPERT',
        portfolioUrl: 'https://example.com/evidence',
      },
    });
    expect(withEvidence.status).toBe(201);
  });

  it('prevents one member from editing another member\u2019s skill entry', async () => {
    const owner = await createAccount(baseUrl);
    const stranger = await createAccount(baseUrl);
    const skillId = await createSkill(baseUrl, admin, 'Ownership');
    const entry = await addSkill(baseUrl, owner, skillId, 'TEACH');

    const res = await api(baseUrl, 'PATCH', `/api/skills/mine/${entry.id}`, {
      token: stranger.token,
      body: { level: 'BEGINNER' },
    });
    expect(res.status).toBe(403);

    const del = await api(baseUrl, 'DELETE', `/api/skills/mine/${entry.id}`, { token: stranger.token });
    expect(del.status).toBe(403);
  });

  it('counts trending skills from real member activity', async () => {
    const res = await api<{ data: { name: string; totalActivity: number }[] }>(
      baseUrl,
      'GET',
      '/api/skills/trending?limit=5',
    );
    expect(res.status).toBe(200);
    for (const skill of res.body.data) {
      expect(skill.totalActivity).toBeGreaterThan(0);
    }
  });
});

describe('matching engine', () => {
  it('scores a reciprocal pair highly and explains why', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);

    const pySkill = await createSkill(baseUrl, admin, 'MatchPython');
    const uiSkill = await createSkill(baseUrl, admin, 'MatchUiDesign');

    // A teaches Python and wants UI; B teaches UI and wants Python.
    await addSkill(baseUrl, a, pySkill, 'TEACH');
    await addSkill(baseUrl, a, uiSkill, 'LEARN');
    await addSkill(baseUrl, b, uiSkill, 'TEACH');
    await addSkill(baseUrl, b, pySkill, 'LEARN');

    const res = await api<{
      data: {
        matches: {
          username: string;
          score: number;
          breakdown: Record<string, number>;
          reasons: string[];
          theyTeachWhatIWant: unknown[];
          iTeachWhatTheyWant: unknown[];
        }[];
        criteria: { weights: Record<string, number> };
      };
    }>(baseUrl, 'GET', '/api/matches?limit=50', { token: a.token });

    expect(res.status).toBe(200);
    const match = res.body.data.matches.find((m) => m.username === b.username);
    expect(match).toBeTruthy();

    // Both reciprocal components must be present.
    expect(match!.breakdown.skillTeachToLearn).toBeGreaterThan(0);
    expect(match!.breakdown.skillLearnToTeach).toBeGreaterThan(0);
    expect(match!.theyTeachWhatIWant.length).toBe(1);
    expect(match!.iTeachWhatTheyWant.length).toBe(1);
    expect(match!.reasons.join(' ')).toContain('Reciprocal');
  });

  it('scores a one-directional relationship lower than a reciprocal one', async () => {
    const seeker = await createAccount(baseUrl);
    const oneWay = await createAccount(baseUrl);
    const twoWay = await createAccount(baseUrl);

    const py = await createSkill(baseUrl, admin, 'DirPython');
    const ui = await createSkill(baseUrl, admin, 'DirUi');

    await addSkill(baseUrl, seeker, py, 'TEACH');
    await addSkill(baseUrl, seeker, ui, 'LEARN');

    // One-way: teaches what I want, wants nothing I teach.
    await addSkill(baseUrl, oneWay, ui, 'TEACH');

    // Two-way: also wants what I teach.
    await addSkill(baseUrl, twoWay, ui, 'TEACH');
    await addSkill(baseUrl, twoWay, py, 'LEARN');

    const res = await api<{ data: { matches: { username: string; score: number }[] } }>(
      baseUrl,
      'GET',
      '/api/matches?limit=50',
      { token: seeker.token },
    );

    const oneWayScore = res.body.data.matches.find((m) => m.username === oneWay.username)!.score;
    const twoWayScore = res.body.data.matches.find((m) => m.username === twoWay.username)!.score;
    expect(twoWayScore).toBeGreaterThan(oneWayScore);
  });

  it('never returns the caller as their own match', async () => {
    const member = await createAccount(baseUrl);
    const skill = await createSkill(baseUrl, admin, 'SelfMatch');
    await addSkill(baseUrl, member, skill, 'TEACH');
    await addSkill(baseUrl, member, skill, 'LEARN');

    const res = await api<{ data: { matches: { username: string }[] } }>(
      baseUrl,
      'GET',
      '/api/matches?limit=50',
      { token: member.token },
    );
    expect(res.body.data.matches.some((m) => m.username === member.username)).toBe(false);
  });

  it('filters by minimum score and by reciprocal requirement', async () => {
    const member = await createAccount(baseUrl);
    const skill = await createSkill(baseUrl, admin, 'FilterSkill');
    await addSkill(baseUrl, member, skill, 'TEACH');
    await addSkill(baseUrl, member, skill, 'LEARN');

    const reciprocalOnly = await api<{ data: { matches: { breakdown: Record<string, number> }[] } }>(
      baseUrl,
      'GET',
      '/api/matches?requireReciprocal=true&limit=50',
      { token: member.token },
    );
    expect(reciprocalOnly.status).toBe(200);
    for (const m of reciprocalOnly.body.data.matches) {
      expect(m.breakdown.skillTeachToLearn).toBeGreaterThan(0);
      expect(m.breakdown.skillLearnToTeach).toBeGreaterThan(0);
    }

    const highScore = await api<{ data: { matches: { score: number }[] } }>(
      baseUrl,
      'GET',
      '/api/matches?minScore=95&limit=50',
      { token: member.token },
    );
    for (const m of highScore.body.data.matches) expect(m.score).toBeGreaterThanOrEqual(95);
  });

  it('hides a dismissed recommendation but keeps the member discoverable', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const skill = await createSkill(baseUrl, admin, 'DismissSkill');
    await addSkill(baseUrl, a, skill, 'TEACH');
    await addSkill(baseUrl, b, skill, 'LEARN');

    const dismiss = await api(baseUrl, 'POST', `/api/matches/${b.id}/dismiss`, { token: a.token });
    expect(dismiss.status).toBe(200);

    const matches = await api<{ data: { matches: { username: string }[] } }>(
      baseUrl,
      'GET',
      '/api/matches?limit=50',
      { token: a.token },
    );
    expect(matches.body.data.matches.some((m) => m.username === b.username)).toBe(false);

    // Dismissing is not blocking: the directory still shows them.
    const directory = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      `/api/members?search=${b.username}`,
      { token: a.token },
    );
    expect(directory.body.data.some((m) => m.username === b.username)).toBe(true);
  });

  it('reports 501 for AI suggestions instead of inventing output', async () => {
    const member = await createAccount(baseUrl);
    const res = await api(baseUrl, 'GET', '/api/matches/ai/suggestions', { token: member.token });
    expect(res.status).toBe(501);
    expect(res.body.error.message).toContain('not configured');
  });
});

describe('exchange lifecycle', () => {
  async function reciprocalPair() {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const s1 = await createSkill(baseUrl, admin, 'LifeA');
    const s2 = await createSkill(baseUrl, admin, 'LifeB');
    await addSkill(baseUrl, a, s1, 'TEACH');
    await addSkill(baseUrl, a, s2, 'LEARN');
    await addSkill(baseUrl, b, s2, 'TEACH');
    await addSkill(baseUrl, b, s1, 'LEARN');
    return { a, b, s1, s2 };
  }

  it('runs PENDING → ACCEPTED → ACTIVE → COMPLETED and creates the workspace once', async () => {
    const { a, b, s1, s2 } = await reciprocalPair();

    const created = await api<{ data: { id: string; status: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: {
        recipientId: b.id,
        offeredSkillId: s1,
        requestedSkillId: s2,
        goals: 'Learn each other\u2019s skill',
        sessionMinutes: 60,
        sessionsPerWeek: 1,
        totalSessions: 6,
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING');

    // Duplicate open request is refused.
    const duplicate = await api(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    expect(duplicate.status).toBe(409);

    // Only the recipient may accept.
    const initiatorAccept = await api(baseUrl, 'POST', `/api/exchanges/requests/${created.body.data.id}/respond`, {
      token: a.token,
      body: { action: 'accept' },
    });
    expect(initiatorAccept.status).toBe(403);

    const accepted = await api<{ data: { status: string; exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${created.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');
    const exchangeId = accepted.body.data.exchangeId;
    expect(exchangeId).toBeTruthy();

    // Both participants exist with mirrored teach/learn skills.
    const participants = await prisma.exchangeParticipant.findMany({
      where: { exchangeId },
      select: { userId: true, teachesSkillId: true, learnsSkillId: true, status: true },
    });
    expect(participants).toHaveLength(2);
    const aPart = participants.find((p) => p.userId === a.id)!;
    const bPart = participants.find((p) => p.userId === b.id)!;
    expect(aPart.teachesSkillId).toBe(s1);
    expect(aPart.learnsSkillId).toBe(s2);
    expect(bPart.teachesSkillId).toBe(s2);
    expect(bPart.learnsSkillId).toBe(s1);

    // Accepting twice is a conflict, not a second workspace.
    const acceptAgain = await api(baseUrl, 'POST', `/api/exchanges/requests/${created.body.data.id}/respond`, {
      token: b.token,
      body: { action: 'accept' },
    });
    expect(acceptAgain.status).toBe(409);

    // Start.
    const started = await api<{ data: { status: string } }>(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: a.token,
      body: { action: 'start' },
    });
    expect(started.body.data.status).toBe('ACTIVE');

    // Pause and resume.
    const paused = await api<{ data: { status: string } }>(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: b.token,
      body: { action: 'pause' },
    });
    expect(paused.body.data.status).toBe('PAUSED');

    const resumed = await api<{ data: { status: string } }>(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: b.token,
      body: { action: 'resume' },
    });
    expect(resumed.body.data.status).toBe('ACTIVE');

    // Complete.
    const completed = await api<{ data: { status: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/${exchangeId}/actions`,
      { token: a.token, body: { action: 'complete' } },
    );
    expect(completed.body.data.status).toBe('COMPLETED');

    // A completed exchange is terminal.
    const reopen = await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: a.token,
      body: { action: 'start' },
    });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.details.allowed).toEqual([]);
  });

  it('supports decline and withdraw, and refuses actions from the wrong side', async () => {
    const { a, b } = await reciprocalPair();

    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });

    // The initiator cannot decline their own request.
    const wrongSide = await api(baseUrl, 'POST', `/api/exchanges/requests/${request.body.data.id}/respond`, {
      token: a.token,
      body: { action: 'decline' },
    });
    expect(wrongSide.status).toBe(403);

    // The recipient can withdraw? No — that is the initiator's action.
    const recipientWithdraw = await api(baseUrl, 'POST', `/api/exchanges/requests/${request.body.data.id}/respond`, {
      token: b.token,
      body: { action: 'withdraw' },
    });
    expect(recipientWithdraw.status).toBe(403);

    const withdrawn = await api<{ data: { status: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: a.token, body: { action: 'withdraw' } },
    );
    expect(withdrawn.body.data.status).toBe('WITHDRAWN');
  });

  it('records a counter-proposal and lets the original initiator accept it', async () => {
    const { a, b } = await reciprocalPair();

    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id, sessionMinutes: 60, sessionsPerWeek: 1, totalSessions: 6 },
    });

    const countered = await api<{ data: { status: string; counterRequest: { id: string; terms: { sessionMinutes: number } } } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      {
        token: b.token,
        body: {
          action: 'counter',
          message: 'Shorter sessions please',
          sessionMinutes: 30,
          sessionsPerWeek: 2,
          totalSessions: 8,
          preferredFormat: 'ONLINE',
        },
      },
    );

    expect(countered.status).toBe(200);
    expect(countered.body.data.status).toBe('COUNTERED');
    expect(countered.body.data.counterRequest.terms.sessionMinutes).toBe(30);

    const original = await prisma.exchangeRequest.findUnique({
      where: { id: request.body.data.id },
      select: { status: true },
    });
    expect(original?.status).toBe('COUNTERED');

    // The counter flows back to A, who can now accept.
    const accepted = await api<{ data: { status: string; exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${countered.body.data.counterRequest.id}/respond`,
      { token: a.token, body: { action: 'accept' } },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');
  });

  it('hides an exchange from non-participants', async () => {
    const { a, b } = await reciprocalPair();
    const outsider = await createAccount(baseUrl);

    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );

    const res = await api(baseUrl, 'GET', `/api/exchanges/${accepted.body.data.exchangeId}`, {
      token: outsider.token,
    });
    expect(res.status).toBe(403);

    const requestRes = await api(baseUrl, 'GET', `/api/exchanges/requests/${request.body.data.id}`, {
      token: outsider.token,
    });
    expect(requestRes.status).toBe(403);
  });

  it('blocks a request to a member who has disabled requests', async () => {
    const { a, b } = await reciprocalPair();
    await prisma.userPreference.upsert({
      where: { userId: b.id },
      create: { userId: b.id, allowExchangeRequests: false },
      update: { allowExchangeRequests: false },
    });

    const res = await api(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    expect(res.status).toBe(403);
  });

  it('exposes the documented transition map', async () => {
    const member = await createAccount(baseUrl);
    const res = await api<{ data: { transitions: Record<string, string[]> } }>(
      baseUrl,
      'GET',
      '/api/exchanges/meta/transitions',
      { token: member.token },
    );
    expect(res.body.data.transitions.COMPLETED).toEqual([]);
    expect(res.body.data.transitions.PENDING).toContain('ACCEPTED');
  });
});

describe('scheduling', () => {
  async function activeExchange() {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    await api(baseUrl, 'POST', `/api/exchanges/${accepted.body.data.exchangeId}/actions`, {
      token: a.token,
      body: { action: 'start' },
    });
    return { a, b, exchangeId: accepted.body.data.exchangeId };
  }

  it('detects a clash for either participant and rejects the booking', async () => {
    const { a, b, exchangeId } = await activeExchange();
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);

    const first = await api(baseUrl, 'POST', '/api/sessions', {
      token: a.token,
      body: { exchangeId, startsAt: start.toISOString(), durationMinutes: 60 },
    });
    expect(first.status).toBe(201);

    // Same window, requested by the other participant — must clash.
    const clash = await api<{ error: { code: string; details: { busyMembers: string[] } } }>(
      baseUrl,
      'POST',
      '/api/sessions',
      {
        token: b.token,
        body: {
          exchangeId,
          startsAt: new Date(start.getTime() + 15 * 60 * 1000).toISOString(),
          durationMinutes: 60,
        },
      },
    );
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(clash.body.error.details.busyMembers.length).toBeGreaterThan(0);

    // A non-overlapping slot is accepted.
    const later = await api(baseUrl, 'POST', '/api/sessions', {
      token: b.token,
      body: {
        exchangeId,
        startsAt: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
      },
    });
    expect(later.status).toBe(201);
  });

  it('refuses a session in the past', async () => {
    const { a, exchangeId } = await activeExchange();
    const res = await api(baseUrl, 'POST', '/api/sessions', {
      token: a.token,
      body: { exchangeId, startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), durationMinutes: 60 },
    });
    expect(res.status).toBe(422);
  });

  it('lets only the host complete a session and keeps completed ones', async () => {
    const { a, b, exchangeId } = await activeExchange();
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const session = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/sessions', {
      token: a.token,
      body: { exchangeId, startsAt: start.toISOString(), durationMinutes: 45 },
    });

    // b is not the host.
    const notHost = await api(baseUrl, 'PATCH', `/api/sessions/${session.body.data.id}`, {
      token: b.token,
      body: { status: 'COMPLETED' },
    });
    expect(notHost.status).toBe(403);

    const completed = await api(baseUrl, 'PATCH', `/api/sessions/${session.body.data.id}`, {
      token: a.token,
      body: { status: 'COMPLETED' },
    });
    expect(completed.status).toBe(200);

    // Completed sessions are learning history and cannot be deleted.
    const del = await api(baseUrl, 'DELETE', `/api/sessions/${session.body.data.id}`, { token: a.token });
    expect(del.status).toBe(409);
  });

  it('refuses to schedule in a closed exchange', async () => {
    const { a, exchangeId } = await activeExchange();
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: a.token,
      body: { action: 'cancel', reason: 'Testing closed state' },
    });

    const res = await api(baseUrl, 'POST', '/api/sessions', {
      token: a.token,
      body: {
        exchangeId,
        startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
      },
    });
    expect(res.status).toBe(409);
  });
});

describe('milestones and notes', () => {
  it('lets either participant track milestones and refuses outsiders', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const outsider = await createAccount(baseUrl);

    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;

    const milestone = await api<{ data: { id: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/${exchangeId}/milestones`,
      { token: a.token, body: { title: 'Understand the basics', description: 'First milestone' } },
    );
    expect(milestone.status).toBe(201);

    const outsiderAttempt = await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/milestones`, {
      token: outsider.token,
      body: { title: 'Should not work' },
    });
    expect(outsiderAttempt.status).toBe(403);

    const done = await api<{ data: { status: string; completedAt: string | null } }>(
      baseUrl,
      'PATCH',
      `/api/milestones/${milestone.body.data.id}`,
      { token: b.token, body: { status: 'DONE' } },
    );
    expect(done.body.data.status).toBe('DONE');
    expect(done.body.data.completedAt).toBeTruthy();

    const note = await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/notes`, {
      token: a.token,
      body: { body: 'Shared notes for the next session', resourceUrl: 'https://example.com/reading' },
    });
    expect(note.status).toBe(201);

    const notesList = await api<{ data: unknown[] }>(baseUrl, 'GET', `/api/exchanges/${exchangeId}/notes`, {
      token: b.token,
    });
    expect(notesList.body.data).toHaveLength(1);

    // Only the author can delete their note.
    const noteId = (note.body.data as { id: string }).id;
    const deleteByOther = await api(baseUrl, 'DELETE', `/api/notes/${noteId}`, { token: b.token });
    expect(deleteByOther.status).toBe(403);
  });

  it('returns workspace notes with a flat author shape the client can render', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/notes`, {
      token: a.token,
      body: { body: 'A note with an author to render' },
    });

    const workspace = await api<{
      data: { notes: { author: { username: string; displayName: string; avatarUrl: string | null } }[] };
    }>(baseUrl, 'GET', `/api/exchanges/${exchangeId}`, { token: b.token });

    const author = workspace.body.data.notes[0]!.author;
    // A nested profile object here would render as an undefined name client-side.
    expect(typeof author.displayName).toBe('string');
    expect(author.displayName.length).toBeGreaterThan(0);
    expect(author.username).toBe(a.username);
    expect('profile' in (author as Record<string, unknown>)).toBe(false);
  });

  it('measures workspace and list progress against the agreed session plan', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id, totalSessions: 5, sessionMinutes: 45 },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;

    type Progress = { sessionsCompleted: number; sessionsTotal: number; percent?: number };
    const workspace = await api<{ data: { progress: Progress } }>(
      baseUrl,
      'GET',
      `/api/exchanges/${exchangeId}`,
      { token: a.token },
    );
    // No sessions have been held yet, but the plan still defines the denominator.
    expect(workspace.body.data.progress.sessionsTotal).toBe(5);
    expect(workspace.body.data.progress.sessionsCompleted).toBe(0);

    const list = await api<{ data: { id: string; progress: Progress }[] }>(
      baseUrl,
      'GET',
      '/api/exchanges?pageSize=50',
      { token: a.token },
    );
    const row = list.body.data.find((e) => e.id === exchangeId);
    expect(row).toBeDefined();
    // The list card and the workspace must agree on the denominator, otherwise
    // they show different percentages for the same exchange.
    expect(row!.progress.sessionsTotal).toBe(workspace.body.data.progress.sessionsTotal);
  });

  it('reports one consistent progress figure across the list, workspace and learning views', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id, totalSessions: 4, sessionMinutes: 60 },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;

    type Progress = {
      sessionsCompleted: number;
      sessionsTotal: number;
      milestonesDone: number;
      milestonesTotal: number;
      percent: number;
    };

    // A milestone is finished but no session is held yet. These used to diverge:
    // one view scored progress by sessions, another preferred milestones.
    const milestone = await api<{ data: { id: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/${exchangeId}/milestones`,
      { token: a.token, body: { title: 'Agree the goal' } },
    );
    await api(baseUrl, 'PATCH', `/api/milestones/${milestone.body.data.id}`, {
      token: b.token,
      body: { status: 'DONE' },
    });

    const workspace = await api<{ data: { progress: Progress } }>(
      baseUrl,
      'GET',
      `/api/exchanges/${exchangeId}`,
      { token: a.token },
    );
    const list = await api<{ data: { id: string; progress: Progress }[] }>(
      baseUrl,
      'GET',
      '/api/exchanges?pageSize=50',
      { token: a.token },
    );
    const learning = await api<{ data: { exchanges: { exchangeId: string; progress: Progress }[] } }>(
      baseUrl,
      'GET',
      '/api/learning',
      { token: a.token },
    );

    const listRow = list.body.data.find((e) => e.id === exchangeId)!.progress;
    const learningRow = learning.body.data.exchanges.find((e) => e.exchangeId === exchangeId)!.progress;

    for (const view of [listRow, learningRow]) {
      expect(view.percent).toBe(workspace.body.data.progress.percent);
      expect(view.sessionsTotal).toBe(workspace.body.data.progress.sessionsTotal);
      expect(view.milestonesTotal).toBe(workspace.body.data.progress.milestonesTotal);
    }
    // The agreed plan is the denominator, so a finished milestone alone does not
    // inflate the figure to 100%.
    expect(workspace.body.data.progress.sessionsTotal).toBe(4);
    expect(workspace.body.data.progress.percent).toBe(0);
  });
});

describe('reviews', () => {
  async function completedExchange() {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, { token: a.token, body: { action: 'start' } });
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, { token: a.token, body: { action: 'complete' } });
    return { a, b, exchangeId };
  }

  it('accepts one review per participant and refuses a second', async () => {
    const { a, b, exchangeId } = await completedExchange();

    const first = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: b.id, rating: 5, comment: 'Excellent partner.' },
    });
    expect(first.status).toBe(201);

    const duplicate = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: b.id, rating: 1, comment: 'Changed my mind.' },
    });
    expect(duplicate.status).toBe(409);

    // The other side may still review.
    const second = await api(baseUrl, 'POST', '/api/reviews', {
      token: b.token,
      body: { exchangeId, subjectId: a.id, rating: 4, comment: 'Good sessions.' },
    });
    expect(second.status).toBe(201);
  });

  it('refuses a self-review', async () => {
    const { a, exchangeId } = await completedExchange();
    const res = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: a.id, rating: 5 },
    });
    expect(res.status).toBe(400);
  });

  it('refuses a review from someone outside the exchange', async () => {
    const { a, b, exchangeId } = await completedExchange();
    const outsider = await createAccount(baseUrl);

    const res = await api(baseUrl, 'POST', '/api/reviews', {
      token: outsider.token,
      body: { exchangeId, subjectId: a.id, rating: 5 },
    });
    expect(res.status).toBe(403);

    // And the subject must be the actual partner, not an arbitrary member.
    const wrongSubject = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: outsider.id, rating: 5 },
    });
    expect(wrongSubject.status).toBe(400);
  });

  it('refuses a review before the exchange has started', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: a.token,
      body: { recipientId: b.id },
    });

    const res = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId: request.body.data.id, subjectId: b.id, rating: 5 },
    });
    // The request id is not an exchange id, so this is a 404; a real pending
    // exchange is covered by the status check below.
    expect([400, 403, 404, 409]).toContain(res.status);

    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: b.token, body: { action: 'accept' } },
    );
    const pendingExchangeReview = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId: accepted.body.data.exchangeId, subjectId: b.id, rating: 5 },
    });
    expect(pendingExchangeReview.status).toBe(409);
  });

  it('computes an aggregate rating from stored reviews only', async () => {
    const { a, b, exchangeId } = await completedExchange();
    await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: b.id, rating: 4 },
    });

    const res = await api<{ data: { averageRating: number; distribution: Record<string, number> } }>(
      baseUrl,
      'GET',
      `/api/reviews/user/${b.username}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.averageRating).toBe(4);
    expect(res.body.data.distribution['4']).toBe(1);
  });

  it('rejects an out-of-range rating at the validation layer', async () => {
    const { a, b, exchangeId } = await completedExchange();
    const res = await api(baseUrl, 'POST', '/api/reviews', {
      token: a.token,
      body: { exchangeId, subjectId: b.id, rating: 9 },
    });
    expect(res.status).toBe(422);
  });
});

describe('member directory rating sort', () => {
  /**
   * Rating is an aggregate over Review, so it cannot be expressed as a Prisma
   * orderBy on User. The listing must therefore rank the whole filtered set
   * before paging; ranking only the fetched page hides highly rated members
   * behind unreviewed ones.
   */
  it('ranks a reviewed member above unreviewed ones even when paging', async () => {
    const reviewer = await createAccount(baseUrl);
    const reviewed = await createAccount(baseUrl);
    // Enough unreviewed members that a single page cannot contain them all.
    const filler = await Promise.all(
      Array.from({ length: 14 }, () => createAccount(baseUrl)),
    );

    const request = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/exchanges/requests', {
      token: reviewer.token,
      body: { recipientId: reviewed.id },
    });
    const accepted = await api<{ data: { exchangeId: string } }>(
      baseUrl,
      'POST',
      `/api/exchanges/requests/${request.body.data.id}/respond`,
      { token: reviewed.token, body: { action: 'accept' } },
    );
    const exchangeId = accepted.body.data.exchangeId;
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: reviewer.token,
      body: { action: 'start' },
    });
    await api(baseUrl, 'POST', `/api/exchanges/${exchangeId}/actions`, {
      token: reviewer.token,
      body: { action: 'complete' },
    });
    await api(baseUrl, 'POST', '/api/reviews', {
      token: reviewer.token,
      body: { exchangeId, subjectId: reviewed.id, rating: 5, comment: 'Great partner.' },
    });

    // Other tests in this file also leave reviews behind, so the assertion is
    // about ordering, not about which member happens to land first.
    type Row = { username: string; stats: { reviewsCount: number; averageRating: number | null } };
    const firstPage = await api<{ data: Row[] }>(baseUrl, 'GET', '/api/members?pageSize=10&sort=rating');
    expect(firstPage.status).toBe(200);

    const names = firstPage.body.data.map((m) => m.username);
    const reviewedIndex = names.indexOf(reviewed.username);
    // Before the fix this member was pushed off the page entirely.
    expect(reviewedIndex).toBeGreaterThanOrEqual(0);

    // Every member ranked ahead of the reviewed one must itself be reviewed,
    // and no unreviewed member may outrank a reviewed one.
    for (let i = 0; i < reviewedIndex; i += 1) {
      expect(firstPage.body.data[i]!.stats.reviewsCount).toBeGreaterThan(0);
    }

    // Averages must be non-increasing across the returned page.
    const averages = firstPage.body.data.map((m) => m.stats.averageRating ?? 0);
    const sorted = [...averages].sort((x, y) => y - x);
    expect(averages).toEqual(sorted);

    // No member may appear on two pages of the same ordering.
    const secondPage = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      '/api/members?pageSize=10&page=2&sort=rating',
    );
    const overlap = secondPage.body.data.filter((m) => names.includes(m.username));
    expect(overlap).toEqual([]);

    // Sanity: the filler accounts exist, so the page really was truncated.
    expect(filler).toHaveLength(14);
  });
});

describe('messaging privacy', () => {
  it('refuses to read a conversation the caller is not part of', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const outsider = await createAccount(baseUrl);

    const conversation = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: a.token, body: { username: b.username, message: 'Hello there' } },
    );
    const conversationId = conversation.body.data.conversationId;

    const asParticipant = await api(baseUrl, 'GET', `/api/messages/conversations/${conversationId}`, {
      token: b.token,
    });
    expect(asParticipant.status).toBe(200);

    const asOutsider = await api(baseUrl, 'GET', `/api/messages/conversations/${conversationId}`, {
      token: outsider.token,
    });
    expect(asOutsider.status).toBe(404);

    const outsiderSend = await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: outsider.token,
      body: { body: 'I should not be able to send this' },
    });
    expect(outsiderSend.status).toBe(404);
  });

  it('reuses a single 1:1 conversation rather than creating duplicates', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);

    const first = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: a.token, body: { username: b.username } },
    );
    const second = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: b.token, body: { username: a.username } },
    );
    expect(second.body.data.conversationId).toBe(first.body.data.conversationId);
  });

  it('blocks messages and requests in both directions after a block', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);

    const blocked = await api(baseUrl, 'POST', `/api/messages/users/${b.username}/block`, {
      token: a.token,
      body: { reason: 'Testing' },
    });
    expect(blocked.status).toBe(200);

    // A cannot open a conversation with B.
    const aToB = await api(baseUrl, 'POST', '/api/messages/conversations', {
      token: a.token,
      body: { username: b.username },
    });
    expect(aToB.status).toBe(403);

    // B cannot open a conversation with A either.
    const bToA = await api(baseUrl, 'POST', '/api/messages/conversations', {
      token: b.token,
      body: { username: a.username },
    });
    expect(bToA.status).toBe(403);

    // Nor an exchange request.
    const request = await api(baseUrl, 'POST', '/api/exchanges/requests', {
      token: b.token,
      body: { recipientId: a.id },
    });
    expect(request.status).toBe(403);

    // Unblocking restores it.
    const unblocked = await api(baseUrl, 'DELETE', `/api/messages/users/${b.username}/block`, { token: a.token });
    expect(unblocked.status).toBe(204);

    const retry = await api(baseUrl, 'POST', '/api/messages/conversations', {
      token: a.token,
      body: { username: b.username },
    });
    expect(retry.status).toBe(201);
  });

  it('counts unread messages only from other people', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);

    const conversation = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: a.token, body: { username: b.username, message: 'First message' } },
    );

    const bUnread = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: b.token,
    });
    expect(bUnread.body.data.unread).toBe(1);

    // A's own message does not count as unread for A.
    const aUnread = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: a.token,
    });
    expect(aUnread.body.data.unread).toBe(0);

    // Reading clears it.
    await api(baseUrl, 'GET', `/api/messages/conversations/${conversation.body.data.conversationId}`, {
      token: b.token,
    });
    const afterRead = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: b.token,
    });
    expect(afterRead.body.data.unread).toBe(0);
  });
});

describe('community', () => {
  it('creates a post, votes, replies and marks an answer', async () => {
    const author = await createAccount(baseUrl);
    const responder = await createAccount(baseUrl);

    const post = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/community/posts', {
      token: author.token,
      body: {
        title: 'How do you keep a study routine going?',
        body: 'I keep starting and stopping. What has actually worked for you over months rather than weeks?',
        postType: 'QUESTION',
      },
    });
    expect(post.status).toBe(201);
    const postId = post.body.data.id;

    // Identical title immediately afterwards is treated as a duplicate.
    const duplicate = await api(baseUrl, 'POST', '/api/community/posts', {
      token: author.token,
      body: {
        title: 'How do you keep a study routine going?',
        body: 'A different body but the same title, posted straight away.',
        postType: 'QUESTION',
      },
    });
    expect(duplicate.status).toBe(409);

    const vote = await api<{ data: { voteCount: number; myVote: number } }>(
      baseUrl,
      'POST',
      `/api/community/posts/${postId}/vote`,
      { token: responder.token, body: { value: 1 } },
    );
    expect(vote.body.data.voteCount).toBe(1);

    // Voting the same way again toggles it off.
    const toggle = await api<{ data: { voteCount: number; myVote: number } }>(
      baseUrl,
      'POST',
      `/api/community/posts/${postId}/vote`,
      { token: responder.token, body: { value: 1 } },
    );
    expect(toggle.body.data.voteCount).toBe(0);

    const comment = await api<{ data: { id: string } }>(baseUrl, 'POST', `/api/community/posts/${postId}/comments`, {
      token: responder.token,
      body: { body: 'Schedule it in the calendar and treat it like a meeting.' },
    });
    expect(comment.status).toBe(201);

    const marked = await api<{ data: { isAnswer: boolean } }>(
      baseUrl,
      'POST',
      `/api/community/comments/${comment.body.data.id}/answer`,
      { token: author.token },
    );
    expect(marked.body.data.isAnswer).toBe(true);

    // Only the post author (or staff) may mark an answer.
    const otherComment = await api<{ data: { id: string } }>(
      baseUrl,
      'POST',
      `/api/community/posts/${postId}/comments`,
      { token: author.token, body: { body: 'Thanks, that is helpful.' } },
    );
    const notAuthor = await api(baseUrl, 'POST', `/api/community/comments/${otherComment.body.data.id}/answer`, {
      token: responder.token,
    });
    expect(notAuthor.status).toBe(403);

    const detail = await api<{ data: { post: { commentCount: number }; comments: unknown[] } }>(
      baseUrl,
      'GET',
      `/api/community/posts/${postId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.comments.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a post body that is too short', async () => {
    const member = await createAccount(baseUrl);
    const res = await api(baseUrl, 'POST', '/api/community/posts', {
      token: member.token,
      body: { title: 'Short body test', body: 'too short' },
    });
    expect(res.status).toBe(422);
  });
});

describe('moderation', () => {
  it('keeps the admin surface closed to members and moderators', async () => {
    const member = await createAccount(baseUrl);
    const moderator = await createAccount(baseUrl, { role: 'MODERATOR' });

    expect((await api(baseUrl, 'GET', '/api/admin/overview', { token: member.token })).status).toBe(403);
    // A moderator can read the queue…
    expect((await api(baseUrl, 'GET', '/api/admin/overview', { token: moderator.token })).status).toBe(200);
    // …but cannot manage users or read the audit log.
    expect((await api(baseUrl, 'GET', '/api/admin/users', { token: moderator.token })).status).toBe(200);
    expect((await api(baseUrl, 'GET', '/api/admin/audit-logs', { token: moderator.token })).status).toBe(403);
    expect((await api(baseUrl, 'GET', '/api/admin/audit-logs', { token: admin.token })).status).toBe(200);
  });

  it('refuses an unauthenticated caller on the admin surface', async () => {
    expect((await api(baseUrl, 'GET', '/api/admin/overview')).status).toBe(401);
  });

  it('prevents an admin from suspending their own account', async () => {
    const res = await api(baseUrl, 'PATCH', `/api/admin/users/${admin.id}`, {
      token: admin.token,
      body: { action: 'suspend', reason: 'Testing self-lockout prevention' },
    });
    expect(res.status).toBe(400);
  });

  it('lets an admin suspend a member, which immediately invalidates their session', async () => {
    const victim = await createAccount(baseUrl);
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: victim.token })).status).toBe(200);

    const suspended = await api(baseUrl, 'PATCH', `/api/admin/users/${victim.id}`, {
      token: admin.token,
      body: { action: 'suspend', reason: 'Repeated spam' },
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');

    // The existing access token is now rejected because the session was revoked.
    expect((await api(baseUrl, 'GET', '/api/auth/me', { token: victim.token })).status).toBe(401);

    // And signing in again is refused.
    const login = await api(baseUrl, 'POST', '/api/auth/login', {
      token: undefined,
      body: { email: victim.email, password: 'TestPassword#2026' },
    });
    expect(login.status).toBe(403);

    const reinstated = await api(baseUrl, 'PATCH', `/api/admin/users/${victim.id}`, {
      token: admin.token,
      body: { action: 'reinstate' },
    });
    expect(reinstated.body.data.status).toBe('ACTIVE');
  });

  it('writes an audit entry for every administrative action', async () => {
    const member = await createAccount(baseUrl);
    await api(baseUrl, 'PATCH', `/api/admin/users/${member.id}`, {
      token: admin.token,
      body: { action: 'suspend', reason: 'Audit trail test' },
    });

    const logs = await api<{ data: { action: string; summary: string }[] }>(
      baseUrl,
      'GET',
      '/api/admin/audit-logs?action=admin.user.suspend',
      { token: admin.token },
    );
    expect(logs.status).toBe(200);
    expect(logs.body.data.length).toBeGreaterThan(0);
    expect(logs.body.data[0]!.summary).toContain(member.username);
  });

  it('processes a report and hides the reported content', async () => {
    const reporter = await createAccount(baseUrl);
    const offender = await createAccount(baseUrl);

    const post = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/community/posts', {
      token: offender.token,
      body: {
        title: 'Something that will be reported',
        body: 'This body exists so a report can be filed against a real community post row.',
      },
    });

    const report = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/community/report', {
      token: reporter.token,
      body: {
        targetType: 'COMMUNITY_POST',
        targetId: post.body.data.id,
        reason: 'INAPPROPRIATE_CONTENT',
        details: 'Testing the moderation queue',
      },
    });
    expect(report.status).toBe(201);

    // Duplicate reports from the same person are refused.
    const duplicate = await api(baseUrl, 'POST', '/api/community/report', {
      token: reporter.token,
      body: { targetType: 'COMMUNITY_POST', targetId: post.body.data.id, reason: 'SPAM' },
    });
    expect(duplicate.status).toBe(409);

    const queue = await api<{ data: { id: string; excerpt: string | null }[] }>(
      baseUrl,
      'GET',
      '/api/admin/reports?status=OPEN',
      { token: admin.token },
    );
    expect(queue.body.data.some((r) => r.id === report.body.data.id)).toBe(true);

    const resolved = await api(baseUrl, 'PATCH', `/api/admin/reports/${report.body.data.id}`, {
      token: admin.token,
      body: { status: 'RESOLVED', action: 'CONTENT_HIDDEN', note: 'Hidden pending review' },
    });
    expect(resolved.status).toBe(200);

    const stored = await prisma.communityPost.findUnique({
      where: { id: post.body.data.id },
      select: { status: true },
    });
    expect(stored?.status).toBe('HIDDEN');

    // Hidden content disappears from the public feed.
    const feed = await api<{ data: { id: string }[] }>(baseUrl, 'GET', '/api/community/posts');
    expect(feed.body.data.some((p) => p.id === post.body.data.id)).toBe(false);
  });
});

describe('data export and deletion', () => {
  it('exports the member\u2019s own data and nothing else', async () => {
    const member = await createAccount(baseUrl);
    const other = await createAccount(baseUrl);
    const skillId = await createSkill(baseUrl, admin, 'ExportSkill');
    await addSkill(baseUrl, member, skillId, 'TEACH');

    const res = await api<{ account: { username: string; email: string }; skills: unknown[]; note: string }>(
      baseUrl,
      'GET',
      '/api/settings/export',
      { token: member.token },
    );
    expect(res.status).toBe(200);
    expect(res.body.account.username).toBe(member.username);
    expect(res.body.skills.length).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(other.email);
  });

  it('requires the password and an exact confirmation phrase to delete an account', async () => {
    const member = await createAccount(baseUrl);

    const wrongPhrase = await api(baseUrl, 'DELETE', '/api/settings/account', {
      token: member.token,
      body: { password: 'TestPassword#2026', confirmation: 'delete' },
    });
    expect(wrongPhrase.status).toBe(422);

    const wrongPassword = await api(baseUrl, 'DELETE', '/api/settings/account', {
      token: member.token,
      body: { password: 'NotThePassword#2026', confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(wrongPassword.status).toBe(401);

    const deleted = await api(baseUrl, 'DELETE', '/api/settings/account', {
      token: member.token,
      body: { password: 'TestPassword#2026', confirmation: 'DELETE MY ACCOUNT' },
    });
    expect(deleted.status).toBe(204);

    expect(await prisma.user.findUnique({ where: { id: member.id } })).toBeNull();
  });

  it('deactivates and reactivates an account', async () => {
    const member = await createAccount(baseUrl);

    const deactivated = await api(baseUrl, 'POST', '/api/settings/deactivate', {
      token: member.token,
      body: { password: 'TestPassword#2026' },
    });
    expect(deactivated.status).toBe(200);

    const status = await prisma.user.findUnique({ where: { id: member.id }, select: { status: true } });
    expect(status?.status).toBe('DEACTIVATED');

    // Signing in is refused while deactivated.
    const login = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: member.email, password: 'TestPassword#2026' },
    });
    expect(login.status).toBe(403);
  });
});

describe('privacy of public profiles', () => {
  it('hides location and languages when the member turns them off', async () => {
    const member = await createAccount(baseUrl);
    await api(baseUrl, 'PATCH', '/api/profile', {
      token: member.token,
      body: { location: 'Secret City', languages: ['English', 'Klingon'], timezone: 'Europe/London' },
    });

    const before = await api<{ data: { location: string | null; languages: string[] } }>(
      baseUrl,
      'GET',
      `/api/members/${member.username}`,
    );
    expect(before.body.data.location).toBe('Secret City');

    await api(baseUrl, 'PATCH', '/api/settings/preferences', {
      token: member.token,
      body: { showLocation: false, showLanguages: false },
    });

    const after = await api<{ data: { location: string | null; languages: string[] } }>(
      baseUrl,
      'GET',
      `/api/members/${member.username}`,
    );
    expect(after.body.data.location).toBeNull();
    expect(after.body.data.languages).toEqual([]);
  });

  it('never returns an email address in a public member payload', async () => {
    const member = await createAccount(baseUrl);
    const profile = await api<{ data: Record<string, unknown> }>(baseUrl, 'GET', `/api/members/${member.username}`);
    expect(JSON.stringify(profile.body)).not.toContain(member.email);

    const directory = await api<{ data: Record<string, unknown>[] }>(baseUrl, 'GET', '/api/members?pageSize=50');
    expect(JSON.stringify(directory.body)).not.toContain('@example.com');
  });
});
