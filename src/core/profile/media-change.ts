import type { MediaAsset } from "../media/schema";
import { blockPreview } from "./block-preview";
import { blockById, fieldOf, sectionLabel } from "./fields";
import { imageSlotOf } from "./image-slots";
import type { EditOperation } from "./operations";
import { type Block, type MediaId, type ProfileDocument } from "./schema";

// The image half of F58's `text-change.ts` (the memo's §3, "image changes — feasibility"):
// a `replace_image` or a gallery's `set_field mediaIds` reads as which ids change, and a
// `remove_block` reads as the section's own line plus its one photo, when it has exactly
// one. Neither touches a thumbnail's pixels — that join against `library.assets` (the
// browser's live `AssetView`s, which core never imports, Principle I) is `PhotoChange.tsx`
// and `RemovalPreview.tsx`'s own job; this file only says which ids, and whether `assets`
// (the document's own `MediaAsset`s — an `AssetView[]` satisfies this structurally, since
// it only adds fields) still has each one.

/** One photo or clip a card names, by id: `known` when `assets` still has it, so a face
 * can be drawn — `false` for one the library has since lost (`SlotFaces.tsx`'s `missing`
 * face, F59). */
export interface MediaFace {
  mediaId: MediaId;
  known: boolean;
}

/**
 * The before → after `replace_image` proposes for a single-photo slot, or the dropped and
 * kept ids a gallery's `set_field mediaIds` proposes — the two shapes a proposal card
 * draws thumbnails for (F59; `PhotoChange.tsx`).
 */
export type MediaChange =
  | { kind: "photo"; label: string; before: MediaFace; after: MediaFace }
  | { kind: "gallery"; label: string; dropped: readonly MediaFace[]; kept: readonly MediaFace[] };

function faceOf(assets: readonly MediaAsset[], mediaId: MediaId): MediaFace {
  return { mediaId, known: assets.some((asset) => asset.id === mediaId) };
}

function replacePhoto(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  op: Extract<EditOperation, { op: "replace_image" }>,
): MediaChange | null {
  const slot = imageSlotOf(doc, op.blockId, op.slot);
  if (!slot.ok || slot.value.current === null) return null;
  // The same id twice (a pre-existing gap in `describe.ts`'s own destructive check for
  // the id-for-itself case, review round 1, N2) says nothing — no pair to draw.
  if (slot.value.current === op.mediaId) return null;
  return {
    kind: "photo",
    label: slot.value.label,
    before: faceOf(assets, slot.value.current),
    after: faceOf(assets, op.mediaId),
  };
}

function galleryDrop(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  op: Extract<EditOperation, { op: "set_field" }>,
): MediaChange | null {
  const field = fieldOf(doc, op.target, op.path);
  if (!field.ok || field.value.kind !== "mediaIds") return null;
  const parsed = field.value.schema.safeParse(op.value);
  if (!parsed.success) return null;
  const current = field.value.current;
  const next = parsed.data;
  const dropped = current.filter((id) => !next.includes(id));
  const kept = current.filter((id) => next.includes(id));
  return {
    kind: "gallery",
    label: `the ${sectionLabel("gallery", doc.sex)}`,
    dropped: dropped.map((id) => faceOf(assets, id)),
    kept: kept.map((id) => faceOf(assets, id)),
  };
}

/**
 * The image change `op` proposes against `doc`, or `null` for every other operation, a
 * missing block, an empty slot (never carded, so never reached in practice), or a
 * `set_field` on a path that is not a gallery's photos. Pure over `(doc, assets, op)`.
 */
export function mediaChange(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  op: EditOperation,
): MediaChange | null {
  if (op.op === "replace_image") return replacePhoto(doc, assets, op);
  if (op.op === "set_field" && op.target.kind === "block" && op.path === "mediaIds") {
    return galleryDrop(doc, assets, op);
  }
  return null;
}

/** The single media id a section holds, for one with exactly one photo or clip slot;
 * `null` for a bio or needs section (a written list) and a gallery or day section
 * (several) — those never draw a face. */
function singleMediaId(block: Block): MediaId | null {
  switch (block.type) {
    case "hero":
    case "photo":
    case "video":
    case "quote":
      return block.mediaId;
    case "bio":
    case "gallery":
    case "day":
    case "needs":
      return null;
  }
}

/**
 * The line and face a `remove_block` card draws struck through: the section's own name,
 * its one-line preview (`blockPreview`, the same words `read_outline` uses), and its
 * single photo or clip when it has exactly one. `null` for a block the document no
 * longer has and for every operation but `remove_block`. Pure over `(doc, assets, op)`.
 */
export interface RemovalPreview {
  label: string;
  text: string;
  face: MediaFace | null;
}

export function removalPreview(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  op: EditOperation,
): RemovalPreview | null {
  if (op.op !== "remove_block") return null;
  const block = blockById(doc, op.blockId);
  if (block === undefined) return null;
  const mediaId = singleMediaId(block);
  return {
    label: sectionLabel(block.type, doc.sex),
    text: blockPreview(block, assets),
    face: mediaId === null ? null : faceOf(assets, mediaId),
  };
}
