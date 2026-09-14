import "server-only";
import { SignJWT, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import type { Clock } from "@/core/ports";

// The signed-in state (ADR-011, data-model.md → Session token): an HS256 JWT in an httpOnly
// cookie, thirty days long, re-issued once it is more than a day old. Nothing user-specific
// exists — one account — so the payload is `{ sub: "shelter", iat, exp }` and nothing else.
// The request guard (`src/proxy.ts`) and every Server Action verify through this module.

/** The name of the session cookie. */
export const SESSION_COOKIE = "cpb_session";

/** How long a session lasts from the moment it is issued or renewed. */
export const SESSION_DAYS = 30;

const DAY_MS = 86_400_000;
const SUBJECT = "shelter";

const SessionSchema = z.object({
  sub: z.literal(SUBJECT),
  iat: z.number().int(),
  exp: z.number().int(),
});

/** The signed-in shelter session: the JWT claims, seconds since the epoch. */
export type Session = z.infer<typeof SessionSchema>;

/** The request's cookies as `cookies()` from `next/headers` gives them: by name, value only. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** The attributes every session cookie carries (ADR-011). */
export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
}

/** The response's cookies as `cookies()` lets a Server Action write them. */
export interface CookieWriter {
  set(name: string, value: string, options: SessionCookieOptions): unknown;
  delete(name: string): unknown;
}

/** Reads the session out of the request cookies; `null` when there is none worth trusting. */
export type SessionReader = (cookies: CookieReader) => Promise<Session | null>;

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** A fresh session token issued at `now` and good for {@link SESSION_DAYS}. */
export async function createSessionToken(secret: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SUBJECT)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_DAYS * 86_400)
    .sign(key(secret));
}

/**
 * The session a token proves, or `null`. Never throws for a bad token: a wrong signature,
 * an expired or malformed token and a foreign subject all mean the same thing to a caller —
 * nobody is signed in — so they all answer `null`. Anything that is not a jose failure
 * (a bug, not a bad token) still propagates.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
  now: Date,
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: SUBJECT,
      currentDate: now,
    });
    const parsed = SessionSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

/** Whether a session is old enough to re-issue on this request: more than a day (ADR-011). */
export function shouldRenew(session: Session, now: Date): boolean {
  return now.getTime() - session.iat * 1000 > DAY_MS;
}

/**
 * The cookie attributes for a session issued at `now`. `secure` is a parameter because a
 * `Secure` cookie is dropped by browsers on plain `http://localhost` (see
 * {@link cookieSecure}); everything else is fixed by ADR-011.
 */
export function sessionCookieOptions(now: Date, secure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
  };
}

/**
 * Whether the session cookie carries `Secure` for the deployment at `publicBaseUrl`: always,
 * except for a plain-http `localhost` base, where the browser would otherwise refuse to
 * store the cookie at all. Only the hostname `localhost` qualifies — not a look-alike.
 */
export function cookieSecure(publicBaseUrl: string): boolean {
  const url = new URL(publicBaseUrl);
  return !(url.protocol === "http:" && url.hostname === "localhost");
}

/** A {@link SessionReader} that verifies the `cpb_session` cookie with `secret` at `clock`'s time. */
export function sessionReader(secret: string, clock: Clock): SessionReader {
  return async (cookies) => {
    const cookie = cookies.get(SESSION_COOKIE);
    return cookie === undefined ? null : verifySessionToken(cookie.value, secret, clock.now());
  };
}
