import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SESSION_COOKIE,
  cookieSecure,
  createSessionToken,
  sessionCookieOptions,
  type CookieWriter,
} from "@/adapters/auth/session";
import type { Container } from "@/adapters/container";
import { errorBody, type ErrorBody } from "@/app/api/_lib/respond";
import { checkCredentials } from "@/core/auth/credentials";
import { parseOrThrow } from "@/core/errors";

// The sign-in and sign-out logic behind the two Server Actions in `src/app/actions/auth.ts`
// (contracts/server-boundary.md, ADR-011). It lives here, outside the `"use server"` file,
// so the container and the cookie jar can be injected by a test — every export of a
// `"use server"` module is a callable endpoint, and these take collaborators, not form data.

/** The one sentence a failed sign-in shows, for either half being wrong (FR-003, CONTENT.md). */
export const MISMATCH_MESSAGE = "That username and password don't match.";

/** Where a sign-in lands when it was not sent from a guarded page. */
export const DEFAULT_NEXT = "/builder";

/** What the sign-in form posts; `next` is the page the guard turned away from. */
export const SignInInputSchema = z.object({
  username: z.string(),
  password: z.string(),
  next: z.string().optional(),
});

/**
 * What `useActionState` holds: nothing before the first submit, else the error to show plus
 * the username as typed. React resets a form's fields once its action returns, so the
 * form re-seeds the username from here and a mistyped password costs one field, not two.
 */
export type SignInResult = ({ ok: false; username: string } & ErrorBody) | null;

/** What signing in needs from the container. */
export type AuthDeps = Pick<Container, "config" | "clock" | "logger">;

/** How an action reaches the response cookies; `cookies()` from `next/headers` in the app. */
export type GetCookieJar = () => Promise<CookieWriter>;

/**
 * The path a sign-in may return to: `next` when it is a same-origin path — one leading
 * slash, no backslash — and {@link DEFAULT_NEXT} otherwise. `//host`, `https://host` and
 * anything a browser could read as another origin are refused (ADR-011).
 */
export function safeNext(next: string | undefined): string {
  if (next === undefined || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_NEXT;
  }
  return next;
}

/** The form's fields as an object for the schema; a missing field stays `undefined`. */
function fieldsOf(formData: FormData): Record<string, unknown> {
  const value = (name: string) => formData.get(name) ?? undefined;
  return { username: value("username"), password: value("password"), next: value("next") };
}

/**
 * Checks the submitted pair against the configured one and, when it matches, sets the
 * session cookie and redirects to {@link safeNext}. A mismatch answers `unauthorized` with
 * {@link MISMATCH_MESSAGE}; a malformed form answers `invalid`; anything else answers the
 * generic error with the detail logged. The redirect is thrown, as Next requires.
 */
export async function signInWith(
  deps: AuthDeps,
  formData: FormData,
  getCookies: GetCookieJar = cookies,
): Promise<SignInResult> {
  const { config } = deps;
  const fields = fieldsOf(formData);
  const username = typeof fields.username === "string" ? fields.username : "";
  let target: string;
  try {
    const input = parseOrThrow(SignInInputSchema, fields);
    const matches = checkCredentials(input, {
      username: config.SHELTER_USERNAME,
      passwordHmac: config.SHELTER_PASSWORD_HMAC,
      secret: config.SESSION_SECRET,
    });
    if (!matches) {
      return { ok: false, username, error: { code: "unauthorized", message: MISMATCH_MESSAGE } };
    }

    const now = deps.clock.now();
    const token = await createSessionToken(config.SESSION_SECRET, now);
    const jar = await getCookies();
    jar.set(SESSION_COOKIE, token, sessionCookieOptions(now, cookieSecure(config.PUBLIC_BASE_URL)));
    target = safeNext(input.next);
  } catch (error) {
    return { ok: false, username, ...errorBody(error, deps.logger) };
  }
  redirect(target);
}

/** Clears the session cookie and sends the visitor to `/sign-in` (FR-005). */
export async function signOutWith(getCookies: GetCookieJar = cookies): Promise<never> {
  (await getCookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
