import type { LogFields, Logger } from "@/core/ports";

// The in-memory Logger sink (contracts/ports.md → Fake): every line lands in `entries`
// with its level, its fields (child bindings merged underneath) and its message.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  fields: LogFields;
  msg: string;
}

export interface MemoryLogger extends Logger {
  readonly entries: LogEntry[];
}

function loggerOver(entries: LogEntry[], bindings: LogFields): MemoryLogger {
  const log =
    (level: LogLevel) =>
    (fields: LogFields, msg: string): void => {
      entries.push({ level, fields: { ...bindings, ...fields }, msg });
    };
  return {
    entries,
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (more) => loggerOver(entries, { ...bindings, ...more }),
  };
}

export function memoryLogger(): MemoryLogger {
  return loggerOver([], {});
}
