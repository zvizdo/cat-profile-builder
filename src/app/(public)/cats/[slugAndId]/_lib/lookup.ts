import type { ProfileStore } from "@/core/ports";
import { loadPublished } from "@/core/profile/migrations";
import type { PublishedDocument } from "@/core/profile/schema";
import { parsePublicPath, publicPath } from "@/core/profile/slug";

// What `/cats/{slug}-{id}` does with its one segment (contracts/server-boundary.md →
// Pages; FR-057, FR-083): the trailing id is the lookup key, the slug is cosmetic. Only
// `published.json` is read — an archived cat is simply not found, never rendered.

/** The page's three outcomes: a 404, a 308 to the current address, or the document. */
export type Lookup =
  | { kind: "not-found" }
  | { kind: "redirect"; to: string }
  | { kind: "found"; document: PublishedDocument };

/**
 * Resolves the URL segment: `not-found` when it is not `{slug}-{id}` or no published copy
 * exists under the id; `redirect` to `/cats/{slug}-{id}` with the document's own slug when
 * the segment's differs (a renamed cat's old link); otherwise the validated document. A
 * stored copy that fails its schema throws a `ProfileInvalidError` — the page errors
 * rather than rendering part of it.
 */
export async function lookupPublished(
  store: Pick<ProfileStore, "readPublished">,
  segment: string,
): Promise<Lookup> {
  const parsed = parsePublicPath(segment);
  if (parsed === null) return { kind: "not-found" };
  const stored = await store.readPublished(parsed.id);
  if (stored === null) return { kind: "not-found" };
  const document = loadPublished(stored);
  if (document.slug !== parsed.slug) {
    return { kind: "redirect", to: publicPath(document.slug, document.id) };
  }
  return { kind: "found", document };
}
