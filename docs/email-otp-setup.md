# Email OTP setup

SkillSpring activates an account only after the member proves they can read the
address they registered with. This page covers what the flow does, how to point
it at a real mail provider, and what to do when mail is not configured.

## What happens on registration

1. `POST /api/auth/register` validates the username, email and password. The
   email must be a real domain: disposable providers (mailinator, yopmail,
   guerrillamail and similar) are rejected.
2. A six-digit code is generated with `crypto.randomInt`, so it is not
   predictable from the clock or a previous code.
3. Only a hash of the code is stored, in `OtpCode.codeHash`. The plaintext code
   exists in memory for the length of the request and in the outgoing email.
4. The account is created with status `PENDING_VERIFICATION`.
5. The email is sent through the configured provider.

Until verification succeeds, `requireVerified` refuses every member route with
`403 EMAIL_NOT_VERIFIED`. Signing in still works, so the member can reach the
verification screen.

## Verifying

`POST /api/auth/verify-otp` with `{ email, code }`.

- A correct, unexpired, unused code sets the account to `ACTIVE`.
- The code is marked used, so a replay does not verify a second time. A replay
  of an already-used code for an already-active account returns `200` with
  `alreadyVerified: true` rather than an error, so a member who double-submits
  the form is not shown a failure.
- A wrong code increments `OtpCode.attempts`. After `OTP_MAX_ATTEMPTS` the code
  is burned and the member must request a new one.
- The response never echoes the code.

`POST /api/auth/resend-otp` issues a fresh code. It always returns the same
message whether or not the address exists, so it cannot be used to enumerate
accounts. A resend inside `OTP_RESEND_COOLDOWN_SECONDS` is refused with a
retry-after value.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `REQUIRE_EMAIL_OTP` | `true` | Set `false` only on a throwaway local database. Production must keep `true`. |
| `OTP_TTL_SECONDS` | `300` | How long a code stays valid. |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong guesses before the code is burned. |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Minimum gap between sends. |
| `EMAIL_PROVIDER` | `console` | `console`, `smtp` or `disabled`. |
| `EMAIL_FROM` | `SkillSpring <no-reply@skillspring.local>` | Sender address. Must be a domain your provider authorises. |

### Console provider (development)

With `EMAIL_PROVIDER=console` the message is written to the API log and the
registration response includes `devOtpCode`. This is deliberate: there is no way
to test the flow otherwise. The field is only present outside production —
check `NODE_ENV` before relying on it.

### SMTP provider (real delivery)

```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false      # true for implicit TLS on port 465
SMTP_USER=apikey
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM="SkillSpring <no-reply@yourdomain.com>"
```

Restart the API. `GET /api/support/status` reports
`emailDelivery.provider: "smtp"` and `emailOtp.deliveryProvider: "smtp"` when the
provider loaded.

Any SMTP-speaking transactional provider works: Postmark, SendGrid, Mailgun,
Amazon SES, Brevo, Resend (SMTP mode). Use the credentials and port that provider
documents. If your provider requires the From domain to be verified, verify it
first — otherwise mail is accepted by the provider and then silently dropped.

### Disabled provider

`EMAIL_PROVIDER=disabled` accepts the request and sends nothing. Accounts created
this way cannot be verified, so it is only useful when `REQUIRE_EMAIL_OTP=false`.

## Failure behaviour

- If delivery fails, registration still creates the account but the response
  reports `verification.emailSent: false`. The account is **not** auto-verified:
  a mail outage must never hand out an active account.
- If no provider is configured at all, the same applies. The member can request
  a resend once mail is working.
- The code is never written to logs in production and never returned to the
  browser except through the development-only `devOtpCode` field.

## What to do when mail does not arrive

1. `GET /api/support/status` — confirm `emailOtp.deliveryProvider` is `smtp`.
2. Check the API log for `email.delivery_failed`. The provider response is
   logged; the credentials are not.
3. Confirm the From domain is verified with the provider.
4. Check the spam folder: a first message from a new domain often lands there.
5. If the account is stuck, request a resend from `/verify-email`. The cooldown
   is 60 seconds by default.

## Password reset

Password reset reuses the same `AuthToken` mechanism as before and only works
when mail is configured. The reset link is single-use and expires; see
`server/src/routes/auth.routes.ts`.
