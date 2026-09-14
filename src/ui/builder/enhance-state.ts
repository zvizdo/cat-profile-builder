import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { Placement as CorePlacement } from "@/core/profile/image-slots";
import type { EditOperation } from "@/core/profile/operations";

// What a placed photo offers about enhancement (T045; FR-052, FR-053), decided here as
// data so the editors only draw it: `enhance` on a ready photo that is not itself an
// enhanced copy, `revert to original` on an enhanced copy whose source is still in the
// library, nothing otherwise. The two edits are each one `replace_image` on the one
// placement — the same original placed elsewhere is never touched.

/** Where a photo sits — core's placement without its label: the `blockId` and, for a gallery or day slot, the `slot`. */
export type Placement = Pick<CorePlacement, "blockId" | "slot">;

/** The recipe every enhanced copy was made with (ADR-016): the only one there is. */
const RECIPE = "auto-v1";

/**
 * A copy the library already holds of `mediaId` enhanced with the one recipe, if any.
 * FR-051 makes the recipe deterministic, so such a copy is byte-identical to what the
 * server would answer again — a second Enhance of the same original reuses it rather
 * than adding another record.
 */
export function enhancedCopyOf(
  mediaId: string,
  assets: readonly AssetView[],
): AssetView | undefined {
  return assets.find(
    (asset) => asset.enhancement?.sourceMediaId === mediaId && asset.enhancement.recipe === RECIPE,
  );
}

/** A photo with its clean file to show: what the compare view draws on either side. */
export type ReadyPhoto = AssetView & { cleanUrl: string };

/** `asset` as a {@link ReadyPhoto}, or `undefined` for a clip or a photo still processing (no clean file yet). */
export function readyPhoto(asset: AssetView | undefined): ReadyPhoto | undefined {
  if (asset === undefined || asset.kind !== "photo" || asset.cleanUrl === undefined) {
    return undefined;
  }
  return { ...asset, cleanUrl: asset.cleanUrl };
}

/** The action a placement offers: enhance the photo it holds, or go back to the source of its enhanced copy. */
export type EnhanceAction =
  { kind: "enhance"; original: ReadyPhoto } | { kind: "revert"; sourceMediaId: string };

/** The mono word each action wears on a label row or slot chip. */
export const ENHANCE_LABEL: Record<EnhanceAction["kind"], string> = {
  enhance: "enhance",
  revert: "revert to original",
};

/**
 * The touch tile's visible word for `revert` (F61, controller's ruling
 * 2026-09-13): `"revert to original"` is 139.2px against `"enhance"`'s 87.8px, wide
 * enough to wrap a tile's fixed-width pill cell to an extra line at every touch width.
 * `GalleryCellTouch` shows this word instead; the button's accessible name stays the
 * full `ENHANCE_LABEL.revert` phrase via `aria-label`, so nothing read aloud changes.
 */
export const ENHANCE_LABEL_TOUCH_REVERT = "revert";

/** The word the action reads while the server is still working: no spinner (DESIGN.md rule 4). */
export const IN_FLIGHT = "processing";

/** The record placed in a slot, if the library still holds it. */
export function placedAsset(
  mediaId: string | null,
  assets: readonly AssetView[],
): AssetView | undefined {
  return mediaId === null ? undefined : assets.find((asset) => asset.id === mediaId);
}

/**
 * Which action a placement offers: `enhance` for a ready photo that is not an enhanced
 * copy; `revert` (with the source to go back to) for an enhanced copy whose source is
 * still in the library; `null` for an empty or missing slot, a clip, a photo still
 * processing, or an enhanced copy whose source is gone — there is nothing to go back
 * to, and enhancing an enhancement is not offered, the original is the thing to enhance.
 */
export function enhanceActionFor(
  mediaId: string | null,
  assets: readonly AssetView[],
): EnhanceAction | null {
  const asset = readyPhoto(placedAsset(mediaId, assets));
  if (asset === undefined) return null;
  if (asset.enhancement === undefined) return { kind: "enhance", original: asset };
  const { sourceMediaId } = asset.enhancement;
  return placedAsset(sourceMediaId, assets) === undefined
    ? null
    : { kind: "revert", sourceMediaId };
}

/** The one `replace_image` that puts `mediaId` into `placement`. */
export function replaceIn(placement: Placement, mediaId: string): EditOperation {
  const { blockId, slot } = placement;
  return slot === undefined
    ? { op: "replace_image", blockId, mediaId }
    : { op: "replace_image", blockId, mediaId, slot };
}
