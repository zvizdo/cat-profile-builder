/** Structured fields that travel with a log line. Never a secret (the adapter redacts). */
export type LogFields = Record<string, unknown>;

/**
 * Structured logging in pino's shape: fields first, then a plain message. `child` returns
 * a logger whose every line carries `bindings` too (a request id, a profile id). The real
 * adapter is pino with redaction; tests use `memoryLogger`.
 */
export interface Logger {
  debug(fields: LogFields, msg: string): void;
  info(fields: LogFields, msg: string): void;
  warn(fields: LogFields, msg: string): void;
  error(fields: LogFields, msg: string): void;
  child(bindings: LogFields): Logger;
}
