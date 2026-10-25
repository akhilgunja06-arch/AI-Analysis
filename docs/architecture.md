# Architecture

## Overview

SkillSpring is a two-tier application. A React single-page app talks to an
Express JSON API over HTTP, with a Socket.IO channel for messages and
notifications. PostgreSQL is the only stateful dependency.

```
┌───────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│                                                                   │
│  React + TypeScript SPA                                           │
│   • React Router — route-level code splitting                     │
│   • TanStack Query — server state, caching, retries               │
│   • Tailwind CSS design tokens — light and dark themes            │
│   • Framer Motion — page and card transitions                     │
└───────────────┬───────────────────────────────┬───────────────────┘
                │ HTTPS                         │ WebSocket
                │ /api/*                        │ /socket.io
                ▼                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  Express API (Node.js + TypeScript)                               │
│                                                                   │
│  helmet · CORS allow-list · compression · request logging         │
│  rate limiting · origin guard · cookie parsing                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Routers       auth · profile · skills · members · matches   │  │
│  │               exchanges · sessions · messaging              │  │
│  │               notifications · reviews · community           │  │
│  │               settings · learning · admin · support         │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Middleware    requireAuth · requireRole · validate(Zod)     │  │
│  │               error handler · not-found handler             │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Services      matching · exchange state machine · progress  │  │
│  │               notifications · storage · mailer · realtime   │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Data access   Prisma Client                                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────┬───────────────────────────────┬───────────────────┘
                │ SQL                           │ SMTP (optional)
                ▼                               ▼
        ┌───────────────┐               ┌──────────────────┐
        │  PostgreSQL   │               │  Mail provider   │
        └───────────────┘               └──────────────────┘
```

## Request lifecycle

1. The browser sends a request to `/api/*` with the access token in an
   `Authorization: Bearer` header.
2. `helmet`, compression and the CORS allow-list run first. `csrfOriginGuard`
   rejects state-changing requests whose `Origin` is not allow-listed.
3. Rate limiting applies, with a stricter bucket for authentication routes.
4. The matched router runs `requireAuth`, then `requireRole` where the route
   needs a specific role, then Zod validation of the body, query and params.
5. The handler calls a service. Anything that changes an exchange status goes
   through the state machine, which rejects invalid transitions with 409.
6. Prisma performs the query. Multi-step writes run inside a transaction.
7. The response is normalised by helpers so every success is `{ data: ... }` and
   every failure is `{ error: { code, message, details? } }`.
8. The error handler converts known errors to their status code and maps
   unexpected ones to 500 without leaking internals. Logs never include
   passwords, tokens or message bodies.

## Authentication

- Passwords are hashed with bcrypt, with a server-side pepper as defence in
  depth.
- Login issues a short-lived access token (15 minutes by default) and a
  long-lived refresh token. Refresh tokens are stored as sessions so they can be
  revoked.
- Access tokens are verified on every request. The token payload carries the user
  id only; the role is read from the database so a role change takes effect
  immediately.
- Authorization never trusts a client-supplied user id or role. Ownership is
  checked against the authenticated principal on every mutating route.

## Realtime

`socket.io` authenticates the handshake with the same access token as the REST
API. Each socket joins only its own `user:<id>` room, so a client cannot
subscribe to another member's stream. Sending a message re-checks conversation
membership against the database, so a forged conversation id cannot leak history.

## Domain services

| Service | Responsibility |
| --- | --- |
| `matching.service.ts` | Deterministic compatibility score with a published breakdown |
| `exchange-state.service.ts` | Allowed lifecycle transitions and who may perform them |
| `progress.service.ts` | Single source of truth for exchange progress |
| `notifications.service.ts` | Notification creation and delivery |
| `storage.service.ts` | Avatar and attachment storage (local or S3) |
| `mailer.service.ts` | Verification and reset delivery (console, SMTP or disabled) |

`progress.service.ts` exists because three views previously computed progress
with two different formulas and disagreed with each other. The exchange list, the
workspace and the learning page now all call `computeExchangeProgress`, so they
cannot drift apart again.

## Matching

The score is deterministic arithmetic, not AI, and the API returns the breakdown
so a member can see why a recommendation appeared.

| Component | Max | Rule |
| --- | --- | --- |
| They teach what I want to learn | 30 | Scored per complementary skill |
| I teach what they want to learn | 25 | Scored per complementary skill |
| Shared languages | 12 | 3 per shared language, capped |
| Timezone proximity | 10 | Full marks within 2 hours, then 2 points per hour lost |
| Availability overlap | 13 | 1 point per overlapping hour per week, capped |
| Reputation | 10 | Scaled from the mean of real reviews; neutral when unreviewed |

Ties break on username so ordering is stable across requests.

## Front end

- Route-level code splitting via lazy imports; third-party libraries are split
  into separate chunks so the entry bundle stays small.
- TanStack Query owns server state. Components render explicit loading, error and
  empty states rather than assuming data is present.
- The API client centralises error handling: it attaches the access token,
  refreshes it once on 401, and turns error payloads into typed errors.
- No secret is stored in the front end. The only front-end environment variables
  are the public API and socket URLs.
- The design system lives in `web/src/components/ui` with tokens in the Tailwind
  config. Motion respects the reduced-motion preference.

## Configuration

All configuration comes from environment variables, validated at startup with
Zod in `server/src/config/env.ts`. The server exits with a clear message if a
required value is missing, and refuses to start in production with a weak secret,
no pepper, insecure cookies or a localhost CORS origin.
