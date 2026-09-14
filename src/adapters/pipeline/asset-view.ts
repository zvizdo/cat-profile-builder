import type { MediaAsset } from "@/core/media/schema";
import type { MediaStore } from "@/core/ports";

// What the builder receives for every media record: the stored `MediaAsset` plus the public
// URL of each derived revision it has, built server-side through the store (ADR-015). The
// browser never joins a bucket and a rev itself — it is handed finished URLs, or none.

/** A media record with the public URL of every derived file it currently has. */
export type AssetView = MediaAsset & {
  /** The clean photo (`revisions.clean`). */
  cleanUrl?: string;
  /** The web clip (`revisions.web`). */
  webUrl?: string;
  /** The clip's poster frame (`revisions.poster`). */
  posterUrl?: string;
};

/**
 * `asset` with a URL for each revision it has: `cleanUrl` for a photo, `webUrl` and
 * `posterUrl` for a finished clip, nothing extra for a clip that still needs a trim. A
 * revision that is absent adds no key at all, so the view serialises cleanly.
 */
export function assetView(
  store: Pick<MediaStore, "publicUrl">,
  pid: string,
  asset: MediaAsset,
): AssetView {
  const view: AssetView = { ...asset };
  const { clean, web, poster } = asset.revisions;
  if (clean !== undefined) view.cleanUrl = store.publicUrl(pid, asset.id, "clean", clean);
  if (web !== undefined) view.webUrl = store.publicUrl(pid, asset.id, "web", web);
  if (poster !== undefined) view.posterUrl = store.publicUrl(pid, asset.id, "poster", poster);
  return view;
}
