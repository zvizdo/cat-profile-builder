// Dollar amounts for the fundraiser: the one grammar `raised=` and `goal=` in the address and
// the in-place fields both use (contracts/address.md → Amounts), and the three ways an amount
// is written back. Money is whole cents everywhere, so no sum or comparison meets a float.

import { err, ok, type Result } from "@/core/result";

/** Why a piece of text is not an amount. A code, not a sentence: the UI owns the words. */
export type MoneyReason = "empty" | "not-a-number" | "negative" | "too-precise" | "too-large";

/** Longer text is refused unparsed, so a hostile address costs one comparison. */
const MAX_TEXT_LENGTH = 32;
/** Twelve digits before the point keep `dollars * 100` far inside safe integers. */
const MAX_WHOLE_DIGITS = 12;

/**
 * The amount itself: digits with correct thousands commas (or none), then an optional point
 * and decimals. A bare `.` and a trailing `.` have no match on purpose. Groups: whole, decimals.
 */
const AMOUNT = /^(?:([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+))?(?:\.([0-9]+))?$/;

/**
 * Splits off the minus signs and the `$`. A minus may sit before or after the `$` (`-$5`,
 * `$-5`); `minuses` counts them so the caller can tell one from two.
 */
function splitSigns(text: string): { minuses: number; body: string } {
  let body = text;
  let minuses = 0;
  for (const mark of ["-", "$", "-"]) {
    if (!body.startsWith(mark)) continue;
    if (mark === "-") minuses += 1;
    body = body.slice(1);
  }
  return { minuses, body };
}

/** The digits before the point (commas gone) and after it, or `null` if `body` is no amount. */
function splitAmount(body: string): { digits: string; decimals: string } | null {
  const match = AMOUNT.exec(body);
  if (match === null || body === "") return null;
  return { digits: (match[1] ?? "").replaceAll(",", ""), decimals: match[2] ?? "" };
}

/**
 * Reads `text` as dollars and returns whole cents. Accepts an optional `$`, digits, correct
 * thousands commas and one or two decimals, with surrounding whitespace ignored. Never
 * throws and never returns a fraction: every refusal comes back as a {@link MoneyReason}.
 * The $99,999,999.99 ceiling and the goal above $0 are the fundraiser's rules, not this one's.
 */
export function parseDollars(text: string): Result<number, MoneyReason> {
  if (text.length > MAX_TEXT_LENGTH) return err("not-a-number");
  const trimmed = text.trim();
  if (trimmed === "") return err("empty");

  // A minus only counts once the rest is a real amount: `-abc` is not a number, `-5` is a
  // negative one, and two minuses are never either.
  const { minuses, body } = splitSigns(trimmed);
  const amount = splitAmount(body);
  if (minuses > 1 || amount === null) return err("not-a-number");
  if (minuses === 1) return err("negative");

  const { digits, decimals } = amount;
  if (digits.length > MAX_WHOLE_DIGITS) return err("too-large");
  if (decimals.length > 2) return err("too-precise");
  return ok(Number(digits || "0") * 100 + Number(decimals.padEnd(2, "0")));
}

/** `1234567` as `1,234,567`. */
function withCommas(whole: number): string {
  return whole.toString().replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/g, ",");
}

/** Two digits for a cents part: `5` as `05`. */
function twoDigits(cents: number): string {
  return cents.toString().padStart(2, "0");
}

/**
 * `cents` as a full amount: `$6,500` when there are no cents, `$6,500.50` when there are.
 * Expects a non-negative whole number, which is all the parser and the schemas produce.
 */
export function formatDollars(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `$${withCommas(dollars)}` : `$${withCommas(dollars)}.${twoDigits(rest)}`;
}

/** The compact unit for $1,000 up to $999,999, and the larger ones, biggest first. */
const THOUSANDS: readonly [suffix: string, size: number] = ["K", 1_000];
// "B" is billions (1_000_000_000), not bytes; "M" is millions.
const LARGER_UNITS: ReadonlyArray<readonly [suffix: string, size: number]> = [
  ["B", 1_000_000_000],
  ["M", 1_000_000],
];

/**
 * `cents` for the thermometer's tick labels, in at most three significant digits: `$999`,
 * `$10K`, `$12.5K`, `$1.25M`. Whole dollars below $1,000; below $1 the cents show, so a
 * one-cent goal reads `$0.01` and not `$0`. It rounds first and picks the unit after, so
 * $999,999 is `$1M` and never `$1000K`. Expects a non-negative whole number.
 */
export function formatCompactDollars(cents: number): string {
  if (cents > 0 && cents < 100) return `$0.${twoDigits(cents)}`;
  const dollars = Math.floor((cents + 50) / 100);
  if (dollars < 1000) return `$${dollars}`;

  // Keep the leading three digits, rounding half up on integers so there is no float to drift.
  const dropped = 10 ** (dollars.toString().length - 3);
  const rounded = Math.floor((dollars + dropped / 2) / dropped) * dropped;
  const [suffix, size] = LARGER_UNITS.find(([, unit]) => rounded >= unit) ?? THOUSANDS;
  return `$${rounded / size}${suffix}`;
}

/**
 * `cents` as the address writes it: `6500` or `6500.50`, with no `$` and no commas
 * (contracts/address.md → Writing). Reads back through {@link parseDollars} unchanged.
 */
export function toAddressAmount(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `${dollars}` : `${dollars}.${twoDigits(rest)}`;
}
