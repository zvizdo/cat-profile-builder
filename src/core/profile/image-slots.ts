import { err, ok, type Result } from "../result";
import { blockById, missingBlock, sectionLabel, withBlock } from "./fields";
import type { OperationError } from "./operations";
import { type Block, type MediaId, type ProfileDocument } from "./schema";

// The slot grammar of `replace_image` (data-model.md → EditOperation): which sections hold
// media, how a slot is addressed, and how it is written. `applyOperation` and
// `describeOperation` both resolve slots here, so the two never disagree about one.

type DayBlock = Extract<Block, { type: "day" }>;
type GalleryBlock = Extract<Block, { type: "gallery" }>;

/**
 * One media slot of a section, resolved against a concrete document: what kind of media it
 * takes, how it is named in a sentence (`the hero`, `slot 2 of the gallery`, `scene 3 of
 * the "A day in her life" section`), what it holds now (`null` when empty) and a writer.
 */
export interface ImageSlot {
  kind: "photo" | "video";
  label: string;
  current: MediaId | null;
  /** The document with the slot holding `mediaId`. */
  set: (mediaId: MediaId) => unknown;
}

type SlotResult = Result<ImageSlot, OperationError>;

function gallerySlot(
  doc: ProfileDocument,
  block: GalleryBlock,
  slot: number | undefined,
): SlotResult {
  const count = block.mediaIds.length;
  if (slot === undefined) {
    const reason = `Say which gallery slot to fill: 0 to ${count} (${count} adds a photo).`;
    return err({ code: "invalid", reason });
  }
  const existing = block.mediaIds[slot];
  if (existing === undefined && slot > count) {
    const reason = `The gallery has ${count} photos, so the slot must be 0 to ${count}.`;
    return err({ code: "refused", reason });
  }
  return ok({
    kind: "photo",
    label: existing === undefined ? "the gallery" : `slot ${slot + 1} of the gallery`,
    current: existing ?? null,
    set: (mediaId) => {
      const mediaIds = [
        ...block.mediaIds.slice(0, slot),
        mediaId,
        ...block.mediaIds.slice(slot + 1),
      ];
      return withBlock(doc, block.id, { ...block, mediaIds });
    },
  });
}

function daySlot(doc: ProfileDocument, block: DayBlock, slot: number | undefined): SlotResult {
  if (slot === undefined) {
    return err({ code: "invalid", reason: "Say which scene to fill: 0, 1 or 2." });
  }
  const scene = block.scenes[slot];
  if (!scene) {
    const label = sectionLabel("day", doc.sex);
    const reason = `The ${label} has three scenes, so the slot must be 0, 1 or 2.`;
    return err({ code: "refused", reason });
  }
  return ok({
    kind: "photo",
    label: `scene ${slot + 1} of the ${sectionLabel("day", doc.sex)}`,
    current: scene.mediaId,
    set: (mediaId) =>
      withBlock(doc, block.id, {
        ...block,
        scenes: block.scenes.map((current, i) => (i === slot ? { ...current, mediaId } : current)),
      }),
  });
}

/**
 * Resolves a `replace_image` target against `doc` (data-model.md → EditOperation): `slot`
 * is required for a gallery (`0..length`; `length` appends) and a day section (`0..2`),
 * and must be absent for hero, photo, video and quote, which hold one slot. A bio or needs
 * section has no slot at all. Returns `invalid` for a malformed slot, `refused` for a
 * missing section or a slot past the end, and the slot otherwise. A video section takes a
 * clip; every other slot takes a photo.
 */
export function imageSlotOf(
  doc: ProfileDocument,
  blockId: string,
  slot: number | undefined,
): SlotResult {
  const block = blockById(doc, blockId);
  if (!block) return err(missingBlock(blockId));
  const label = sectionLabel(block.type, doc.sex);
  switch (block.type) {
    case "bio":
    case "needs":
      return err({ code: "invalid", reason: `The ${label} has no photo to replace.` });
    case "gallery":
      return gallerySlot(doc, block, slot);
    case "day":
      return daySlot(doc, block, slot);
    default: {
      const kind = block.type === "video" ? "video" : "photo";
      if (slot !== undefined) {
        const thing = kind === "video" ? "clip" : "photo";
        return err({
          code: "invalid",
          reason: `The ${label} has one ${thing}, so "slot" doesn't apply.`,
        });
      }
      return ok({
        kind,
        label: `the ${label}`,
        current: block.mediaId,
        set: (mediaId) => withBlock(doc, block.id, { ...block, mediaId }),
      });
    }
  }
}

/** One slot of the page holding a given photo: its `replace_image` address and its name in a sentence. */
export interface Placement {
  blockId: string;
  /** Present only for a gallery or day slot, exactly as `replace_image` wants it. */
  slot?: number;
  label: string;
}

/** Every slot address a block has: none for a bio or needs, one per photo or scene otherwise. */
function slotAddresses(block: Block): (number | undefined)[] {
  switch (block.type) {
    case "gallery":
      return block.mediaIds.map((_, index) => index);
    case "day":
      return block.scenes.map((_, index) => index);
    case "bio":
    case "needs":
      return [];
    default:
      return [undefined];
  }
}

/**
 * Every slot of `doc` holding `mediaId`, in document order (T045; FR-053: enhancing and
 * reverting are per placement). Each carries the `blockId` and `slot` a `replace_image`
 * on it takes — `slot` only where the grammar wants one — and the label a sentence would
 * use (`the hero`, `slot 2 of the gallery`). Empty when nothing holds the id.
 */
export function placementsOf(doc: ProfileDocument, mediaId: MediaId): Placement[] {
  return doc.blocks.flatMap((block) =>
    slotAddresses(block).flatMap((slot) => {
      const resolved = imageSlotOf(doc, block.id, slot);
      if (!resolved.ok || resolved.value.current !== mediaId) return [];
      const { label } = resolved.value;
      return [
        slot === undefined ? { blockId: block.id, label } : { blockId: block.id, slot, label },
      ];
    }),
  );
}
