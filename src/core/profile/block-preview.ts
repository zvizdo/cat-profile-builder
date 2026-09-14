import type { MediaAsset } from "../media/schema";
import { plainText, type RichText } from "./rich-text";
import { type Block, type MediaId } from "./schema";

// The one-line preview a section draws wherever the page is summarised in brief
// (data-model.md → EditOperation; F59): the outline `read_outline` sends the model
// (`reads.ts`'s "Sections:" list) and the line a `remove_block` card strikes through
// (`media-change.ts`'s `removalPreview`). One function, pulled out of `reads.ts` here so
// the two can never quietly drift into two different sentences for the same block.

/** `assets` keyed by id, for a lookup per block rather than a scan per media reference.
 * Exported for `reads.ts`'s own full-text read (`mediaRef`), so the two never keep two
 * copies of the same map-building line (review round 1, N1). */
export function libraryOf(assets: readonly MediaAsset[]): Map<MediaId, MediaAsset> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

/** A photo or clip's description, or a plain sentence when it has none or is gone.
 * Exported for `reads.ts`'s own full-text read (`mediaRef`) and for `PhotoChange.tsx`/
 * `RemovalPreview.tsx`'s own captions, so the words for a missing or undescribed record
 * are written once (review round 1, N1). */
export function altOf(asset: MediaAsset | undefined): string {
  if (!asset) return "no longer in the library";
  return asset.alt?.text ?? "no description yet";
}

/** The first line of `text`, cut at 80 characters with an ellipsis if it runs longer. */
function firstLine(text: string, max = 80): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function previewHero(mediaId: MediaId | null, library: Map<MediaId, MediaAsset>): string {
  return mediaId === null ? "No photo yet." : altOf(library.get(mediaId));
}

function previewBio(content: RichText): string {
  const text = plainText(content).trim();
  return text === "" ? "Empty." : firstLine(text);
}

function previewPhoto(
  block: Extract<Block, { type: "photo" }>,
  library: Map<MediaId, MediaAsset>,
): string {
  const caption = block.caption?.trim();
  if (caption) return caption;
  return previewHero(block.mediaId, library);
}

function previewCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}.`;
}

function previewText(text: string): string {
  return text.trim() === "" ? "Empty." : firstLine(text);
}

function previewOf(block: Block, library: Map<MediaId, MediaAsset>): string {
  switch (block.type) {
    case "hero":
      return previewHero(block.mediaId, library);
    case "bio":
      return previewBio(block.content);
    case "photo":
      return previewPhoto(block, library);
    case "gallery":
      return previewCount(block.mediaIds.length, "photo");
    case "video":
      return block.mediaId === null ? "No clip yet." : altOf(library.get(block.mediaId));
    case "day":
      return `${block.scenes.length} scenes.`;
    case "needs":
      return previewCount(block.cards.length, "card");
    case "quote":
      return previewText(block.text);
  }
}

/**
 * The one-line preview a section draws when the page is summarised rather than shown in
 * full: a photo or clip's alt text, a caption, the bio's or a quote's first line, or a
 * count (a gallery's photos, a day's scenes, a needs section's cards). Pure over
 * `(block, assets)`. `library`, when the caller already built one (`readOutline` builds
 * one for the whole page), skips rebuilding it per block (review round 1, N1) — a caller
 * with just one block, like `removalPreview`, leaves it to build fresh. The default is
 * its own line, not a parameter default, so the switch above stays `blockPreview`'s only
 * branching (the complexity warning the parameter default would otherwise add).
 */
export function blockPreview(
  block: Block,
  assets: readonly MediaAsset[],
  library?: Map<MediaId, MediaAsset>,
): string {
  return previewOf(block, library ?? libraryOf(assets));
}
