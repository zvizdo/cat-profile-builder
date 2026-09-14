import type { MediaAsset } from "@/core/media/schema";
import type { DraftMeta } from "@/core/ports";
import { displayLine } from "@/core/profile/display-line";
import { referencedMediaIds, type ProfileDocument } from "@/core/profile/schema";

// The list metadata a draft save stamps (ADR-015 → Draft saves): what the list view shows
// for a cat without reading its document — the name, the display line (so two tabbies can
// be told apart, design audit P1 #4) and one thumbnail. Pure: the caller adds the instant.
// The thumbnail is the photo's id and revision, never a URL (F30) — resolving a URL is the
// list reader's job, through `MediaStore.publicUrl`, so nothing here goes stale.

/** A photo the list can show: ready, with its clean revision written. */
function cleanRev(asset: MediaAsset | undefined): string | null {
  if (asset === undefined || asset.kind !== "photo" || asset.status !== "ready") return null;
  return asset.revisions.clean ?? null;
}

/**
 * `name`, `line` (`displayLine`) and `thumbnail`: the hero's clean photo — its `mid` and
 * `rev` — when the hero holds a ready, cleaned photo; otherwise the first such photo among
 * the ids the page references, in document order; otherwise `null`. An asset the page does
 * not reference is never a thumbnail.
 */
export function listMetadata(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
): Omit<DraftMeta, "updatedAt"> {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const hero = doc.blocks.find((block) => block.type === "hero");
  const heroId = hero?.type === "hero" ? hero.mediaId : null;
  const candidates = [...(heroId === null ? [] : [heroId]), ...referencedMediaIds(doc)];
  let thumbnail: DraftMeta["thumbnail"] = null;
  for (const id of candidates) {
    const rev = cleanRev(byId.get(id));
    if (rev === null) continue;
    thumbnail = { mid: id, rev };
    break;
  }
  return { name: doc.name, line: displayLine(doc), thumbnail };
}
