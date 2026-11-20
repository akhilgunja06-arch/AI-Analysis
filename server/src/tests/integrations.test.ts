import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/auth';
import { api, createAccount, TEST_PASSWORD, uniqueSuffix, type TestAccount } from './helpers';
import { messageLimiter } from '../middleware/errors';
import { messagingRouter } from '../routes/messaging.routes';

/**
 * Normal authentication, safety moderation, call authorisation and the AI
 * assistant's honest failure modes. These exercise the real routes and the real
 * database — no mocks.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

async function signIn(identifier: string): Promise<string> {
  const res = await api<{ data: { accessToken: string } }>(baseUrl, 'POST', '/api/auth/login', {
    body: { identifier, password: TEST_PASSWORD },
  });
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

// -------------------------------------------------- normal authentication

describe('normal authentication', () => {
  it('registers and signs in without any verification step', async () => {
    const suffix = uniqueSuffix();
    const email = `plain-${suffix}@example.com`;
    const registered = await api<{ data: { user: { id: string }; accessToken: string } }>(
      baseUrl,
      'POST',
      '/api/auth/register',
      {
        body: {
          email,
          username: `plain${suffix}`.slice(0, 30).toLowerCase(),
          password: TEST_PASSWORD,
          displayName: 'Plain Member',
          acceptedTerms: true,
        },
      },
    );

    expect(registered.status).toBe(201);
    expect(registered.body.data.accessToken).toBeTruthy();

    const row = await prisma.user.findUnique({ where: { email }, select: { status: true } });
    expect(row?.status).toBe('ACTIVE');

    // Signing in with the username works too.
    const stored = await prisma.user.findUnique({ where: { email }, select: { username: true } });
    const token = await signIn(stored!.username);
    expect(token).toBeTruthy();
  });

  it('does not answer on the removed verification endpoints', async () => {
    for (const path of ['/api/auth/verify-otp', '/api/auth/resend-otp', '/api/auth/verify-email']) {
      const res = await api(baseUrl, 'POST', path, { body: {} });
      expect(res.status).toBe(404);
    }
  });

  it('still rejects a disposable email domain', async () => {
    const res = await api<{ error: { code: string } }>(baseUrl, 'POST', '/api/auth/register', {
      body: {
        email: `throwaway-${uniqueSuffix()}@mailinator.com`,
        username: `disp${uniqueSuffix()}`.slice(0, 30).toLowerCase(),
        password: TEST_PASSWORD,
        displayName: 'Disposable',
        acceptedTerms: true,
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ----------------------------------------------------------------- moderation

describe('chat safety moderation', () => {
  /** Opens a fresh pair of accounts and returns a conversation between them. */
  async function freshPair() {
    const sender = await createAccount(baseUrl);
    const receiver = await createAccount(baseUrl);
    const res = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: sender.token, body: { username: receiver.username } },
    );
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`Could not open conversation: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { sender, receiver, conversationId: res.body.data.conversationId };
  }

  function send(token: string, conversationId: string, body: string) {
    return api<{ data: { body: string }; error: { code: string } }>(
      baseUrl,
      'POST',
      `/api/messages/conversations/${conversationId}`,
      { token, body: { body } },
    );
  }

  it('allows an ordinary study message', async () => {
    const { sender, conversationId } = await freshPair();
    const res = await send(sender.token, conversationId, 'Can you explain the chain rule for derivatives?');
    expect(res.status).toBe(201);
    expect(res.body.data.body).toContain('chain rule');
  });

  it('allows ordinary conversation that has nothing to do with study', async () => {
    const { sender, conversationId } = await freshPair();
    // None of these would pass a study-only filter; all are normal chat.
    for (const body of [
      'I watched a great film last night about a heist gone wrong, have you seen it?',
      'How is your week going? Work has been completely mad since Monday.',
      'I am thinking of moving to Bangalore next year for a new job in product design.',
      'My football team lost again. I do not want to talk about it.',
    ]) {
      const res = await send(sender.token, conversationId, body);
      expect(res.status).toBe(201);
      expect((res.body.data as { moderationNotice?: string }).moderationNotice).toBeUndefined();
    }
  });

  it('blocks a clearly sexual message before it is stored', async () => {
    const { sender, conversationId } = await freshPair();
    const res = await send(sender.token, conversationId, 'send me nude pics right now');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MESSAGE_BLOCKED');

    const stored = await prisma.message.findFirst({
      where: { conversationId, body: { contains: 'nude' } },
    });
    expect(stored).toBeNull();
  });

  it('blocks a threat that hides the verb behind a short clause', async () => {
    // A severity-3 block suspends the sender, so each phrasing needs its own
    // account; otherwise the second request is refused as suspended.
    for (const body of ['I will find you and hurt you', 'Ill hurt you', 'I will hunt you down and beat you']) {
      const { sender, conversationId } = await freshPair();
      const res = await send(sender.token, conversationId, body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MESSAGE_BLOCKED');
    }
  });

  it('applies a per-member rate limit to message sending', async () => {
    // The limiter is disabled under test, so assert it is actually mounted on
    // the send route rather than hammering a shared counter.
    type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };
    const stack = (messagingRouter as unknown as { stack: Layer[] }).stack;
    const sendRoute = stack.find((l) => l.route?.path === '/conversations/:id' && l.route.methods.post);
    expect(sendRoute).toBeDefined();
    expect(sendRoute!.route!.stack.some((layer) => layer.handle === messageLimiter)).toBe(true);
  });

  it('leaves ordinary technical uses of the same verbs alone', async () => {
    const { sender, conversationId } = await freshPair();
    for (const body of [
      'we should kill the process and restart the dev server',
      'that bug will hurt performance if we leave it in the loop',
    ]) {
      const res = await send(sender.token, conversationId, body);
      expect(res.status).toBe(201);
    }
  });

  it('does not treat legitimate biology vocabulary as sexual', async () => {
    const { sender, conversationId } = await freshPair();
    const res = await send(
      sender.token,
      conversationId,
      'In human anatomy the reproductive system includes the ovaries and testes.',
    );
    expect(res.status).toBe(201);
  });

  it('records a moderation event when a message is blocked', async () => {
    const { sender, conversationId } = await freshPair();
    const blocked = await send(sender.token, conversationId, 'I will kill you after class');
    expect(blocked.status).toBe(422);

    const events = await prisma.moderationEvent.findMany({
      where: { userId: sender.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.verdict === 'BLOCK')).toBe(true);
    // Evidence must never carry the raw message body in a form that leaks it.
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain('kill you after class');
    }
  });

  it('warns before pausing messaging after repeated abuse', async () => {
    const { sender, conversationId } = await freshPair();
    // Severity-1 harassment is a warning, not a block: three of them in a day
    // earn a temporary restriction rather than a suspension.
    for (let i = 0; i < 3; i += 1) {
      const res = await send(sender.token, conversationId, 'you are stupid and pathetic');
      // A warning still delivers the message, but carries a notice.
      expect(res.status).toBe(201);
      expect((res.body.data as { moderationNotice?: string }).moderationNotice).toBeTruthy();
    }

    const restriction = await prisma.messagingRestriction.findFirst({
      where: { userId: sender.id, liftedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(restriction).not.toBeNull();
    expect(restriction?.expiresAt).not.toBeNull();

    const row = await prisma.user.findUnique({ where: { id: sender.id }, select: { status: true } });
    expect(row?.status).toBe('ACTIVE');

    // The restriction is reported back to the sender and enforced on send.
    const after = await send(sender.token, conversationId, 'Can you explain integration by parts?');
    expect(after.status).toBe(403);
  });

  it('suspends the account after a second serious violation in the window', async () => {
    const { sender, conversationId } = await freshPair();
    await send(sender.token, conversationId, 'send me nude pics');
    await send(sender.token, conversationId, 'send me nude pics again');

    const row = await prisma.user.findUnique({ where: { id: sender.id }, select: { status: true } });
    expect(row?.status).toBe('SUSPENDED');
  });

  it('lets a suspended member read their own standing so they can appeal', async () => {
    const { sender, conversationId } = await freshPair();
    await send(sender.token, conversationId, 'send me nude pics');
    await send(sender.token, conversationId, 'send me nude pics again');

    const status = await prisma.user.findUnique({ where: { id: sender.id }, select: { status: true } });
    expect(status?.status).toBe('SUSPENDED');

    const standing = await api<{ data: { events: { reason: string }[] } }>(
      baseUrl,
      'GET',
      '/api/messages/moderation',
      { token: sender.token },
    );
    expect(standing.status).toBe(200);
    expect(standing.body.data.events.length).toBeGreaterThan(0);
    expect(standing.body.data.events[0].reason).toBeTruthy();

    // Every other member route still refuses the suspended session.
    const elsewhere = await api(baseUrl, 'GET', '/api/messages/conversations', { token: sender.token });
    expect(elsewhere.status).toBe(403);
  });

  it("exposes only the caller's own moderation standing", async () => {
    const member = await createAccount(baseUrl);
    const res = await api<{ data: { events: unknown[] } }>(baseUrl, 'GET', '/api/messages/moderation', {
      token: member.token,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.events)).toBe(true);

    const anonymous = await api(baseUrl, 'GET', '/api/messages/moderation');
    expect(anonymous.status).toBe(401);
  });
});

// ---------------------------------------------------------- messaging

describe('one-to-one messaging', () => {
  async function openConversation(a: TestAccount, b: TestAccount) {
    const res = await api<{ data: { conversationId: string } }>(baseUrl, 'POST', '/api/messages/conversations', {
      token: a.token,
      body: { username: b.username },
    });
    expect(res.status).toBe(201);
    return res.body.data.conversationId;
  }

  it('finds a member by username and display name', async () => {
    const searcher = await createAccount(baseUrl);
    const target = await createAccount(baseUrl, { displayName: 'Searchable Person' });

    const byUsername = await api<{ data: { username: string; conversationId: string | null }[] }>(
      baseUrl,
      'GET',
      `/api/messages/users?search=${encodeURIComponent(target.username)}`,
      { token: searcher.token },
    );
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.data.some((u) => u.username === target.username)).toBe(true);

    const byName = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      `/api/messages/users?search=Searchable`,
      { token: searcher.token },
    );
    expect(byName.body.data.some((u) => u.username === target.username)).toBe(true);

    // A search never offers the caller themselves.
    const self = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      `/api/messages/users?search=${encodeURIComponent(searcher.username)}`,
      { token: searcher.token },
    );
    expect(self.body.data.some((u) => u.username === searcher.username)).toBe(false);
  });

  it('hides blocked members from the search', async () => {
    const blocker = await createAccount(baseUrl);
    const blocked = await createAccount(baseUrl);
    await api(baseUrl, 'POST', `/api/messages/users/${blocked.username}/block`, {
      token: blocker.token,
      body: {},
    });

    const res = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      `/api/messages/users?search=${encodeURIComponent(blocked.username)}`,
      { token: blocker.token },
    );
    expect(res.body.data.some((u) => u.username === blocked.username)).toBe(false);
  });

  it('delivers, stores and marks a message read', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    const sent = await api<{ data: { id: string; body: string; deliveredAt: string | null } }>(
      baseUrl,
      'POST',
      `/api/messages/conversations/${conversationId}`,
      { token: a.token, body: { body: 'Hello there, how are you?' } },
    );
    expect(sent.status).toBe(201);
    const messageId = sent.body.data.id;

    // Persisted for both sides.
    const thread = await api<{
      data: { id: string; fromMe: boolean; readAt: string | null }[];
      meta: { otherUser: { username: string } };
    }>(baseUrl, 'GET', `/api/messages/conversations/${conversationId}`, { token: b.token });
    expect(thread.status).toBe(200);
    expect(thread.body.meta.otherUser.username).toBe(a.username);
    expect(thread.body.data.some((m) => m.id === messageId && !m.fromMe)).toBe(true);

    // Reading it stamps the receipt the sender can see.
    const row = await prisma.message.findUnique({ where: { id: messageId }, select: { readAt: true } });
    expect(row?.readAt).not.toBeNull();

    // Unread count for b drops to zero after opening.
    const unread = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: b.token,
    });
    expect(unread.body.data.unread).toBe(0);
  });

  it('counts unread messages before the recipient opens the thread', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'One' },
    });
    await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'Two' },
    });

    const unread = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: b.token,
    });
    expect(unread.body.data.unread).toBe(2);

    // The sender has nothing unread from their own messages.
    const senderUnread = await api<{ data: { unread: number } }>(baseUrl, 'GET', '/api/messages/unread-count', {
      token: a.token,
    });
    expect(senderUnread.body.data.unread).toBe(0);
  });

  it('pages older messages', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    for (let i = 0; i < 45; i += 1) {
      await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
        token: a.token,
        body: { body: `Message ${i}` },
      });
    }

    const first = await api<{ data: unknown[]; meta: { hasNext: boolean; page: number } }>(
      baseUrl,
      'GET',
      `/api/messages/conversations/${conversationId}?page=1&pageSize=40`,
      { token: a.token },
    );
    expect(first.body.data).toHaveLength(40);
    expect(first.body.meta.hasNext).toBe(true);

    const second = await api<{ data: { body: string }[]; meta: { page: number } }>(
      baseUrl,
      'GET',
      `/api/messages/conversations/${conversationId}?page=2&pageSize=40`,
      { token: a.token },
    );
    expect(second.body.meta.page).toBe(2);
    expect(second.body.data).toHaveLength(5);
    // The second page is genuinely older content.
    expect(second.body.data[0].body).toBe('Message 0');
  });

  it('lets a sender delete their own message but not another member\'s', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    const sent = await api<{ data: { id: string } }>(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'This will be deleted' },
    });
    const messageId = sent.body.data.id;

    // The other participant cannot delete it.
    const refused = await api(baseUrl, 'DELETE', `/api/messages/messages/${messageId}`, { token: b.token });
    expect(refused.status).toBe(404);

    const deleted = await api(baseUrl, 'DELETE', `/api/messages/messages/${messageId}`, { token: a.token });
    expect(deleted.status).toBe(204);

    // Both sides see a tombstone, never the original body.
    const thread = await api<{ data: { id: string; body: string | null; deleted: boolean }[] }>(
      baseUrl,
      'GET',
      `/api/messages/conversations/${conversationId}`,
      { token: b.token },
    );
    const row = thread.body.data.find((m) => m.id === messageId);
    expect(row?.deleted).toBe(true);
    expect(row?.body).toBeNull();
  });

  it('refuses an outsider any access to a private conversation', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const outsider = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'Private note' },
    });

    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = await api(baseUrl, method, `/api/messages/conversations/${conversationId}`, {
        token: outsider.token,
        ...(method === 'POST' ? { body: { body: 'intrusion' } } : {}),
      });
      expect(res.status).toBe(404);
    }

    const read = await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}/read`, {
      token: outsider.token,
    });
    expect(read.status).toBe(404);

    // Unauthenticated access is refused outright.
    const anonymous = await api(baseUrl, 'GET', `/api/messages/conversations/${conversationId}`);
    expect(anonymous.status).toBe(401);
  });

  it('reuses one conversation for a pair however many times it is opened', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);

    const first = await openConversation(a, b);
    const second = await openConversation(b, a);
    expect(second).toBe(first);
  });

  it('reports online state and last-seen for a conversation peer', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'ping' },
    });

    const list = await api<{
      data: { id: string; otherUser: { username: string; online: boolean; lastSeenAt: string | null } }[];
    }>(baseUrl, 'GET', '/api/messages/conversations', { token: b.token });
    expect(list.status).toBe(200);
    const entry = list.body.data.find((c) => c.id === conversationId);
    expect(entry?.otherUser.username).toBe(a.username);
    // Presence is a boolean even when nobody is connected in a test process.
    expect(typeof entry?.otherUser.online).toBe('boolean');
    expect(entry?.otherUser).toHaveProperty('lastSeenAt');
  });

  it('blocks messaging in both directions after a block', async () => {
    const a = await createAccount(baseUrl);
    const b = await createAccount(baseUrl);
    const conversationId = await openConversation(a, b);

    await api(baseUrl, 'POST', `/api/messages/users/${b.username}/block`, { token: a.token, body: {} });

    const aToB = await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: a.token,
      body: { body: 'hello' },
    });
    expect(aToB.status).toBe(403);

    const bToA = await api(baseUrl, 'POST', `/api/messages/conversations/${conversationId}`, {
      token: b.token,
      body: { body: 'hello back' },
    });
    expect(bToA.status).toBe(403);
  });
});

