# ADR-011: Authentication and session

**Status**: accepted · **Date**: 2026-09-10

## Context

One shelter, one shared username and password supplied as configuration, verified with HMAC
in constant time (FR-002), no hint about which half was wrong (FR-003), thirty-day session
renewed on use (spec Assumption), sign-out (FR-005). No rate limiting (Waiver 4).

## Decision

- **Password check**: env holds `SHELTER_USERNAME` and `SHELTER_PASSWORD_HMAC` — the
  hex HMAC-SHA256 of the password keyed by `SESSION_SECRET`. On sign-in the server computes
  the HMAC of the submitted password and compares with `crypto.timingSafeEqual`; the username
  is compared the same way. Both comparisons always run, and the single error string is
  "That username and password don't match." One script (`scripts/make-credentials.ts`,
  `pnpm make-credentials`) produces `SESSION_SECRET` and the HMAC together.
- **Session**: a `jose` HS256 JWT `{ sub: "shelter", iat, exp }` in an `httpOnly`, `Secure`,
  `SameSite=Lax` cookie, 30-day expiry. The request-level guard (`src/proxy.ts` — Next.js's
  request hook, the file formerly named middleware; it must sit beside `app/`, not inside
  it) verifies it on `/builder/**`, `/api/helper/**` and `/api/profiles/**`, and every
  Server Action re-checks it (a Server Action is a POST that the matcher could miss). It
  re-issues the cookie when more than a day old (renew on use) and redirects page requests to
  `/sign-in?next=…` when absent; API requests get `401`. `next` must be a same-origin path.
  Sign-out clears the cookie.
- Public routes (`/cats`, `/cats/…`, `/carousel`, `/kiosk`, `/api/carousel`) are outside the
  guard.

## Amendment 2026-09-12 (F17)

`scripts/hash-password.ts` — which took `SESSION_SECRET` from the environment and printed
the HMAC — is replaced by `scripts/make-credentials.ts`. The two values are a pair (the HMAC
is keyed by the secret), so the script generates the secret (`randomBytes(32)` as hex) and
the HMAC in one go and writes them to `infra/terraform/secrets.auto.tfvars` for the
deployment, or prints them as `.env.local` lines with `--env`. The pure part is
`makeCredentials` in `src/core/auth/credentials.ts`. Rotating either value means running the
script again (`--force`) and applying. How the values reach the service is ADR-014.

## Alternatives rejected

- **Auth.js / NextAuth** — a full framework for one credential pair; the dependency policy
  would reject it.
- **iron-session** — encrypted cookies with more ceremony; nothing here is secret inside the
  token, so signing is enough.
- **bcrypt / argon2** — the founding decision chose HMAC because the secret is configuration,
  not a user table.
