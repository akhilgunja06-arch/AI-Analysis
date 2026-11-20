# Study-only moderation policy

SkillSpring chat exists for study. Messages are checked on the server before they
are stored or delivered, so a prohibited message never reaches the recipient.

The implementation lives in:

- `server/src/services/moderation.service.ts` — classification and the audit trail
- `server/src/services/enforcement.service.ts` — escalation and restrictions
- `server/src/routes/messaging.routes.ts` — enforcement on the send path
- `server/src/routes/ai.routes.ts` — the same check on assistant prompts

## Decision types

Every message gets one verdict:

| Verdict | Meaning | What the sender sees |
| --- | --- | --- |
| `ALLOW` | Ordinary study content | Message delivered normally |
| `WARN` | Off-topic or mildly inappropriate | Message delivered, with a `moderationNotice` |
| `BLOCK` | Clearly prohibited | `422 MESSAGE_BLOCKED` with a reason; nothing stored |

`BLOCK` messages are rejected before `prisma.message.create`, so the other member
never receives them.

## Categories and severity

Severity runs 0 to 3. It drives escalation, not the verdict alone.

| Category | Typical severity | Notes |
| --- | --- | --- |
| `EDUCATIONAL` | 0 | Always allowed. Biology, anatomy, medicine and reproduction vocabulary is academic here. |
| `OFF_TOPIC` | 1 | Not study related. Warns first. |
| `SPAM` | 1 | Advertising, repeated links, recruitment. |
| `HARASSMENT` | 2 | Insults, targeted abuse. |
| `THREAT` | 3 | Credible threats of harm. |
| `SEXUAL` | 3 | Explicit sexual content. |
| `ILLEGAL` | 3 | Requests for illegal material or activity. |

### Avoiding false positives

The classifier is deliberately conservative about academic vocabulary. A message
containing "reproductive system", "ovaries", "anatomy", "mating behaviour" or
similar terms in a biology question is classified `EDUCATIONAL`, not `SEXUAL`.
The regression tests in `server/src/tests/integrations.test.ts` assert this
explicitly, because a policy that blocks legitimate coursework is worse than no
policy at all.

## Escalation

Enforcement is evaluated over rolling windows in `enforcement.service.ts`:

1. **First minor violation** — warning only. The message is delivered with a
   notice explaining what was wrong.
2. **Three warnings in a day** — three `WARN` verdicts within 24 hours create a
   24-hour `MessagingRestriction` at severity 1. The sender's next message is
   refused with `403 MESSAGING_RESTRICTED`, including the reason and expiry time.
3. **Five warnings in a week** — five `WARN` verdicts within 7 days create a
   7-day restriction at severity 2. The weekly rule is checked first, so a member
   who keeps drifting off topic after a 24-hour pause escalates rather than
   repeating the same 24-hour penalty.
4. **A blocked message** — the first `BLOCK` verdict without escalation pauses
   messaging for 24 hours.
5. **Repeated serious violations** — two `BLOCK` verdicts within 7 days suspend
   the account (`AccountStatus.SUSPENDED`). Sign-in still works so the member can
   read why and appeal, but every member route refuses them.
6. **Severe single incidents** — any `BLOCK` at severity 3 (credible threats,
   explicit sexual content, illegal requests) suspends the account immediately
   pending review. The system never permanently bans automatically: a human
   decides.
7. **Repeated severe violations after review** — an administrator can ban from
   the admin panel.

Nothing is permanently blocked on the strength of one ambiguous message.

## What the member can see

`GET /api/messages/moderation` returns the caller's own standing: active
restriction, its reason and expiry, and recent decisions with category, severity,
reason and date. It never returns the offending text and never exposes another
member's history.

This route stays reachable while an account is suspended — a member cannot appeal
something they cannot read. Every other member route still returns `403` for a
suspended session.

## What is stored

`ModerationEvent` records the decision, not the content:

- `verdict`, `category`, `severity`, `reason` — a short, non-content explanation
- `contentHash` — SHA-256 of the normalised text, so identical repeat abuse can be
  correlated without storing the message
- `surface` — `MESSAGE`, `AI_PROMPT` or `COMMUNITY`
- `userId`, `messageId` (when applicable), `createdAt`

The message body is never copied into the audit trail. Chat contents are not
readable by administrators through this table.

## Appeals

`POST /api/support` creates a support ticket. The member describes the situation
and an administrator reviews the `ModerationEvent` history and the restriction.
Admins can lift a restriction or reinstate an account from the admin panel; the
action is written to `AuditLog`.

## Reporting and blocking

- `POST /api/reports` files a `Report` for staff review. One endpoint covers every
  reportable target, so the reason vocabulary stays consistent:

  | `targetType` | Who may report it |
  |---|---|
  | `USER` | Any verified member |
  | `MESSAGE` | A participant of the conversation the message belongs to |
  | `REVIEW` | The member the review is about |
  | `COMMUNITY_POST` / `COMMUNITY_COMMENT` | Any verified member |

  A message the caller cannot see returns the same `404` as a message that does
  not exist, so the endpoint cannot be used to probe ids. Reporting your own
  content is a `400`; an open duplicate for the same target is a `409`.
- `GET /api/reports/mine` returns the caller's own reports and their status.
- Blocking is per conversation: a blocked conversation refuses new messages from
  either side, and neither party can reopen it by guessing an id.

## Tuning

Thresholds are constants at the top of `enforcement.service.ts`, not environment
variables, so a deployment cannot silently weaken the policy. Change them in code,
with a test, if your community needs different limits.

## Known limits

- Classification is pattern and heuristic based, not a hosted moderation model.
  It catches clear cases and lets ambiguous ones through with a warning rather
  than blocking a student mid-sentence.
- Attachments are checked by type and size, not by content analysis.
- There is no automated review of message history; a report is required to bring
  a conversation to staff attention.
