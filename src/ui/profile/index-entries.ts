import type { PublishedRow } from "@/core/ports";
import { displayLine } from "@/core/profile/display-line";
import { loadPublished } from "@/core/profile/migrations";
import {
  referencedMediaIds,
  type PublishedDocument,
  type ResolvedMedia,
} from "@/core/profile/schema";
import { publicPath } from "@/core/profile/slug";

// The public index's rows (FR-090; ADR-015 → "the public index uses the same first-photo
// rule from the published manifest"): what `/cats` shows for every live cat, and nothing
// the profile page would not show — the address, the name, the display line, one photo.

/** One card of the public index. */
export interface IndexEntry {
  href: string;
  name: string;
  line: string;
  /** The hero's photo, else the first photo the page references; `null` for a page of clips. */
  photo: ResolvedMedia | null;
}

/** The manifest entry the card shows: the hero's when it is a photo, else the first photo in stack order. */
function cardPhoto(doc: PublishedDocument): ResolvedMedia | null {
  const hero = doc.blocks.find((block) => block.type === "hero");
  const heroId = hero?.type === "hero" ? hero.mediaId : null;
  const ids = [...(heroId === null ? [] : [heroId]), ...referencedMediaIds(doc)];
  for (const id of ids) {
    const entry = doc.media[id];
    if (entry !== undefined && entry.kind === "photo") return entry;
  }
  return null;
}

/**
 * The rows of `listPublished()` as index cards, most recently published first. Every
 * stored copy is validated through `loadPublished`; one that fails throws, so the index
 * errors rather than rendering a page it cannot read.
 */
export function indexEntries(rows: readonly PublishedRow[]): IndexEntry[] {
  return rows
    .map((row) => loadPublished(row.doc))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((doc) => ({
      href: publicPath(doc.slug, doc.id),
      name: doc.name,
      line: displayLine(doc),
      photo: cardPhoto(doc),
    }));
}
