// The page address as the one seam of this feature (Principle VI, contracts/address.md): text
// anyone may have written becomes a complete `Fundraiser`, and a `Fundraiser` becomes the text
// that goes back into the address bar. No framework, no storage; nothing here ever throws.

import { z } from "zod";
import { toAddressAmount } from "@/core/fundraiser/money";
import {
  DEFAULTS,
  HEADLINE_MAX,
  normaliseHeadline,
  validateGoal,
  validateRaised,
  type Fundraiser,
} from "@/core/fundraiser/fundraiser";

/**
 * The most UTF-16 units of a headline the reader looks at before it cleans the text. Far above
 * {@link HEADLINE_MAX}, so no real headline loses a character, and low enough that a hostile
 * address costs a bounded amount of work.
 */
const HEADLINE_READ_UNITS = 600;

/** The three keys the address carries, in the order they are written. */
const KEYS = ["headline", "raised", "goal"] as const;

/** One key's value as a framework hands it over: text, a list of texts (repeated key), or none. */
const keyValue = z.union([z.string(), z.array(z.string())]).optional();
/** Only the three keys we read are judged; any other key is ignored whatever it holds. */
const queryShape = z.object({ headline: keyValue, raised: keyValue, goal: keyValue });

/** The first value of each key, or `undefined` where a key is missing. */
type RawKeys = Record<(typeof KEYS)[number], string | undefined>;

/**
 * Pulls the three keys out of `query`, taking the first value of a repeated key. Anything that
 * is not an object of text and lists of text (and any object that throws when read) counts as
 * no query at all, so the reader still answers with every default. Own properties only: a key
 * that lives on the prototype is not the address's.
 */
function pickKeys(query: unknown): RawKeys {
  const none: RawKeys = { headline: undefined, raised: undefined, goal: undefined };
  if (typeof query !== "object" || query === null || Array.isArray(query)) return none;
  try {
    const picked: Record<string, unknown> = {};
    for (const key of KEYS)
      picked[key] = Object.hasOwn(query, key) ? Reflect.get(query, key) : undefined;
    const parsed = queryShape.safeParse(picked);
    if (!parsed.success) return none;
    const first = (value: string | string[] | undefined): string | undefined =>
      typeof value === "string" ? value : value?.[0];
    return {
      headline: first(parsed.data.headline),
      raised: first(parsed.data.raised),
      goal: first(parsed.data.goal),
    };
  } catch {
    return none;
  }
}

/** `text` cut to {@link HEADLINE_READ_UNITS} units, without leaving half of an emoji at the end. */
function cutToReadLimit(text: string): string {
  if (text.length <= HEADLINE_READ_UNITS) return text;
  const lastKept = text.charCodeAt(HEADLINE_READ_UNITS - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? HEADLINE_READ_UNITS - 1 : HEADLINE_READ_UNITS);
}

/**
 * The headline the address says: cleaned, then cut (never refused) to {@link HEADLINE_MAX} code
 * points so an emoji is never split, and the default when nothing visible is left. The typed
 * field refuses an over-long headline instead; the address cannot ask the person to retype.
 */
function readHeadline(text: string | undefined): string {
  if (text === undefined) return DEFAULTS.headline;
  const cleaned = normaliseHeadline(cutToReadLimit(text));
  const cut = Array.from(cleaned).slice(0, HEADLINE_MAX).join("").trimEnd();
  return cut === "" ? DEFAULTS.headline : cut;
}

/**
 * Reads the page address into a complete fundraiser. Total: any `query` at all, including none,
 * gives an answer and never throws. Each of the three keys is judged alone, so one bad value
 * falls back to its own default and never costs the other two (FR-023). A repeated key uses its
 * first value; unknown keys are ignored. `isBlank` is true when none of the three keys exists
 * (a key with an empty value exists), which is when the page shows its starting hint.
 */
export function readAddress(query: unknown): { fundraiser: Fundraiser; isBlank: boolean } {
  const raw = pickKeys(query);
  const raised = raw.raised === undefined ? undefined : validateRaised(raw.raised);
  const goal = raw.goal === undefined ? undefined : validateGoal(raw.goal);
  return {
    fundraiser: {
      headline: readHeadline(raw.headline),
      raisedCents: raised?.ok ? raised.value : DEFAULTS.raisedCents,
      goalCents: goal?.ok ? goal.value : DEFAULTS.goalCents,
    },
    isBlank: KEYS.every((key) => raw[key] === undefined),
  };
}

/**
 * Writes a fundraiser as the query string for the address bar: `?headline=…&raised=…&goal=…`,
 * always all three keys in that order so a copied address is complete. Spaces are `%20`, never
 * `+`, so the address reads the same in every tool, and amounts are canonical (`6500`,
 * `6500.50`). Reading what this writes gives the same fundraiser back.
 */
export function writeAddress(fundraiser: Fundraiser): string {
  const params = new URLSearchParams([
    ["headline", fundraiser.headline],
    ["raised", toAddressAmount(fundraiser.raisedCents)],
    ["goal", toAddressAmount(fundraiser.goalCents)],
  ]);
  // A literal plus in the headline is already `%2B`, so every `+` left here stood for a space.
  return `?${params.toString().replaceAll("+", "%20")}`;
}
