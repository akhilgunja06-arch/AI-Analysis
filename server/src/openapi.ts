import { env } from './config/env';

/**
 * OpenAPI 3.0 description of the public API surface.
 *
 * This is generated from the same constants the server enforces (exchange
 * transitions, match weights), so the documentation cannot silently drift from
 * the implementation for those parts.
 */
import { EXCHANGE_TRANSITIONS, EXCHANGE_STATUS_LABEL } from './services/exchange-state.service';
import { MATCH_WEIGHTS } from './services/matching.service';

const json = (schema: Record<string, unknown>) => ({ 'application/json': { schema } });

const errorResponse = {
  description: 'Error',
  content: json({
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string' },
          details: { type: 'object', nullable: true },
        },
        required: ['code', 'message'],
      },
    },
  }),
};

const listEnvelope = (itemRef: string, extraProps: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: { $ref: `#/components/schemas/${itemRef}` } },
    meta: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
        totalPages: { type: 'integer' },
        hasNext: { type: 'boolean' },
        hasPrev: { type: 'boolean' },
        ...extraProps,
      },
    },
  },
});

const itemEnvelope = (itemRef: string) => ({
  type: 'object',
  properties: { data: { $ref: `#/components/schemas/${itemRef}` } },
});

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 12 } },
];

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SkillSpring API',
    version: '1.0.0',
    description: [
      'REST API for SkillSpring, a peer-to-peer skills exchange platform.',
      '',
      '**Response envelope.** Success: `{ "data": ... , "meta": { ... }? }`. Failure: `{ "error": { "code", "message", "details"? } }`.',
      '',
      '**Authentication.** Send the access token from `/api/auth/login` as `Authorization: Bearer <token>`. The refresh token is an httpOnly cookie, rotated on every use at `/api/auth/refresh`.',
      '',
      '**Authorisation.** Roles are read from the database on every request; a token can never grant a role it no longer has. Members can only read and write their own resources.',
      '',
      '**Rate limits.** Global, credential and write limits apply; 429 is returned with `code: RATE_LIMITED`.',
      '',
      '**Matching.** Scores are deterministic arithmetic, not machine learning. The weights are published in `/api/matches` and below.',
    ].join('\n'),
  },
  servers: [{ url: env.API_PUBLIC_URL, description: env.NODE_ENV }],
  tags: [
    { name: 'auth', description: 'Registration, sessions, email verification, password reset' },
    { name: 'profile', description: 'Own profile, onboarding, availability' },
    { name: 'skills', description: 'Skill taxonomy and a member\u2019s own teach/learn lists' },
    { name: 'members', description: 'Public member directory and profiles' },
    { name: 'matches', description: 'Deterministic, explainable partner recommendations' },
    { name: 'exchanges', description: 'Exchange requests and workspaces' },
    { name: 'sessions', description: 'Scheduling and session records' },
    { name: 'messages', description: 'Conversations and messages' },
    { name: 'notifications', description: 'In-app notifications' },
    { name: 'reviews', description: 'Feedback and reputation' },
    { name: 'community', description: 'Discussions, replies and votes' },
    { name: 'settings', description: 'Account, privacy, export and deletion' },
    { name: 'learning', description: 'Progress tracking' },
    { name: 'admin', description: 'Moderation and administration (staff only)' },
    { name: 'support', description: 'FAQ, support form and integration status' },
    { name: 'stats', description: 'Live platform statistics' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object', nullable: true },
            },
          },
        },
      },
      SessionUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['MEMBER', 'MODERATOR', 'ADMIN'] },
          status: { type: 'string', enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
          emailVerified: { type: 'boolean' },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/SessionUser' },
          accessToken: { type: 'string' },
        },
      },
      SkillRef: {
        type: 'object',
        properties: {
          skillId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          level: { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] },
          category: { type: 'string' },
        },
      },
      PublicMember: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          username: { type: 'string' },
          displayName: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          headline: { type: 'string', nullable: true },
          bio: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true, description: 'Null when the member hid it' },
          timezone: { type: 'string', nullable: true },
          languages: { type: 'array', items: { type: 'string' } },
          emailVerified: { type: 'boolean' },
          memberSince: { type: 'string', format: 'date-time' },
          teaches: { type: 'array', items: { $ref: '#/components/schemas/SkillRef' } },
          wants: { type: 'array', items: { $ref: '#/components/schemas/SkillRef' } },
          availability: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                weekday: { type: 'integer', minimum: 0, maximum: 6 },
                startMinute: { type: 'integer' },
                endMinute: { type: 'integer' },
                format: { type: 'string' },
              },
            },
          },
          stats: {
            type: 'object',
            properties: {
              completedExchanges: { type: 'integer' },
              activeExchanges: { type: 'integer' },
              reviewsCount: { type: 'integer' },
              averageRating: { type: 'number', nullable: true },
              followers: { type: 'integer' },
              following: { type: 'integer' },
            },
          },
        },
      },
      MatchResult: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          username: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          breakdown: {
            type: 'object',
            properties: {
              skillTeachToLearn: { type: 'integer', maximum: MATCH_WEIGHTS.teachToLearn },
              skillLearnToTeach: { type: 'integer', maximum: MATCH_WEIGHTS.learnToTeach },
              language: { type: 'integer', maximum: MATCH_WEIGHTS.languageCap },
              timezone: { type: 'integer', maximum: MATCH_WEIGHTS.timezoneMax },
              availability: { type: 'integer', maximum: MATCH_WEIGHTS.availabilityCap },
              reputation: { type: 'integer', maximum: MATCH_WEIGHTS.reputationMax },
            },
          },
          reasons: { type: 'array', items: { type: 'string' }, description: 'Human-readable explanation of the score' },
        },
      },
      ExchangeRequest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: Object.keys(EXCHANGE_TRANSITIONS) },
          statusLabel: { type: 'string' },
          message: { type: 'string', nullable: true },
          goals: { type: 'string', nullable: true },
          terms: {
            type: 'object',
            properties: {
              sessionMinutes: { type: 'integer' },
              sessionsPerWeek: { type: 'integer' },
              totalSessions: { type: 'integer' },
              preferredFormat: { type: 'string' },
            },
          },
          initiator: { type: 'object', additionalProperties: true },
          recipient: { type: 'object', additionalProperties: true },
          exchangeId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      Exchange: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          status: { type: 'string', enum: Object.keys(EXCHANGE_TRANSITIONS) },
          statusLabel: { type: 'string' },
          goals: { type: 'string', nullable: true },
          participants: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string', nullable: true },
          link: { type: 'string', nullable: true },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CommunityPost: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          excerpt: { type: 'string' },
          postType: { type: 'string', enum: ['DISCUSSION', 'QUESTION', 'RESOURCE'] },
          voteCount: { type: 'integer' },
          commentCount: { type: 'integer' },
          myVote: { type: 'integer', enum: [-1, 0, 1] },
        },
      },
      Report: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          targetType: { type: 'string', enum: ['USER', 'MESSAGE', 'REVIEW', 'COMMUNITY_POST', 'COMMUNITY_COMMENT'] },
          reason: { type: 'string', enum: ['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'NO_SHOW', 'OTHER'] },
          status: { type: 'string', enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] },
        },
      },
      ExchangeTransitions: {
        type: 'object',
        description: `Permitted exchange status transitions: ${JSON.stringify(EXCHANGE_TRANSITIONS)}. Labels: ${JSON.stringify(EXCHANGE_STATUS_LABEL)}.`,
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      MatchWeights: {
        type: 'object',
        description: 'Deterministic scoring weights used by the matching engine. No ML model is involved.',
        properties: Object.fromEntries(Object.entries(MATCH_WEIGHTS).map(([k, v]) => [k, { type: 'number', example: v }])),
      },
    },
    responses: {
      Unauthorized: errorResponse,
      Forbidden: errorResponse,
      NotFound: errorResponse,
      ValidationError: errorResponse,
      Conflict: errorResponse,
      RateLimited: errorResponse,
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['auth'],
        summary: 'Create an account',
        security: [],
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'username', 'password', 'displayName', 'acceptedTerms'],
            properties: {
              email: { type: 'string', format: 'email' },
              username: { type: 'string', minLength: 3, maxLength: 30 },
              password: { type: 'string', minLength: 10, description: 'At least 10 characters with upper, lower and a digit' },
              displayName: { type: 'string' },
              acceptedTerms: { type: 'boolean', enum: [true] },
            },
          }),
        },
        responses: {
          201: { description: 'Account created; verification email queued', content: json(itemEnvelope('AuthResult')) },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationError' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Sign in',
        security: [],
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'password'],
            properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
          }),
        },
        responses: {
          200: { description: 'Signed in; refresh cookie set', content: json(itemEnvelope('AuthResult')) },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Rotate the refresh cookie and issue a new access token',
        security: [],
        responses: { 200: { description: 'New token issued', content: json(itemEnvelope('AuthResult')) }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/api/auth/logout': {
      post: { tags: ['auth'], summary: 'Sign out and revoke the current session', responses: { 204: { description: 'Signed out' } } },
    },
    '/api/auth/me': {
      get: { tags: ['auth'], summary: 'Current account and profile', responses: { 200: { description: 'Account' }, 401: { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/api/auth/verify-email': {
      post: {
        tags: ['auth'],
        summary: 'Verify an email address with a one-time token',
        security: [],
        requestBody: { required: true, content: json({ type: 'object', required: ['token'], properties: { token: { type: 'string' } } }) },
        responses: { 200: { description: 'Verified' }, 400: { description: 'Invalid or expired token' } },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['auth'],
        summary: 'Request a password reset link',
        security: [],
        description: 'Always returns 200, whether or not the address exists, to avoid account enumeration.',
        requestBody: { required: true, content: json({ type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }) },
        responses: { 200: { description: 'Request accepted' }, 429: { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['auth'],
        summary: 'Complete a password reset',
        security: [],
        description: 'Revokes every existing session for the account.',
        requestBody: {
          required: true,
          content: json({ type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string' } } }),
        },
        responses: { 200: { description: 'Password reset' }, 400: { description: 'Invalid or expired token' } },
      },
    },
    '/api/auth/sessions': {
      get: { tags: ['auth'], summary: 'List active sessions', responses: { 200: { description: 'Sessions' } } },
    },
    '/api/auth/sessions/{id}': {
      delete: {
        tags: ['auth'],
        summary: 'Revoke one session',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Revoked' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/api/profile': {
      get: { tags: ['profile'], summary: 'Own profile with completion score', responses: { 200: { description: 'Profile' } } },
      patch: {
        tags: ['profile'],
        summary: 'Update own profile',
        requestBody: { content: json({ type: 'object', additionalProperties: true }) },
        responses: { 200: { description: 'Updated' }, 422: { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/api/profile/avatar': {
      post: {
        tags: ['profile'],
        summary: 'Upload a profile photo',
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Uploaded' }, 400: { description: 'Unsupported file type' } },
      },
    },
    '/api/profile/availability': {
      get: { tags: ['profile'], summary: 'Weekly availability windows', responses: { 200: { description: 'Windows' } } },
      put: {
        tags: ['profile'],
        summary: 'Replace weekly availability',
        requestBody: {
          content: json({
            type: 'object',
            properties: {
              windows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    weekday: { type: 'integer', minimum: 0, maximum: 6 },
                    startMinute: { type: 'integer' },
                    endMinute: { type: 'integer' },
                    format: { type: 'string', enum: ['ONLINE', 'IN_PERSON', 'EITHER'] },
                  },
                },
              },
            },
          }),
        },
        responses: { 200: { description: 'Saved' }, 422: { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/api/profile/onboarding': {
      get: { tags: ['profile'], summary: 'Onboarding progress so a member can resume', responses: { 200: { description: 'Progress' } } },
      patch: {
        tags: ['profile'],
        summary: 'Save onboarding step or mark it complete',
        requestBody: { content: json({ type: 'object', properties: { step: { type: 'integer', minimum: 1, maximum: 5 }, completed: { type: 'boolean' } } }) },
        responses: { 200: { description: 'Saved' }, 422: { description: 'Profile too incomplete to finish' } },
      },
    },
    '/api/skills/categories': {
      get: { tags: ['skills'], summary: 'Skill categories with live teacher counts', security: [], responses: { 200: { description: 'Categories' } } },
    },
    '/api/skills': {
      get: {
        tags: ['skills'],
        summary: 'Search the skill taxonomy',
        security: [],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Skills' } },
      },
      post: {
        tags: ['skills'],
        summary: 'Create a taxonomy skill (moderator or admin)',
        requestBody: { content: json({ type: 'object', required: ['name', 'categoryId'], properties: { name: { type: 'string' }, categoryId: { type: 'string', format: 'uuid' }, description: { type: 'string' } } }) },
        responses: { 201: { description: 'Created' }, 403: { $ref: '#/components/responses/Forbidden' }, 409: { $ref: '#/components/responses/Conflict' } },
      },
    },
    '/api/skills/trending': {
      get: { tags: ['skills'], summary: 'Trending skills from live member activity', security: [], responses: { 200: { description: 'Trending' } } },
    },
    '/api/skills/mine': {
      get: { tags: ['skills'], summary: 'My teach and learn lists', responses: { 200: { description: 'Lists' } } },
      post: {
        tags: ['skills'],
        summary: 'Add a skill I teach or want to learn',
        requestBody: {
          content: json({
            type: 'object',
            required: ['skillId', 'direction'],
            properties: {
              skillId: { type: 'string', format: 'uuid' },
              direction: { type: 'string', enum: ['TEACH', 'LEARN'] },
              level: { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] },
              description: { type: 'string' },
              outcomes: { type: 'string' },
              portfolioUrl: { type: 'string' },
            },
          }),
        },
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate skill entry' } },
      },
    },
    '/api/skills/mine/{id}': {
      patch: {
        tags: ['skills'],
        summary: 'Edit one of my skill entries',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: json({ type: 'object', additionalProperties: true }) },
        responses: { 200: { description: 'Updated' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
      delete: {
        tags: ['skills'],
        summary: 'Remove one of my skill entries',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Removed' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/api/members': {
      get: {
        tags: ['members'],
        summary: 'Public member directory',
        security: [],
        parameters: [
          ...paginationParams,
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'teachesSkillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'wantsSkillId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'language', in: 'query', schema: { type: 'string' } },
          { name: 'timezone', in: 'query', schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['ONLINE', 'IN_PERSON', 'EITHER'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['recent', 'rating', 'name'] } },
        ],
        responses: { 200: { description: 'Members', content: json(listEnvelope('PublicMember')) } },
      },
    },
    '/api/members/{username}': {
      get: {
        tags: ['members'],
        summary: 'Public member profile',
        security: [],
        description: 'Never returns an email address. Private fields are omitted or nulled according to the member\u2019s privacy settings.',
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Profile', content: json(itemEnvelope('PublicMember')) }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/api/members/{username}/follow': {
      post: {
        tags: ['members'],
        summary: 'Follow a member',
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Following' } },
      },
      delete: {
        tags: ['members'],
        summary: 'Unfollow a member',
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Unfollowed' } },
      },
    },
    '/api/matches': {
      get: {
        tags: ['matches'],
        summary: 'Explainable partner recommendations',
        description: 'Deterministic scoring. The response includes the weights and a per-match breakdown so the score can be reproduced by hand.',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50, default: 20 } },
          { name: 'minScore', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 100 } },
          { name: 'requireReciprocal', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: { 200: { description: 'Matches', content: json({ type: 'object', properties: { data: { type: 'object', properties: { matches: { type: 'array', items: { $ref: '#/components/schemas/MatchResult' } }, criteria: { $ref: '#/components/schemas/MatchWeights' } } } } }) } },
      },
    },
    '/api/matches/{userId}/dismiss': {
      post: {
        tags: ['matches'],
        summary: 'Dismiss a recommendation',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Dismissed' } },
      },
      delete: {
        tags: ['matches'],
        summary: 'Restore a dismissed recommendation',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Restored' } },
      },
    },
    '/api/exchanges/requests': {
      get: {
        tags: ['exchanges'],
        summary: 'Incoming and outgoing requests',
        parameters: [
          ...paginationParams,
          { name: 'box', in: 'query', schema: { type: 'string', enum: ['incoming', 'outgoing', 'all'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: Object.keys(EXCHANGE_TRANSITIONS) } },
        ],
        responses: { 200: { description: 'Requests', content: json(listEnvelope('ExchangeRequest')) } },
      },
      post: {
        tags: ['exchanges'],
        summary: 'Send an exchange request',
        description: 'Requires a verified email. Duplicate open requests between the same two members are rejected.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['recipientId'],
            properties: {
              recipientId: { type: 'string', format: 'uuid' },
              offeredSkillId: { type: 'string', format: 'uuid', nullable: true },
              requestedSkillId: { type: 'string', format: 'uuid', nullable: true },
              message: { type: 'string' },
              goals: { type: 'string' },
              sessionMinutes: { type: 'integer', minimum: 15, maximum: 240, default: 60 },
              sessionsPerWeek: { type: 'integer', minimum: 1, maximum: 7, default: 1 },
              totalSessions: { type: 'integer', minimum: 1, maximum: 52, default: 6 },
              preferredFormat: { type: 'string', enum: ['ONLINE', 'IN_PERSON', 'EITHER'] },
            },
          }),
        },
        responses: { 201: { description: 'Created' }, 403: { $ref: '#/components/responses/Forbidden' }, 409: { $ref: '#/components/responses/Conflict' } },
      },
    },
    '/api/exchanges/requests/{id}/respond': {
      post: {
        tags: ['exchanges'],
        summary: 'Accept, decline, withdraw or counter a request',
        description: `Allowed transitions are enforced server-side: ${JSON.stringify(EXCHANGE_TRANSITIONS)}. Accepting creates the exchange workspace in one transaction.`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: json({
            oneOf: [
              { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['accept'] } } },
              { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['decline'] }, reason: { type: 'string' } } },
              { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['withdraw'] } } },
              {
                type: 'object',
                required: ['action', 'sessionMinutes', 'sessionsPerWeek', 'totalSessions', 'preferredFormat'],
                properties: {
                  action: { type: 'string', enum: ['counter'] },
                  message: { type: 'string' },
                  sessionMinutes: { type: 'integer' },
                  sessionsPerWeek: { type: 'integer' },
                  totalSessions: { type: 'integer' },
                  preferredFormat: { type: 'string', enum: ['ONLINE', 'IN_PERSON', 'EITHER'] },
                },
              },
            ],
          }),
        },
        responses: { 200: { description: 'Applied' }, 403: { description: 'Wrong side of the request' }, 409: { description: 'Transition not permitted' } },
      },
    },
    '/api/exchanges': {
      get: { tags: ['exchanges'], summary: 'My exchanges with progress counters', parameters: paginationParams, responses: { 200: { description: 'Exchanges', content: json(listEnvelope('Exchange')) } } },
    },
    '/api/exchanges/{id}': {
      get: {
        tags: ['exchanges'],
        summary: 'Exchange workspace',
        description: 'Only participants may read a workspace.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Workspace', content: json(itemEnvelope('Exchange')) }, 403: { $ref: '#/components/responses/Forbidden' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/api/exchanges/{id}/actions': {
      post: {
        tags: ['exchanges'],
        summary: 'Start, pause, resume, complete or cancel an exchange',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['start', 'pause', 'resume', 'complete', 'cancel'] }, reason: { type: 'string' } } }) },
        responses: { 200: { description: 'Applied' }, 409: { description: 'Transition not permitted', content: json({ $ref: '#/components/schemas/Error' }) } },
      },
    },
    '/api/exchanges/meta/transitions': {
      get: { tags: ['exchanges'], summary: 'The full exchange lifecycle', responses: { 200: { description: 'Transitions', content: json(itemEnvelope('ExchangeTransitions')) } } },
    },
    '/api/sessions': {
      get: {
        tags: ['sessions'],
        summary: 'Agenda of sessions',
        parameters: [
          ...paginationParams,
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
          { name: 'exchangeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Sessions' } },
      },
      post: {
        tags: ['sessions'],
        summary: 'Schedule a session',
        description: 'Returns 409 SCHEDULE_CONFLICT when any participant is already booked in the same window.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['exchangeId', 'startsAt'],
            properties: {
              exchangeId: { type: 'string', format: 'uuid' },
              startsAt: { type: 'string', format: 'date-time' },
              durationMinutes: { type: 'integer', minimum: 15, maximum: 480, default: 60 },
              timezone: { type: 'string' },
              format: { type: 'string', enum: ['ONLINE', 'IN_PERSON', 'EITHER'] },
              meetingUrl: { type: 'string' },
              location: { type: 'string' },
            },
          }),
        },
        responses: { 201: { description: 'Scheduled' }, 409: { description: 'Schedule conflict', content: json({ $ref: '#/components/schemas/Error' }) } },
      },
    },
    '/api/sessions/{id}': {
      patch: {
        tags: ['sessions'],
        summary: 'Update, reschedule, complete or cancel a session',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: json({ type: 'object', additionalProperties: true }) },
        responses: { 200: { description: 'Updated' }, 403: { description: 'Only the host can complete it' }, 409: { description: 'Conflict' } },
      },
      delete: {
        tags: ['sessions'],
        summary: 'Delete a session that is not yet complete',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Deleted' }, 409: { description: 'Completed sessions are retained' } },
      },
    },
    '/api/messages/conversations': {
      get: { tags: ['messages'], summary: 'My conversations with unread counts', responses: { 200: { description: 'Conversations' } } },
      post: {
        tags: ['messages'],
        summary: 'Open or reuse a 1:1 conversation',
        requestBody: { required: true, content: json({ type: 'object', required: ['username'], properties: { username: { type: 'string' }, message: { type: 'string' } } }) },
        responses: { 201: { description: 'Conversation' }, 403: { description: 'Messaging not permitted' } },
      },
    },
    '/api/messages/conversations/{id}': {
      get: {
        tags: ['messages'],
        summary: 'Message history',
        description: 'The caller must be a participant. Marking as read happens on fetch.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, ...paginationParams],
        responses: { 200: { description: 'Messages' }, 404: { description: 'Not a participant (indistinguishable from missing)' } },
      },
      post: {
        tags: ['messages'],
        summary: 'Send a message',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 4000 } } }) },
        responses: { 201: { description: 'Sent' }, 403: { description: 'Blocked' } },
      },
      delete: {
        tags: ['messages'],
        summary: 'Leave a conversation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Left' } },
      },
    },
    '/api/messages/conversations/{id}/read': {
      post: { tags: ['messages'], summary: 'Mark a conversation read', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Read' } } },
    },
    '/api/messages/users/{username}/block': {
      post: { tags: ['messages'], summary: 'Block a member', parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Blocked' } } },
      delete: { tags: ['messages'], summary: 'Unblock a member', parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Unblocked' } } },
    },
    '/api/notifications': {
      get: { tags: ['notifications'], summary: 'My notifications', parameters: [...paginationParams, { name: 'unreadOnly', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }], responses: { 200: { description: 'Notifications', content: json(listEnvelope('Notification')) } } },
      delete: { tags: ['notifications'], summary: 'Clear read notifications', responses: { 200: { description: 'Deleted' } } },
    },
    '/api/notifications/read-all': {
      post: { tags: ['notifications'], summary: 'Mark everything read', responses: { 200: { description: 'Marked' } } },
    },
    '/api/reviews': {
      post: {
        tags: ['reviews'],
        summary: 'Review a completed exchange partner',
        description: 'One review per reviewer per exchange. Self-reviews are rejected both here and by a database check constraint.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['exchangeId', 'subjectId', 'rating'],
            properties: {
              exchangeId: { type: 'string', format: 'uuid' },
              subjectId: { type: 'string', format: 'uuid' },
              rating: { type: 'integer', minimum: 1, maximum: 5 },
              teachingRating: { type: 'integer', minimum: 1, maximum: 5 },
              communicationRating: { type: 'integer', minimum: 1, maximum: 5 },
              reliabilityRating: { type: 'integer', minimum: 1, maximum: 5 },
              comment: { type: 'string' },
            },
          }),
        },
        responses: { 201: { description: 'Created' }, 403: { $ref: '#/components/responses/Forbidden' }, 409: { description: 'Already reviewed' } },
      },
    },
    '/api/reviews/pending': {
      get: { tags: ['reviews'], summary: 'Exchanges still awaiting my feedback', responses: { 200: { description: 'Pending reviews' } } },
    },
    '/api/reviews/user/{username}': {
      get: {
        tags: ['reviews'],
        summary: 'Public reviews and aggregate rating for a member',
        security: [],
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }, ...paginationParams],
        responses: { 200: { description: 'Reviews with distribution' } },
      },
    },
    '/api/community/posts': {
      get: {
        tags: ['community'],
        summary: 'Discussion feed',
        security: [],
        parameters: [
          ...paginationParams,
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'postType', in: 'query', schema: { type: 'string', enum: ['DISCUSSION', 'QUESTION', 'RESOURCE'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['recent', 'popular', 'unanswered'] } },
        ],
        responses: { 200: { description: 'Posts', content: json(listEnvelope('CommunityPost')) } },
      },
      post: {
        tags: ['community'],
        summary: 'Create a post',
        requestBody: { required: true, content: json({ type: 'object', required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' }, postType: { type: 'string', enum: ['DISCUSSION', 'QUESTION', 'RESOURCE'] }, categoryId: { type: 'string', format: 'uuid' }, skillId: { type: 'string', format: 'uuid' } } }) },
        responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate title just posted' }, 429: { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/api/community/posts/{id}/vote': {
      post: {
        tags: ['community'],
        summary: 'Vote on a post (1, -1, or 0 to clear)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['value'], properties: { value: { type: 'integer', enum: [1, -1, 0] } } }) },
        responses: { 200: { description: 'New vote total' } },
      },
    },
    '/api/community/posts/{id}/comments': {
      post: {
        tags: ['community'],
        summary: 'Reply to a post',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['body'], properties: { body: { type: 'string' }, parentId: { type: 'string', format: 'uuid', nullable: true } } }) },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/settings': {
      get: { tags: ['settings'], summary: 'Account, privacy, notification and session settings', responses: { 200: { description: 'Settings' } } },
    },
    '/api/settings/preferences': {
      patch: { tags: ['settings'], summary: 'Update privacy and notification preferences', requestBody: { content: json({ type: 'object', additionalProperties: true }) }, responses: { 200: { description: 'Updated' } } },
    },
    '/api/settings/password': {
      patch: {
        tags: ['settings'],
        summary: 'Change password',
        description: 'Requires the current password. Revokes every other session.',
        requestBody: { required: true, content: json({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } }) },
        responses: { 200: { description: 'Changed' }, 401: { description: 'Current password incorrect' } },
      },
    },
    '/api/settings/export': {
      get: { tags: ['settings'], summary: 'Download all personal data as JSON', responses: { 200: { description: 'JSON file' } } },
    },
    '/api/settings/deactivate': {
      post: { tags: ['settings'], summary: 'Deactivate the account (reversible)', requestBody: { required: true, content: json({ type: 'object', required: ['password'], properties: { password: { type: 'string' } } }) }, responses: { 200: { description: 'Deactivated' } } },
    },
    '/api/settings/account': {
      delete: {
        tags: ['settings'],
        summary: 'Permanently delete the account',
        description: 'Requires the password and the exact confirmation string.',
        requestBody: { required: true, content: json({ type: 'object', required: ['password', 'confirmation'], properties: { password: { type: 'string' }, confirmation: { type: 'string', enum: ['DELETE MY ACCOUNT'] } } }) },
        responses: { 204: { description: 'Deleted' }, 401: { description: 'Password incorrect' }, 422: { description: 'Confirmation text incorrect' } },
      },
    },
    '/api/learning': {
      get: {
        tags: ['learning'],
        summary: 'Learning progress derived from recorded data',
        parameters: [{ name: 'scope', in: 'query', schema: { type: 'string', enum: ['all', 'active', 'completed'] } }],
        responses: { 200: { description: 'Progress, learning paths and weekly activity' } },
      },
    },
    '/api/dashboard': {
      get: { tags: ['learning'], summary: 'All dashboard widget data', responses: { 200: { description: 'Dashboard payload' } } },
    },
    '/api/stats': {
      get: { tags: ['stats'], summary: 'Live platform statistics', security: [], responses: { 200: { description: 'Counts from the database' } } },
    },
    '/api/admin/overview': {
      get: { tags: ['admin'], summary: 'Platform health (staff only)', responses: { 200: { description: 'Overview' }, 403: { $ref: '#/components/responses/Forbidden' } } },
    },
    '/api/admin/users': {
      get: { tags: ['admin'], summary: 'User management', parameters: [...paginationParams, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'role', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Users' } } },
    },
    '/api/admin/users/{id}': {
      patch: {
        tags: ['admin'],
        summary: 'Suspend, reinstate, change role, or verify a user (admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['suspend', 'reinstate', 'promote', 'verify-email'] }, reason: { type: 'string' }, role: { type: 'string', enum: ['MEMBER', 'MODERATOR', 'ADMIN'] } } }) },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Self-lockout prevented' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/api/admin/reports': {
      get: { tags: ['admin'], summary: 'Moderation queue with content excerpts', parameters: [...paginationParams, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'targetType', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Reports', content: json(listEnvelope('Report')) } } },
    },
    '/api/admin/reports/{id}': {
      patch: {
        tags: ['admin'],
        summary: 'Resolve a report and apply a moderation action',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: json({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] }, action: { type: 'string', enum: ['NONE', 'CONTENT_HIDDEN', 'CONTENT_REMOVED', 'WARNING_ISSUED', 'USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_DISMISSED'] }, note: { type: 'string' } } }) },
        responses: { 200: { description: 'Resolved' }, 400: { description: 'Self-action prevented' } },
      },
    },
    '/api/admin/categories': {
      get: { tags: ['admin'], summary: 'Category management', responses: { 200: { description: 'Categories' } } },
      post: { tags: ['admin'], summary: 'Create a category (admin only)', requestBody: { required: true, content: json({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' }, color: { type: 'string' }, sortOrder: { type: 'integer' } } }) }, responses: { 201: { description: 'Created' }, 409: { $ref: '#/components/responses/Conflict' } } },
    },
    '/api/admin/audit-logs': {
      get: { tags: ['admin'], summary: 'Audit trail of sensitive actions (admin only)', parameters: [...paginationParams, { name: 'action', in: 'query', schema: { type: 'string' } }, { name: 'entityType', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Audit entries' } } },
    },
    '/api/support/faq': {
      get: { tags: ['support'], summary: 'Searchable FAQ', security: [], parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'FAQ categories' } } },
    },
    '/api/support/status': {
      get: { tags: ['support'], summary: 'Which optional integrations are configured', security: [], responses: { 200: { description: 'Integration status' } } },
    },
    '/api/support/contact': {
      post: {
        tags: ['support'],
        summary: 'Submit a support message',
        security: [],
        requestBody: { required: true, content: json({ type: 'object', required: ['name', 'email', 'subject', 'message'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, subject: { type: 'string' }, message: { type: 'string', minLength: 20 } } }) },
        responses: { 201: { description: 'Logged with a reference number' }, 422: { $ref: '#/components/responses/ValidationError' } },
      },
    },
  },
} as const;
