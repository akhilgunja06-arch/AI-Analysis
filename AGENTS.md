# SkillSpring — repository notes

Peer-to-peer skill exchange platform. Monorepo: `server/` (Node + TypeScript +
Express + Prisma + Socket.IO), `web/` (React + TypeScript + Vite + Tailwind +
Framer Motion), `docs/`, `uploads/`.

## Running locally

- Backend: `cd server && npm run dev` (port 4000). Reads `server/.env`.
- Frontend: `cd web && npm run dev` (port 12000 in the hosted environment; Vite
  proxies `/api`, `/uploads` and `/socket.io` to port 4000).
- In hosted/remote environments, `web/src/lib/api.ts` (`API_URL`) and
  `web/src/providers/RealtimeProvider.tsx` (`SOCKET_URL`) default to the page
  origin so the Vite proxy carries REST and the websocket upgrade. Do not
  hardcode `http://localhost:4000` there — it is unreachable from a remote
  browser. Override with `VITE_API_URL` / `VITE_SOCKET_URL` when needed.
- `web/vite.config.ts` pins `server.allowedHosts` to explicit hostnames; add new
  runtime hostnames there rather than using `true`.

## Environment bootstrap (hosted sandbox)

There is no Docker daemon here, so PostgreSQL is installed from apt instead:

```bash
sudo apt-get install -y postgresql && sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE ROLE skillspring LOGIN PASSWORD 'skillspring_dev' CREATEDB"
sudo -u postgres createdb -O skillspring skillspring
sudo -u postgres createdb -O skillspring skillspring_test
cp .env.example server/.env   # then replace ACCESS_TOKEN_SECRET and PASSWORD_PEPPER
cd server && npx prisma migrate deploy && npm run db:seed
```

Run the servers detached, not with `npm run dev`: `tsx watch` dies with
`EBADF: bad file descriptor` when stdin is not a TTY. Use
`setsid nohup npx tsx src/index.ts > /tmp/api.log 2>&1 < /dev/null` and
`setsid nohup npx vite --port 12000 > /tmp/web.log 2>&1 < /dev/null`.

The media/video tests shell out to `ffmpeg`/`ffprobe`; install `ffmpeg` or those
three tests fail with `spawn ffmpeg ENOENT`.

`skillspring_test` must have the migrations applied once before `npm test` —
otherwise every suite fails with `relation "AuditLog" does not exist`:

```bash
DATABASE_URL="postgresql://skillspring:skillspring_dev@127.0.0.1:5432/skillspring_test?schema=public" \
  npx prisma migrate deploy
```

## Testing

- Backend: `cd server && npm test`. Integration tests need PostgreSQL. The
  setup file (`src/tests/setup.ts`) derives a `*_test` database from
  `DATABASE_URL` automatically — do not pass `DATABASE_URL_TEST` on the command
  line, it overrides that derivation.
- Frontend: `cd web && npx vitest run`. `npm run build` runs `tsc -b` with
  `noUnusedLocals`, so unused imports fail the build even when
  `tsc --noEmit -p tsconfig.json` passes. Run the real build before finishing.

## Conventions and gotchas

- API responses are `{ data: ... }` (paginated adds `meta`). Errors are
  `{ error: { code, message } }`.
- There is no email verification. `POST /api/auth/register` creates an account
  already `ACTIVE` and returns `{ user, accessToken }`; there is no OTP, no code
  screen and no `requireVerified` middleware. Do not reintroduce a
  `PENDING_VERIFICATION` status — the enum value is gone. Password reset uses a
  token link (`AuthToken` purpose `PASSWORD_RESET`), not a code.
- Chat has no topic rule. `server/src/services/moderation.service.ts` blocks
  threats, sexual solicitation, spam and self-harm, and warns on mild abuse;
  ordinary off-topic conversation is allowed. The old `STUDY_SIGNALS`/`OFF_TOPIC`
  heuristic was removed on purpose — do not bring back a "study only" check.
- Blocking lives at `POST|DELETE /api/messages/users/:username/block` (not
  `/api/blocks`); a block returns 403 for sends in both directions.
- Reporting has one endpoint: `POST /api/reports` (`server/src/routes/reports.routes.ts`).
  `targetType` is `USER`, `MESSAGE`, `REVIEW`, `COMMUNITY_POST` or
  `COMMUNITY_COMMENT`; each type has its own authorization rule inside
  `resolveTarget`, and a target the caller may not see returns the same `404` as
  one that does not exist. Do not add a per-feature report route — an earlier
  `/api/community/report` duplicated this and rejected the `OFF_TOPIC` reason the
  community UI offers. When a page needs to report something it calls
  `useReportContent()` and passes a real id; `ReportReason` lives in
  `prisma/schema.prisma`, so a new UI reason needs a migration.
