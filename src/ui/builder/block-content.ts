import type { BlockInput } from "@/core/profile/operations";
import { FIELD_LIMITS, type Block } from "@/core/profile/schema";

// What the rail and the canvas say about each section type (CONTENT.md → Rail, Block
// labels), and the empty block an `Add section` tile adds. Nothing here decides what a
// document may hold — `applyOperation` does — it only names things in the shelter's voice.

/**
 * The seven addable section types, in the order the rail offers them (F1: the hero is
 * mandatory and fixed at the top of every profile already, so it is never one of these).
 */
export const BLOCK_TYPES: readonly Exclude<Block["type"], "hero">[] = [
  "bio",
  "photo",
  "gallery",
  "video",
  "day",
  "needs",
  "quote",
];

const TILE_NAME: Record<Block["type"], string> = {
  hero: "Hero",
  bio: "Bio",
  photo: "Photo",
  gallery: "Gallery",
  video: "Video",
  day: "Day",
  needs: "Needs",
  quote: "Quote",
};

const FIXED_LABEL: Record<Exclude<Block["type"], "gallery">, string> = {
  hero: "HERO · full-bleed photo + name",
  bio: "BIO · paragraphs, bold, italic, links",
  photo: "PHOTO · one photo, optional caption",
  video: "VIDEO · one clip, trimmed",
  day: "DAY · three scenes, one line each",
  needs: "NEEDS · up to three cards",
  quote: "QUOTE · one line, one photo",
};

/** The word on the rail's tile for `type`. */
export function tileName(type: Block["type"]): string {
  return TILE_NAME[type];
}

/** The mono label under a frame: the type and what it holds, in CONTENT.md's words. */
export function frameLabel(block: Block): string {
  if (block.type === "gallery") {
    return `GALLERY · ${block.mediaIds.length} of up to ${FIELD_LIMITS.galleryPhotos}`;
  }
  return FIXED_LABEL[block.type];
}

/**
 * The mono label a section-picker option shows for `type` — the same words `frameLabel`
 * gives the frame once it exists, except the gallery, which has no photos yet to count
 * (F2).
 */
export function pickerLabel(type: Exclude<Block["type"], "hero">): string {
  if (type === "gallery") return `GALLERY · up to ${FIELD_LIMITS.galleryPhotos} photos`;
  return FIXED_LABEL[type];
}

/**
 * The block an `Add section` tile adds: every slot empty, every text blank, a day section
 * with its three scenes and a needs section with its one card, so it is a legal input for
 * `add_block` and the volunteer fills it in on the canvas.
 */
export function emptyBlock(type: Block["type"]): BlockInput {
  switch (type) {
    case "hero":
      return { type, mediaId: null };
    case "bio":
      return { type, content: { paragraphs: [] } };
    case "photo":
      return { type, mediaId: null };
    case "gallery":
      return { type, mediaIds: [] };
    case "video":
      return { type, mediaId: null };
    case "day":
      return {
        type,
        scenes: [
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
        ],
      };
    case "needs":
      return { type, cards: [{ title: "", text: "" }] };
    case "quote":
      return { type, mediaId: null, text: "" };
  }
}
