# Development checklist

Status of each page and feature. "Verified" means the page was exercised in a
browser against the running API, not merely that the code exists.

Legend: **Done** — implemented and verified · **Optional** — implemented but inert
until configured · **Not built** — deliberately out of scope.

## Public pages

| # | Page | Route | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Landing | `/` | Done | Animated hero, three-step process, featured skills, community statistics from real data, FAQ, footer |
| 2 | Login | `/login` | Done | Password visibility toggle, validation and error states |
| 2 | Register | `/register` | Done | Strong password rules, terms and privacy links |
| 2 | Forgot password | `/forgot-password` | Done | Delivery needs an email provider; see Optional |
| 2 | Reset password | `/reset-password` | Done | Single-use expiring token |
| 2 | Verify email | `/verify-email` | Done | Delivery needs an email provider |
| 3 | Onboarding | `/onboarding` | Done | Photo, bio, languages, teach and learn skills, availability, completion ring, resumable |
| 5 | Explore skills | `/explore` | Done | Search, filters, sorting, trending skills, skeletons, no-results state |
| 6 | Members | `/members` | Done | Directory with filters and match-score explanation |
| 7 | Member profile | `/members/:username` | Done | Skills, reviews, portfolio, privacy-aware; email never exposed |
| 17 | Community | `/community` | Done | Topics, filters, votes, reporting, pagination |
| 17 | Community post | `/community/posts/:id` | Done | Threaded comments and votes |
| 20 | Help | `/help` | Done | Searchable FAQ, contact form with server validation |
| 20 | Privacy | `/privacy` | Done | States limitations honestly; no invented certifications |
| 20 | Terms | `/terms` | Done | |
| — | Not found | `*` | Done | |

## Member pages

All require authentication and redirect to `/login` when signed out.

| # | Page | Route | Status | Notes |
| --- | --- | --- | --- | --- |
| 4 | Dashboard | `/dashboard` | Done | Greeting, completion ring, requests, sessions with timezone labels, activity chart, recommendations |
| 8 | My skills | `/my-skills` | Done | Add, edit and remove teach and learn skills; duplicate detection; evidence required for expert level |
| 9 | Matches | `/matches` | Done | Backend scoring with a visible breakdown; dismissals persist |
| 10 | Exchange requests | `/exchanges/requests` | Done | Incoming and outgoing, accept, decline, withdraw, counter |
| 10 | Exchanges list | `/exchanges` | Done | Active, completed and closed exchanges |
| 11 | Exchange workspace | `/exchanges/:id` | Done | Terms, progress, sessions, milestones, shared notes, completion, history |
| 12 | Calendar | `/calendar` | Done | Month and agenda views, conflict checks, timezone-aware |
| 13 | Messages | `/messages` | Done | Conversation list, unread counts, realtime when connected |
| 13 | Conversation | `/messages/:conversationId` | Done | Membership enforced on every request |
| 14 | Learning | `/learning` | Done | Active and completed exchanges, milestones, notes, weekly chart |
| 15 | Notifications | `/notifications` | Done | Read state, mark all read, preferences |
| 16 | Reviews | `/reviews` | Done | One review per participant per exchange; aggregates from real reviews |
| 18 | Settings | `/settings` | Done | Profile, privacy, notifications, password, data export, deactivation, deletion |

## Admin pages

Require the `ADMIN` role. Members are redirected to `/dashboard`, and the API
returns 403 independently of the interface.

| # | Page | Route | Status | Notes |
| --- | --- | --- | --- | --- |
| 19 | Overview | `/admin` | Done | Platform statistics from `/api/admin/overview` |
| 19 | Users | `/admin/users` | Done | Search, filters, role changes |
| 19 | Reports | `/admin/reports` | Done | Moderation queue |
| 19 | Categories | `/admin/categories` | Done | Skill taxonomy management |
| 19 | Audit log | `/admin/audit` | Done | Sensitive administrative actions |

## Cross-cutting

| Area | Status | Notes |
| --- | --- | --- |
| Design system | Done | Tokens, light and dark themes, focus states, reduced motion |
| Responsive layout | Done | Desktop, tablet and mobile navigation |
| Protected routes | Done | Client-side guards plus server-side enforcement |
| API client | Done | Centralised errors, single refresh retry on 401 |
| Loading, error and empty states | Done | Every data view |
| Widgets | Done | Activity line chart, status donut, weekly bar chart, completion ring, agenda, timeline, tracker |
| Seed data | Done | Every widget has real data on a fresh install |
| API documentation | Done | Swagger UI at `/api/docs` |
| Automated tests | Done | 68 API tests, 20 front-end tests |

## Optional integrations

Implemented, but inactive until an operator configures them. Each reports clearly
that it is unavailable rather than pretending to work.

| Feature | Status | Behaviour when unconfigured |
| --- | --- | --- |
| Email delivery | Optional | `console` provider logs links instead of sending |
| S3-compatible storage | Optional | Falls back to local disk |
| AI suggestions | Optional | Endpoint returns 501 with an explicit message |
| OAuth sign-in | Optional | Endpoint explains that it is not configured |

## Not built

- **Credit-based exchange model.** The brief allows this as an alternative to
  direct exchange. It is not implemented, and no interface claims otherwise.
- **Payments.** No payment flow exists anywhere in the product.
- **Presence indicators.** Socket.IO carries messages and notifications, but
  there is no online status.

## Verification notes

Fixes made during front-end verification:

- **Progress disagreed between views.** The exchange list and workspace reported
  33% while the learning page reported 50% for the same exchange, because two
  different formulas were in use. Extracted `progress.service.ts` as the single
  implementation and wired all three views to it. A regression test asserts they
  agree.
- **Dashboard mislabelled its timezone.** The panel claimed each session showed
  its own timezone but rendered viewer-local time. Added the `timezone` field to
  the payload and switched the render to the shared helper.
- **Seed reminder wording.** A seeded notification said a session started "in
  about an hour" when it was days away. The seed now mirrors the wording the real
  reminder service produces.
- **Missing `server/.env.example`.** Added, scoped to server-only variables.

Two false alarms were investigated and dismissed: an apparent duplicate option in
a skill-level dropdown was a text-extraction artifact (the DOM holds four unique
options), and a 404 on `/api/admin/stats` was a guessed path — the interface uses
`/api/admin/overview`, which works.
