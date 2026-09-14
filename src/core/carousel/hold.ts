// The carousel's hold — how long a turn lasts (FR-084, FR-089) — as the one place its
// bounds live. `/carousel?hold=`, `/kiosk?hold=` and the beat loop all read this so the
// clamp can never disagree with itself.

/** The shortest hold a visitor may choose. */
export const HOLD_MIN = 4;
/** The longest hold a visitor may choose. */
export const HOLD_MAX = 20;
/** The hold with no `?hold=` in the address (FR-089). */
export const HOLD_DEFAULT = 8;

/** The first value of a possibly-repeated query parameter, or `undefined` for none. */
function firstOf(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  return value === undefined ? undefined : value[0];
}

/**
 * The `hold` query value as whole seconds, clamped to {@link HOLD_MIN}–{@link HOLD_MAX}
 * (FR-089): absent or unparsable falls back to {@link HOLD_DEFAULT} — `?hold=99` becomes
 * 20, `?hold=abc` becomes 8 — never a refusal, since a mistyped address should still show a
 * carousel. Takes the raw query shape a Next page's `searchParams` or a route's parsed
 * query hands over, a string or (for a repeated key) an array of them.
 */
export function parseHold(query: string | readonly string[] | undefined): number {
  const raw = firstOf(query);
  if (raw === undefined) return HOLD_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return HOLD_DEFAULT;
  return Math.min(HOLD_MAX, Math.max(HOLD_MIN, parsed));
}
