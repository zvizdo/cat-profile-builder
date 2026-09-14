import { AppError } from "@/core/errors";

// A safe projection of a caught error for a log field (F40 review, Important finding 1):
// this app's logger turns any `Error` value, at any field, into pino's own
// `{ type, message, stack, ...ownFields }` shape (`src/adapters/logger.ts`'s `censor`), and
// that walks `.cause` all the way down — so a raw `AppError` from this codebase's own
// pipelines, whose `cause` chain bottoms out in a `ToolExitError` and then Node's own
// `execFile` rejection, puts the *whole shell command* (an absolute temp-file path included)
// and ffmpeg's raw stderr into the log line, verbatim, in both `message` and `stack`. An
// `AppError`'s own `message` is the one thing already promised safe to show a person
// (`core/errors.ts`); nothing else about a caught error is. Log this instead of the error
// itself whenever an error might carry a filesystem path or a subprocess's own output.

/** What a log field says about a caught error, with every `cause` left out. */
export interface SafeError {
  name: string;
  message: string;
  code?: string;
}

/**
 * `error` as a log-safe field: `name` from the error's own class (never unsafe on its own),
 * `message` from `error.message` when it is an {@link AppError} — the one guarantee this
 * codebase makes about an error message — or the fixed string `"unknown"` otherwise, and
 * `code` when `error` is an `AppError`. Never reads `.cause`.
 */
export function safeError(error: unknown): SafeError {
  const name = error instanceof Error ? error.name : "Error";
  if (error instanceof AppError) return { name, message: error.message, code: error.code };
  return { name, message: "unknown" };
}
