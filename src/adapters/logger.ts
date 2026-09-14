import "server-only";
import pino from "pino";
import type { LogLevelSchema } from "@/adapters/config";
import type { z } from "zod";
import type { LogFields, Logger } from "@/core/ports";

// The real Logger port: pino writing one JSON line per call to stdout, which is what Cloud
// Run collects (ADR-014). Secrets are redacted here, at the logging boundary, so no call
// site has to remember to (constitution, Engineering Standards → logging and secrets).

/** Where the lines go; pino's own stdout stream unless a test gives it a sink. */
export interface LogSink {
  write(line: string): void;
}

export interface LoggerOptions {
  /** pino's level name; `info` unless the environment says otherwise. */
  level?: z.infer<typeof LogLevelSchema>;
  destination?: LogSink;
}

/**
 * Keys whose value is never written, compared lower-case at any depth: a sign-in form's
 * password, the session secret, and the two headers that carry credentials — which is what
 * the AI SDK's `APICallError` carries under `response.headers`, three levels down.
 */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  "password",
  "session_secret",
  "authorization",
  "cookie",
]);

const CENSOR = "[redacted]";

/** Only these recurse: what JSON would walk into. Anything else (a Date, a Buffer) is kept. */
function walkable(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}

/** `fields` with every secret-keyed value replaced and every other value censored below. */
function censorFields(fields: object, path: Set<object>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, item]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase()) ? CENSOR : censor(item, path),
    ]),
  );
}

/**
 * A copy of `value` with every secret-keyed field replaced, however deep. An `Error` is
 * turned into pino's own `{ type, message, stack, ...ownFields }` first, because pino runs
 * this formatter before its serialisers and the own fields are where a provider's response
 * headers sit. `path` holds the objects above this one, so a cycle stops instead of looping.
 */
function censor(value: unknown, path: Set<object>): unknown {
  if (value instanceof Error) return censorFields(pino.stdSerializers.err(value), path);
  if (typeof value !== "object" || value === null || !walkable(value)) return value;
  if (path.has(value)) return "[circular]";
  path.add(value);
  const copy = Array.isArray(value)
    ? value.map((item) => censor(item, path))
    : censorFields(value, path);
  path.delete(value);
  return copy;
}

/** The censor as pino's `formatters.log` applies it to every line's fields. */
function censored(fields: Record<string, unknown>): Record<string, unknown> {
  return censorFields(fields, new Set());
}

/**
 * The port over a pino instance. `child` is the one method with work to do: pino's
 * formatters never see a child's bindings, so they are censored here before pino keeps them.
 */
function over(instance: pino.Logger): Logger {
  return {
    debug: (fields, msg) => instance.debug(fields, msg),
    info: (fields, msg) => instance.info(fields, msg),
    warn: (fields, msg) => instance.warn(fields, msg),
    error: (fields, msg) => instance.error(fields, msg),
    child: (bindings: LogFields) => over(instance.child(censored(bindings))),
  };
}

/**
 * A Logger that satisfies the port with pino underneath. Every line carries `level`, `time`
 * and `msg` plus the fields given to the call, and nothing about the process — `pid` is the
 * profile id in this codebase, so pino's process id and hostname are left off (Cloud Run
 * knows which instance wrote a line). A secret-keyed field is never written in clear.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const pinoOptions = {
    level: options.level ?? "info",
    base: null,
    formatters: { level: (label: string) => ({ level: label }), log: censored },
    // The censor has already turned every Error into pino's shape; pino's own `err`
    // serialiser would re-read that plain object as an error of type "Object".
    serializers: { err: (serialised: unknown) => serialised },
  };
  return over(
    options.destination === undefined ? pino(pinoOptions) : pino(pinoOptions, options.destination),
  );
}
