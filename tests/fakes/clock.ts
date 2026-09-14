import { InternalError } from "@/core/errors";
import type { Clock } from "@/core/ports";

/** A Clock stopped at `iso`; every `now()` is a fresh `Date` of that instant. */
export function fixedClock(iso: string): Clock {
  const millis = Date.parse(iso);
  if (Number.isNaN(millis)) {
    throw new InternalError(`fixedClock needs an ISO date, got "${iso}".`);
  }
  return { now: () => new Date(millis) };
}
