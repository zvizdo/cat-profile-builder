// The `edited 4d` word on a list card (CONTENT.md → Profile list, card meta). Pure and
// given its `now`, so a server render and the browser agree on the text.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** A month is thirty days here: the word is a rough age, not a calendar. */
const MONTH = 30 * DAY;

/** The unit steps, largest first, each with the suffix a card shows. */
const STEPS: ReadonlyArray<[seconds: number, suffix: string]> = [
  [MONTH, "mo"],
  [WEEK, "w"],
  [DAY, "d"],
  [HOUR, "h"],
  [MINUTE, "m"],
];

/**
 * How long before `now` the ISO instant `iso` was, as one short token: `just now` under a
 * minute, then whole minutes (`5m`), hours (`4h`), days (`4d`), weeks (`3w`) and
 * thirty-day months (`2mo`), each floored. An instant in the future or one that does not
 * parse is `just now` too — the card never shows a negative age or a guess.
 */
export function relativeTime(iso: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - Date.parse(iso)) / 1000);
  for (const [unit, suffix] of STEPS) {
    if (seconds >= unit) return `${Math.floor(seconds / unit)}${suffix}`;
  }
  return "just now";
}

/**
 * {@link relativeTime} with whole seconds under a minute — `2s`, `59s` — for the builder's
 * `Draft saved 2s ago` line (CONTENT.md → Builder chrome). Under a second, in the future
 * or unparseable it is `just now`, like the coarser form.
 */
export function relativeTimeSeconds(iso: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - Date.parse(iso)) / 1000);
  if (seconds >= MINUTE) return relativeTime(iso, now);
  return seconds >= 1 ? `${seconds}s` : "just now";
}
