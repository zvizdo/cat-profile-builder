import { AppError, httpStatusFor, ProfileInvalidError, type ErrorCode } from "@/core/errors";
import type { Logger } from "@/core/ports";

// The one error shape every Route Handler and Server Action answers with
// (contracts/server-boundary.md). An `AppError` carries a message written for a person; any
// other failure — and an `InternalError`, whose message is for the log — becomes the generic
// 500 below, and the real detail goes to the logger, never to a browser.

/** The body a person sees when nothing more specific can be said (CONTENT.md voice). */
export const INTERNAL_MESSAGE = "Something went wrong on our side. Try again in a moment.";

/** How many failing paths one `invalid` log line names at most. */
const LOGGED_PATHS = 40;

/** `{ error: { code, message } }`, the only error body this app sends. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/**
 * The distinct paths a validation failure names, for the log — never a value, never
 * Zod's own message (which quotes the input) — capped so a 200-message history that fails
 * every message is one line, not a listing. Empty for an `invalid` raised without issues.
 */
function invalidPaths(error: ProfileInvalidError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path))].slice(0, LOGGED_PATHS);
}

/**
 * The error body for `error`, logged where the detail would otherwise be lost: an upstream
 * failure at `warn` (its provider text is in `cause`), an `invalid` at `warn` with the
 * failing paths only (F35: a 400 the app never logged was a 400 nobody could diagnose),
 * anything unexpected at `error`.
 */
export function errorBody(error: unknown, logger: Logger): ErrorBody {
  if (error instanceof AppError && error.code !== "internal") {
    if (error.code === "upstream") logger.warn({ err: error }, "upstream");
    if (error instanceof ProfileInvalidError) {
      logger.warn({ paths: invalidPaths(error) }, "invalid request");
    }
    return { error: { code: error.code, message: error.message } };
  }
  logger.error({ err: error }, "unhandled");
  return { error: { code: "internal", message: INTERNAL_MESSAGE } };
}

/** The JSON `Response` for `error`, with the HTTP status its code maps to. */
export function respond(error: unknown, logger: Logger): Response {
  const body = errorBody(error, logger);
  return Response.json(body, { status: httpStatusFor(body.error.code) });
}
