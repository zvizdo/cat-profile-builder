import type { NextRequest } from "next/server";
import type { Session, SessionReader } from "@/adapters/auth/session";
import { SIGN_IN_MESSAGE } from "@/app/actions/_lib/guard";
import { UnauthorizedError } from "@/core/errors";

// Route Handlers re-check the session themselves, like Server Actions do (ADR-011): the
// request guard in `src/proxy.ts` runs first, but a handler must not depend on it.

/** The request's session, or an `UnauthorizedError` — the 401 half of the one error shape. */
export async function requireSession(
  request: NextRequest,
  readSession: SessionReader,
): Promise<Session> {
  const session = await readSession(request.cookies);
  if (session === null) throw new UnauthorizedError(SIGN_IN_MESSAGE);
  return session;
}
