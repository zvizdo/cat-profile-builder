import type { Block, ProfileDocument } from "@/core/profile/schema";
import { sectionStrings } from "./strings";

// The in-page nav (CONTENT.md → Public profile → Nav: `Story`, `Her day`, `Film`): one
// link per section kind that has a name, pointing at the first block of that kind. A
// photo or quote section is a photographic beat with no entry; the hero is the top of the
// page. Anchors are these fixed words, so no block id ever reaches the markup (FR-059).

/** One in-page link. */
export interface NavItem {
  href: string;
  label: string;
}

/** The section kinds that get an anchor, with the anchor's id. */
const ANCHORS: Partial<Record<Block["type"], string>> = {
  bio: "story",
  gallery: "photos",
  video: "film",
  day: "day",
  needs: "needs",
};

/** The word on the link for each anchored kind; `day` follows the cat's pronoun. */
function labelOf(type: Block["type"], sex: ProfileDocument["sex"]): string {
  switch (type) {
    case "bio":
      return "Story";
    case "gallery":
      return "Photos";
    case "video":
      return "Film";
    case "day":
      return sectionStrings(sex).navDay;
    default:
      return "Needs";
  }
}

/** The anchor id of `blockId` — set only on the first block of an anchored kind — or `undefined`. */
export function sectionId(blocks: readonly Block[], blockId: string): string | undefined {
  const block = blocks.find((candidate) => candidate.id === blockId);
  if (block === undefined) return undefined;
  const anchor = ANCHORS[block.type];
  if (anchor === undefined) return undefined;
  const first = blocks.find((candidate) => candidate.type === block.type);
  return first?.id === blockId ? anchor : undefined;
}

/** The nav's links, in page order, one per anchored kind present. */
export function navItems(blocks: readonly Block[], sex: ProfileDocument["sex"]): NavItem[] {
  const seen = new Set<Block["type"]>();
  const items: NavItem[] = [];
  for (const block of blocks) {
    const anchor = ANCHORS[block.type];
    if (anchor === undefined || seen.has(block.type)) continue;
    seen.add(block.type);
    items.push({ href: `#${anchor}`, label: labelOf(block.type, sex) });
  }
  return items;
}