// --------------------------------------------------------------- reporting

describe('reporting a member or a message', () => {
  async function pairWithMessage() {
    const sender = await createAccount(baseUrl);
    const receiver = await createAccount(baseUrl);
    const conversation = await api<{ data: { conversationId: string } }>(
      baseUrl,
      'POST',
      '/api/messages/conversations',
      { token: sender.token, body: { username: receiver.username } },
    );
    const conversationId = conversation.body.data.conversationId;
    const message = await api<{ data: { id: string } }>(
      baseUrl,
      'POST',
      `/api/messages/conversations/${conversationId}`,
      { token: sender.token, body: { body: 'Here are my notes on integration by parts.' } },
    );
    return { sender, receiver, conversationId, messageId: message.body.data.id };
  }

  it('accepts a report against a member', async () => {
    const { sender, receiver } = await pairWithMessage();
    const res = await api<{ data: { id: string; status: string } }>(baseUrl, 'POST', '/api/reports', {
      token: receiver.token,
      body: { targetType: 'USER', targetId: sender.id, reason: 'SPAM', details: 'Sent unsolicited links.' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('OPEN');
  });

  it('accepts a report against a message from a conversation participant', async () => {
    const { receiver, messageId } = await pairWithMessage();
    const res = await api(baseUrl, 'POST', '/api/reports', {
      token: receiver.token,
      body: { targetType: 'MESSAGE', targetId: messageId, reason: 'INAPPROPRIATE_CONTENT' },
    });
    expect(res.status).toBe(201);
  });

  it('refuses a message report from someone outside the conversation', async () => {
    const { messageId } = await pairWithMessage();
    const outsider = await createAccount(baseUrl);
    const res = await api<{ error: { code: string } }>(baseUrl, 'POST', '/api/reports', {
      token: outsider.token,
      body: { targetType: 'MESSAGE', targetId: messageId, reason: 'SPAM' },
    });
    expect(res.status).toBe(404);
  });

  it('refuses a duplicate open report and self-reports', async () => {
    const { sender, receiver } = await pairWithMessage();
    const body = { targetType: 'USER', targetId: sender.id, reason: 'SPAM' };
    const first = await api(baseUrl, 'POST', '/api/reports', { token: receiver.token, body });
    expect(first.status).toBe(201);

    const again = await api(baseUrl, 'POST', '/api/reports', { token: receiver.token, body });
    expect(again.status).toBe(409);

    const self = await api(baseUrl, 'POST', '/api/reports', {
      token: sender.token,
      body: { targetType: 'USER', targetId: sender.id, reason: 'OTHER' },
    });
    expect(self.status).toBe(400);
  });

  it('accepts the reasons the interface actually offers', async () => {
    const { sender, receiver } = await pairWithMessage();
    const res = await api(baseUrl, 'POST', '/api/reports', {
      token: receiver.token,
      body: { targetType: 'USER', targetId: sender.id, reason: 'FALSE_INFORMATION' },
    });
    expect(res.status).toBe(201);

    const offTopic = await api(baseUrl, 'POST', '/api/reports', {
      token: receiver.token,
      body: { targetType: 'USER', targetId: sender.id, reason: 'OFF_TOPIC' },
    });
    // Different reason, same target: still an open duplicate.
    expect(offTopic.status).toBe(409);
  });

  it("lists only the caller's own reports", async () => {
    const { sender, receiver } = await pairWithMessage();
    await api(baseUrl, 'POST', '/api/reports', {
      token: receiver.token,
      body: { targetType: 'USER', targetId: sender.id, reason: 'HARASSMENT' },
    });

    const mine = await api<{ data: { targetType: string }[] }>(baseUrl, 'GET', '/api/reports/mine', {
      token: receiver.token,
    });
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBe(1);
    expect(mine.body.data[0].targetType).toBe('USER');

    const other = await api<{ data: unknown[] }>(baseUrl, 'GET', '/api/reports/mine', { token: sender.token });
    expect(other.body.data.length).toBe(0);
  });
});

// ------------------------------------------------------------------ calls

describe('call authorisation', () => {
  let caller: TestAccount;
  let callee: TestAccount;
  let outsider: TestAccount;

  beforeAll(async () => {
    caller = await createAccount(baseUrl);
    callee = await createAccount(baseUrl);
    outsider = await createAccount(baseUrl);
  });

  it('requires authentication to read ICE servers', async () => {
    const res = await api(baseUrl, 'GET', '/api/calls/ice');
    expect(res.status).toBe(401);
  });

  it('returns ICE servers to an authenticated member', async () => {
    const res = await api<{ data: { iceServers: unknown[] } }>(baseUrl, 'GET', '/api/calls/ice', {
      token: caller.token,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.iceServers)).toBe(true);
  });

  it('refuses a call to an unknown username', async () => {
    const res = await api(baseUrl, 'POST', '/api/calls', {
      token: caller.token,
      body: { username: `ghost${uniqueSuffix()}`, type: 'AUDIO' },
    });
    expect(res.status).toBe(404);
  });

  it('refuses a call to yourself', async () => {
    const res = await api(baseUrl, 'POST', '/api/calls', {
      token: caller.token,
      body: { username: caller.username, type: 'AUDIO' },
    });
    expect(res.status).toBe(400);
  });

  it('creates a ringing call and hides it from an unrelated member', async () => {
    const started = await api<{ data: { id: string; status: string } }>(baseUrl, 'POST', '/api/calls', {
      token: caller.token,
      body: { username: callee.username, type: 'VIDEO' },
    });
    expect(started.status).toBe(201);
    expect(started.body.data.status).toBe('RINGING');
    const callId = started.body.data.id;

    // The callee can read it.
    const asCallee = await api(baseUrl, 'GET', `/api/calls/${callId}`, { token: callee.token });
    expect(asCallee.status).toBe(200);

    // An unrelated member gets a 404, not a 403 — the call is not disclosed.
    const asOutsider = await api(baseUrl, 'GET', `/api/calls/${callId}`, { token: outsider.token });
    expect(asOutsider.status).toBe(404);

    // Nor can an outsider accept it.
    const outsiderAccept = await api(baseUrl, 'POST', `/api/calls/${callId}/accept`, {
      token: outsider.token,
      body: {},
    });
    expect(outsiderAccept.status).toBe(404);

    await prisma.callSession.delete({ where: { id: callId } });
  });

  it('only lets the callee accept, and records the acceptance', async () => {
    const started = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/calls', {
      token: caller.token,
      body: { username: callee.username, type: 'AUDIO' },
    });
    const callId = started.body.data.id;

    const callerAccept = await api(baseUrl, 'POST', `/api/calls/${callId}/accept`, {
      token: caller.token,
      body: {},
    });
    expect(callerAccept.status).toBe(403);

    const calleeAccept = await api<{ data: { status: string } }>(baseUrl, 'POST', `/api/calls/${callId}/accept`, {
      token: callee.token,
      body: {},
    });
    expect(calleeAccept.status).toBe(200);
    expect(calleeAccept.body.data.status).toBe('ACCEPTED');

    const row = await prisma.callSession.findUnique({ where: { id: callId }, select: { status: true, acceptedAt: true } });
    expect(row?.status).toBe('ACCEPTED');
    expect(row?.acceptedAt).not.toBeNull();

    const ended = await api<{ data: { status: string } }>(baseUrl, 'POST', `/api/calls/${callId}/end`, {
      token: caller.token,
      body: {},
    });
    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe('ENDED');
  });

  it('lists only the caller\'s own call history', async () => {
    const res = await api<{ data: { id: string }[] }>(baseUrl, 'GET', '/api/calls', { token: caller.token });
    expect(res.status).toBe(200);

    const other = await api<{ data: { id: string }[] }>(baseUrl, 'GET', '/api/calls', { token: outsider.token });
    const callerIds = new Set(res.body.data.map((c) => c.id));
    for (const call of other.body.data) {
      expect(callerIds.has(call.id)).toBe(false);
    }
  });
});

// ------------------------------------------------------- AI study assistant

describe('AI study assistant', () => {
  let member: TestAccount;

  beforeAll(async () => {
    member = await createAccount(baseUrl);
  });

  it('creates a conversation owned by the caller', async () => {
    const res = await api<{ data: { id: string; title: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: member.token,
      body: {},
    });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
  });

  it('does not disclose another member\'s conversation', async () => {
    const created = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: member.token,
      body: {},
    });
    const other = await createAccount(baseUrl);

    const res = await api(baseUrl, 'GET', `/api/ai/conversations/${created.body.data.id}`, {
      token: other.token,
    });
    expect(res.status).toBe(404);
  });

  it('stores the question and reports a missing provider honestly', async () => {
    const created = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: member.token,
      body: {},
    });
    const conversationId = created.body.data.id;

    const res = await api<{ error: { code: string; details?: { savedMessageId?: string } } }>(
      baseUrl,
      'POST',
      `/api/ai/conversations/${conversationId}/messages`,
      { token: member.token, body: { content: 'Explain Newton second law' } },
    );

    // Without GROQ_API_KEY in the test environment the route must say so rather
    // than invent a reply.
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');

    const stored = await prisma.aiMessage.findMany({ where: { conversationId } });
    expect(stored).toHaveLength(1);
    expect(stored[0].role).toBe('USER');

    // No assistant message was fabricated.
    expect(stored.some((m) => m.role === 'ASSISTANT')).toBe(false);
  });

  it('blocks a non-study prompt before it reaches the provider', async () => {
    const created = await api<{ data: { id: string } }>(baseUrl, 'POST', '/api/ai/conversations', {
      token: member.token,
      body: {},
    });
    const res = await api<{ error: { code: string } }>(
      baseUrl,
      'POST',
      `/api/ai/conversations/${created.body.data.id}/messages`,
      { token: member.token, body: { content: 'send me porn links' } },
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AI_PROMPT_BLOCKED');
  });

  it('never returns a password hash or provider secret', async () => {
    const res = await api(baseUrl, 'GET', '/api/profile/me', { token: member.token });
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/passwordHash/i);
    expect(serialised).not.toMatch(/GROQ_API_KEY|gsk_/);
  });
});

// -------------------------------------------------------------- real users

describe('real-user-only discovery', () => {
  it('returns only accounts that actually exist for a search', async () => {
    const searcher = await createAccount(baseUrl);
    const target = await createAccount(baseUrl);

    const res = await api<{ data: { username: string }[] }>(
      baseUrl,
      'GET',
      `/api/members?search=${encodeURIComponent(target.username)}`,
      { token: searcher.token },
    );
    expect(res.status).toBe(200);

    for (const member of res.body.data) {
      const exists = await prisma.user.findUnique({ where: { username: member.username } });
      expect(exists).not.toBeNull();
    }
  });

  it('returns an empty result for a username nobody holds', async () => {
    const searcher = await createAccount(baseUrl);
    const res = await api<{ data: unknown[] }>(
      baseUrl,
      'GET',
      `/api/members?search=definitely-not-a-real-user-${uniqueSuffix()}`,
      { token: searcher.token },
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
