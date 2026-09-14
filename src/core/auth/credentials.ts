import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The one shared shelter credential (FR-002, ADR-011). The password is never stored: the
// environment holds its HMAC-SHA256 keyed by SESSION_SECRET, and a sign-in recomputes the
// HMAC of what was typed. `node:crypto` is the platform, not a framework, so this is core.

/** What a visitor typed into the sign-in form. */
export interface SubmittedCredentials {
  username: string;
  password: string;
}

/** What the environment holds: the username, the password's HMAC and the key it used. */
export interface ConfiguredCredentials {
  username: string;
  passwordHmac: string;
  secret: string;
}

/**
 * The hex HMAC-SHA256 of `password` keyed by `secret` — the value `SHELTER_PASSWORD_HMAC`
 * holds. `makeCredentials` computes it for a deployment; `checkCredentials` recomputes it
 * on every sign-in.
 */
export function hmacPassword(password: string, secret: string): string {
  return createHmac("sha256", secret).update(password).digest("hex");
}

/** The two configuration values a deployment holds, freshly generated for one password. */
export interface GeneratedCredentials {
  /** `SESSION_SECRET`: 32 random bytes as 64 hex characters. */
  sessionSecret: string;
  /** `SHELTER_PASSWORD_HMAC`: the password's HMAC keyed by that secret. */
  passwordHmac: string;
}

/**
 * A new `SESSION_SECRET` and the matching `SHELTER_PASSWORD_HMAC` for `password`
 * (ADR-011). The HMAC is keyed by the secret, so the two are only ever valid as a pair —
 * rotating one means regenerating both, which is why `pnpm make-credentials` produces them
 * together. Refuses an empty password: nobody means to deploy one.
 */
export function makeCredentials(password: string): GeneratedCredentials {
  if (password === "") throw new Error("The password must not be empty.");
  const sessionSecret = randomBytes(32).toString("hex");
  return { sessionSecret, passwordHmac: hmacPassword(password, sessionSecret) };
}

/**
 * Whether two strings are equal, in time that depends only on their lengths' hashes — both
 * sides are hashed to a fixed 32 bytes first so `timingSafeEqual` never sees a length
 * mismatch (which would throw and leak the length).
 */
function sameString(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Whether `submitted` is the configured pair. Both halves are always compared, each in
 * constant time, and the answer is combined without short-circuiting, so an unknown
 * username costs exactly what a wrong password costs (FR-002) and the caller has nothing to
 * tell the visitor but "don't match" (FR-003).
 */
export function checkCredentials(
  submitted: SubmittedCredentials,
  configured: ConfiguredCredentials,
): boolean {
  const usernameMatches = sameString(submitted.username, configured.username);
  const passwordMatches = sameString(
    hmacPassword(submitted.password, configured.secret),
    configured.passwordHmac,
  );
  return (Number(usernameMatches) & Number(passwordMatches)) === 1;
}
