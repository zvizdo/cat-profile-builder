import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import type { CookieReader } from "@/adapters/auth/session";
import type { Container } from "@/adapters/container";
import { errorBody, type ErrorBody } from "@/app/api/_lib/respond";

// Every signed-in Server Action goes through `withSession` (ADR-011: an action is a POST the
// request guard can miss, so it re-checks the session itself). The wrapper is also where an
// action's thrown `AppError` becomes the `{ ok: false, error }` half of its result.

/** What a person sees when an action needs a session and there is none (CONTENT.md voice). */
export const SIGN_IN_MESSAGE = "Sign in to continue.";

/**
 * What every Server Action answers: its own fields under `ok: true`, or the shared error
 * shape under `ok: false` (contracts/server-boundary.md).
 */
export type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ErrorBody);

/** The two things the wrapper needs from the container. */
export type GuardDeps = Pick<Container, "readSession" | "logger">;

/** How the wrapper reaches the request's cookies; `cookies()` from `next/headers` in the app. */
export type GetCookies = () => Promise<CookieReader>;

/** Shared by every signed-out answer, so frozen: a caller must not be able to reword it. */
const UNAUTHORIZED: ActionResult<never> = Object.freeze({
  ok: false,
  error: Object.freeze({ code: "unauthorized", message: SIGN_IN_MESSAGE }),
});

/**
 * Wraps `action` so it runs only with a session, and so what it throws becomes a result: no
 * session answers `unauthorized` without calling it; an `AppError` becomes its code and
 * message; anything else — a session reader that throws included — becomes the generic
 * internal error with the detail logged. A Next redirect thrown inside the action passes
 * through untouched, as it must to take effect.
 */
export function withSession<A extends unknown[], T extends object>(
  deps: GuardDeps,
  action: (...args: A) => Promise<T>,
  getCookies: GetCookies = cookies,
): (...args: A) => Promise<ActionResult<T>> {
  return async (...args) => {
    try {
      const session = await deps.readSession(await getCookies());
      if (session === null) return UNAUTHORIZED;
      return { ok: true, ...(await action(...args)) };
    } catch (error) {
      unstable_rethrow(error);
      return { ok: false, ...errorBody(error, deps.logger) };
    }
  };
}
