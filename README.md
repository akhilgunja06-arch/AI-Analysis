# SkillSpring — Skills Exchange Network

A peer-to-peer skills exchange. Members teach what they know and learn what they
want, settling the difference in time rather than money.

SkillSpring is an independent project. It is not affiliated with, endorsed by, or
connected to any other professional network.

- `server/` — Node.js + TypeScript + Express API, Prisma ORM, PostgreSQL
- `web/` — React + TypeScript + Vite front end, Tailwind CSS, Framer Motion
- `docs/` — architecture, database and deployment notes
- `uploads/` — local stand-in for object storage in development

## What it does

Members list skills they can teach and skills they want to learn. A deterministic
matching engine scores complementary members. Two members then agree an exchange,
schedule sessions, record milestones and notes, confirm completion, and review
each other. Exchanges follow a validated lifecycle:

```
PENDING → ACCEPTED → ACTIVE → COMPLETED
```

with `DECLINED`, `WITHDRAWN`, `CANCELLED`, `COUNTERED` and `PAUSED` where they
apply. Every transition is defined in
`server/src/services/exchange-state.service.ts` and enforced server side, so an
invalid state cannot be written by any endpoint.

## Requirements

- Node.js 20 or newer (developed on Node 24)
- PostgreSQL 14 or newer
- npm

## Install

From the repository root:

```bash
# 1. API dependencies
cd server
npm install

# 2. Front-end dependencies
cd ../web
npm install
```

## Configure

The API reads `server/.env`. The front end reads `web/.env`.

```bash
cp .env.example server/.env
cp web/.env.example web/.env
```

Then edit `server/.env`:

- `DATABASE_URL` — point at your PostgreSQL database.
- `ACCESS_TOKEN_SECRET` — generate a strong value:
  `openssl rand -hex 48`
- `PASSWORD_PEPPER` — any long random string.
- `CORS_ORIGINS` — the origin the front end is served from.

The server validates its configuration at startup and exits with a clear message
if something required is missing, rather than starting half configured.

Never commit real credentials. `.env` and `.env.test` are git ignored; only the
`.env.example` files are tracked.

## Database

```bash
cd server

# Apply migrations
npm run prisma:migrate      # development, creates a migration if needed
npm run prisma:deploy       # production, applies existing migrations only

# Generate the Prisma client
npm run prisma:generate

# Load demo data
npm run db:seed
```

`npm run db:reset` drops the database, reapplies all migrations and reseeds.

### Demo accounts

The seed prints these on completion. Every account uses the password
`SkillSpring#2026`.

| Account | Role | Purpose |
| --- | --- | --- |
| `admin@skillspring.local` | ADMIN | Admin panel, audit log |
| `moderator@skillspring.local` | MODERATOR | Report queue |
| `amara@example.com` | member | Pending request to Lucas |
| `lucas@example.com` | member | Design ↔ Python swap |
| `priya@example.com` | member | Active exchange |
| `tom@example.com` | member | Active exchange |
| `yuki@example.com` | member | Completed exchange with reviews |
| `sofia@example.com` | member | Completed exchange with reviews |

These are development credentials. Remove or rotate them before deploying.

## Run

Two terminals.

```bash
# Terminal 1 — API on http://localhost:4000
cd server
npm run dev

# Terminal 2 — front end on http://localhost:5173
cd web
npm run dev
```

The Vite dev server proxies `/api`, `/uploads` and `/socket.io` to the API, so the
browser talks to a single origin and there are no CORS surprises in development.

Open `http://localhost:5173`.

### Other commands

```bash
# API
cd server
npm run typecheck
npm test
npm run build && npm start

# Front end
cd web
npm run typecheck
npm test
npm run build && npm run preview
```

## Tests

```bash
cd server && npm test     # 68 tests
cd web && npm test        # 20 tests
```

The API suite is an integration suite: it runs against a real database and makes
real HTTP requests, so it needs PostgreSQL running. It derives a separate
`<database>_test` database from `DATABASE_URL` and refuses to run against the
development database. Set `DATABASE_URL_TEST` to override. The test run resets
that database, so never point it at anything you care about.

## API documentation

With the API running:

- Swagger UI — `http://localhost:4000/api/docs`
- OpenAPI document — `http://localhost:4000/api/openapi.json`

## Project layout

```
server/
  prisma/
    schema.prisma          data model
    migrations/            versioned SQL migrations
    seed.ts                demo data
  src/
    config/env.ts          validated environment
    middleware/            auth, authorization, error handling
    routes/                one router per resource
    services/              domain logic (matching, state machine, progress)
    tests/                 integration tests
    openapi.ts             OpenAPI document
web/
  src/
    components/            design system and shared UI
    hooks/                 TanStack Query hooks
    lib/                   API client, types, formatting helpers
    pages/                 one component per route
    tests/                 unit tests
```

## Features

Implemented and connected to the API:

- Email and password authentication with access and refresh tokens, email
  verification and password reset.
- Role-based access control for members, moderators and administrators, enforced
  in the API and not only by hiding interface elements.
- Member profiles, skills taxonomy, teachable skills and learning goals.
- Deterministic matching with a published scoring breakdown.
- Exchange requests, counter-proposals and the full exchange lifecycle.
- Exchange workspace with milestones, shared notes and progress tracking.
- Timezone-aware scheduling with conflict checks.
- Messaging with conversation membership enforced on every request.
- Notifications, reviews with one review per participant per exchange, and
  aggregate ratings computed from real reviews.
- Community discussions with votes and reporting.
- Admin panel with user management, category management, a moderation queue and
  an audit log.
- Light and dark themes, keyboard focus states and reduced-motion support.

## Optional integrations

These are deliberately inert until an operator configures them. Endpoints report
clearly that they are unavailable instead of pretending to work.

- **Email delivery** — `EMAIL_PROVIDER=console` logs messages in development.
  Set `smtp` with the `SMTP_*` values to send real mail. Password reset and email
  verification links are only delivered when a provider is configured.
- **Object storage** — `STORAGE_PROVIDER=local` writes to `UPLOAD_DIR`. Set `s3`
  with the `S3_*` values for S3-compatible storage.
- **AI assistance** — `AI_PROVIDER=none` by default. Matching is deterministic
  arithmetic, not AI. Setting a provider enables optional suggestions; the
  endpoint returns 501 when it is not configured.

## Known limitations

- No payments are processed anywhere in the flow. The optional credit-based model
  is not implemented; exchanges are tracked by time and sessions only.
- Email verification and password reset require a configured email provider. With
  the default `console` provider, links are logged rather than delivered.
- The optional AI assistance endpoints return 501 unless configured.
- Uploaded files are served from local disk in development. There is no virus
  scanning or image processing pipeline.
- The reminder scheduler runs inside the API process, so a multi-instance
  deployment would send duplicate reminders.
- Rate limiting uses in-memory storage and is therefore per instance.
- Socket.IO carries messages and notifications. It is authenticated with the
  same access token as the REST API and each socket joins only its own room.
  There is no presence indicator (no "online" status).

## More documentation

- [`docs/architecture.md`](docs/architecture.md) — components and request flow
- [`docs/database.md`](docs/database.md) — entity relationships
- [`docs/development-checklist.md`](docs/development-checklist.md) — page-by-page status
- [`docs/deployment.md`](docs/deployment.md) — deployment notes