- Support messages use one form: `web/src/components/ContactForm.tsx`. It is
  rendered on both `/help#contact` and `/contact` so validation, prefill and the
  submit path stay identical. Do not re-implement the form on a page.
- Deeper pages show a trail via `web/src/components/layout/Breadcrumbs.tsx`
  (`items` = ordered crumbs, last one is the current page). Admin pages get it
  once from `admin/AdminLayout.tsx`, so child admin pages must not add their own.
- Public copy and nav point "Contact us" at the `/contact` page, not
  `/help#contact`; the help-centre anchor still exists for in-page links.
- The assistant (`web/src/pages/AssistantPage.tsx`, `/assistant`) is honest
  about configuration: it reads `useIntegrationStatus()` and shows a
  `NotConfiguredState` when `aiAssistance.enabled` is false. Sending a message
  still stores it, and the `501 AI_NOT_CONFIGURED` from the API is surfaced, not
  swallowed. Keep the `AiConversationDetail` type in `web/src/lib/types.ts` in
  step with the route — the detail endpoint returns `id, userId, title, messages`
  only, no timestamps.
- `AI_PROVIDER` accepts only `none` or `groq`. `groq.service.ts` always calls
  the Groq host, so accepting `openai`/`anthropic` used to forward that
  provider's key to Groq. Unsupported values are reported, not silently
  downgraded. `GET /api/ai/connection` makes one real provider call and returns
  `ok`/`model`/`latencyMs`/`code` (never the key), which is what the assistant
  page uses to tell "no key set" apart from "key rejected". Assistant turns are
  throttled per member by `aiLimiter` (`AI_RATE_LIMIT_MAX`).
- Nested Prisma relations must be flattened before they reach the client. A
  relation like `author: { profile: { displayName } }` becomes
  `author: { username, displayName, avatarUrl }` in the response. Leaking the
  nested shape causes `undefined` names client-side, which crashes `initials()`
  in the avatar and white-screens the page. Check `exchanges.routes.ts` for the
  pattern used by sessions, milestones and notes.
- Session times are shown in the viewer's timezone via
  `formatSessionTime()` in `web/src/lib/utils.ts`, which appends the host
  timezone when it differs. The footer promises "your own timezone"; keep new
  time displays consistent with that.
- Exchange progress has one implementation:
  `server/src/services/progress.service.ts` (`computeExchangeProgress`). Never
  compute a percentage inline in a route. Before this existed, the list and
  workspace scored by sessions while the learning page preferred milestones,
  so the same exchange showed 33% and 50%. The agreed plan
  (`Exchange.totalSessions`) is the denominator, falling back to recorded
  sessions; the result is capped at 100%.
- Views that label a timezone must match what they render. The convention is
  the viewer's timezone, with the host timezone appended when it differs. A
  label like "times are shown in each session's own timezone" is wrong unless
  the render actually passes `session.timezone`.
- `web/src/components/ErrorBoundary.tsx` wraps every layout's `<Outlet />` so a
  render error shows a recoverable page instead of a blank screen. It logs only
  the message and component stack, never props.
- Matching weights and their per-component ceilings live in
  `server/src/services/matching.service.ts` (`WEIGHTS`) and are published to the
  client via the match `criteria.weights`. The UI derives its displayed ceilings
  from that response; do not hardcode them in the frontend.
- Media, favourites and the optional assistant are documented in
  `docs/media.md`. Three rules matter when touching them:
  - Only the `profile-images` bucket is public. Every other object is served
    through a short-lived signed URL (`mediaUrlFor` / `signMediaUrl`); the static
    `/uploads` mount refuses anything outside `profile-images`. Never store a
    `/uploads/...` URL for private media.
  - Videos are stored byte-for-byte and never re-encoded. `GET
    /api/media/:id/integrity` re-hashes the stored object to prove it.
  - When no AI provider is configured, the assistant returns `501
    AI_NOT_CONFIGURED`. It never fabricates a reply. The image pipeline is
    adaptive compression with `sharp`, not AI — do not describe it as AI.
- The test helper `uploadFile` (in `src/tests/helpers.ts`) sends real multipart
  requests; pass `method: 'PUT'` for the resumable-upload chunk route.

## Seed credentials

Local development accounts use `@example.com` addresses. Example:
`priya@example.com` / `SkillSpring#2026`.
