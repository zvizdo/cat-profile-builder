// The public address (FR-057): `/cats/{slug}-{id}`. The slug is a readable form of the
// cat's name and purely cosmetic; the trailing id is what a lookup uses, so a renamed cat's
// old links keep working.

/** The longest slug the published document accepts (schema: 1–40 chars of `a-z0-9-`). */
const MAX_SLUG_LENGTH = 40;

/** What `slugify` returns when a name has nothing usable in it; a slug is never empty. */
const FALLBACK_SLUG = "cat";

const APOSTROPHES = /['’‘]/g;
const COMBINING_MARKS = /\p{M}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/**
 * A readable, URL-safe form of a name: lowercased, accents stripped to their base letters
 * ("Zoë" → "zoe"), apostrophes removed ("O'Neil" → "oneil"), every other run of characters
 * turned into one hyphen, no hyphen at either end, at most 40 characters. A name with
 * nothing usable in it becomes `"cat"`, so the result always satisfies the published
 * document's slug rule.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, "")
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(EDGE_HYPHENS, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_HYPHENS, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}

/** The path of a cat's public page: `/cats/{slug}-{id}` (FR-057). */
export function publicPath(slug: string, id: string): string {
  return `/cats/${slug}-${id}`;
}

/** The full address a volunteer shares: `base` (with or without a trailing slash) plus {@link publicPath}. */
export function publicAddress(base: string, slug: string, id: string): string {
  return `${base.replace(/\/+$/, "")}${publicPath(slug, id)}`;
}

/** `{slug}-{id}` or a bare `{id}`; the id is 8 chars of the profile-id alphabet. */
const PUBLIC_PATH = /^(?:[a-z0-9-]+-)?[a-z2-7]{8}$/;

/** The length of an id: 8 chars of `[a-z2-7]`, the same rule as `ProfileIdSchema`. */
const ID_LENGTH = 8;

/**
 * Splits the last segment of a public URL into its slug and profile id, or returns `null`
 * when the segment is not one this app would produce. The id is the trailing 8 characters
 * of `[a-z2-7]` after the last hyphen; everything before that hyphen is the slug, which
 * may be anything `slugify` could have produced and is not checked further — a lookup uses
 * the id alone. A bare id parses with an empty slug. Uppercase, other characters, an id of
 * the wrong length or alphabet, or a hyphen with nothing before it all return `null`.
 */
export function parsePublicPath(segment: string): { slug: string; id: string } | null {
  if (!PUBLIC_PATH.test(segment)) return null;
  // The id is the last 8 characters; the slug is what precedes the hyphen before them.
  return { slug: segment.slice(0, -(ID_LENGTH + 1)), id: segment.slice(-ID_LENGTH) };
}
