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

## Seed credentials

Local development accounts use `@example.com` addresses. Example:
`priya@example.com` / `SkillSpring#2026`.
