import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  cookieSecure,
  createSessionToken,
  sessionCookieOptions,
  shouldRenew,
  verifySessionToken,
} from "@/adapters/auth/session";
import { InternalError } from "@/core/errors";

// The request-level guard (ADR-011): Next's request hook, formerly `middleware.ts`, which
// must sit beside `app/`. It runs before every builder page and every helper or profile
// API request, verifies the session cookie, and re-issues it once it is more than a day
// old. Server Actions re-check the session themselves (`withSession`), because an action
// is a POST this matcher can miss. Public routes are simply not listed here.
//
// The dev upload route (`/api/dev-upload`, `STORE=fs` only) is deliberately not listed:
// Next buffers the body of every request the proxy covers, in memory and cut off at 10 MB
// (`proxyClientMaxBodySize`), so a phone video streamed through here arrived truncated.
// That route checks the session itself (`requireSession`) and answers the same 401.
//
// This file never imports the container: the proxy is bundled separately from the app and
// must stay small and free of Node-only modules. It is therefore the one place outside
// `loadConfig` that reads `process.env` — the two values it needs, checked for presence.

/** The paths the guard covers, in Next's matcher syntax. */
export const config = {
  matcher: ["/builder/:path*", "/api/helper/:path*", "/api/profiles/:path*"],
};

/** The same sentence `withSession` answers with; the proxy cannot import that module's Next deps. */
const SIGN_IN_MESSAGE = "Sign in to continue.";

/** What the guard needs beyond the request; `proxy` fills it from the environment. */
export interface GuardDeps {
  secret: string;
  /** Whether the renewed cookie carries `Secure` (see `cookieSecure`). */
  secure: boolean;
  now: () => Date;
}

/** `path` plus its query, encoded for a `next=` value but with its slashes left readable. */
function nextParam(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return encodeURIComponent(pathname + search).replace(/%2F/gi, "/");
}

function denied(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: SIGN_IN_MESSAGE } },
      { status: 401 },
    );
  }
  return NextResponse.redirect(new URL(`/sign-in?next=${nextParam(request)}`, request.url));
}

/**
 * Lets `request` through when its `cpb_session` cookie verifies, renewing the cookie on the
 * way out when it is more than a day old. Otherwise a page request is redirected to
 * `/sign-in?next=<path>` and an API request gets `401` with the one error shape.
 */
export async function guard(request: NextRequest, deps: GuardDeps): Promise<NextResponse> {
  const cookie = request.cookies.get(SESSION_COOKIE);
  const now = deps.now();
  const session =
    cookie === undefined ? null : await verifySessionToken(cookie.value, deps.secret, now);
  if (session === null) return denied(request);

  const response = NextResponse.next();
  if (shouldRenew(session, now)) {
    const token = await createSessionToken(deps.secret, now);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(now, deps.secure));
  }
  return response;
}

/** The environment value `name`, refusing to guard with a missing or empty one. */
function required(name: "SESSION_SECRET" | "PUBLIC_BASE_URL"): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new InternalError(`${name} is not set; the request guard cannot run without it.`);
  }
  return value;
}

/** The request hook Next calls for every path in `config.matcher`. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return guard(request, {
    secret: required("SESSION_SECRET"),
    secure: cookieSecure(required("PUBLIC_BASE_URL")),
    now: () => new Date(),
  });
}
