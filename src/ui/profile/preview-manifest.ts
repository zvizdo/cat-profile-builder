import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { MediaId, ResolvedMedia } from "@/core/profile/schema";

// The preview's manifest (FR-026): the draft's media records, as the builder holds them,
// in the shape the published page reads — so `/builder/{id}/preview` and `/cats/…` render
// through one `ProfilePage`. Unlike `resolveManifest` this refuses nothing: a record
// with nothing to show yet simply has no entry, the renderer stripes that slot, and the
// publish check (T029) is what tells the volunteer what is missing.

/** The entry for one record, or `undefined` while it has no file a page could load. */
function entryOf(asset: AssetView): ResolvedMedia | undefined {
  if (asset.status !== "ready") return undefined;
  const common = {
    alt: asset.alt?.text ?? "",
    focal: asset.focal,
    width: asset.width,
    height: asset.height,
  };
  if (asset.kind === "photo") {
    return asset.cleanUrl === undefined
      ? undefined
      : { kind: "photo", src: asset.cleanUrl, ...common };
  }
  if (asset.webUrl === undefined) return undefined;
  return {
    kind: "video",
    src: asset.webUrl,
    ...(asset.posterUrl === undefined ? {} : { poster: asset.posterUrl }),
    ...common,
    ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
  };
}

/**
 * A manifest over the draft's records: one entry per `ready` record that has its derived
 * file (`cleanUrl` for a photo, `webUrl` for a clip), keyed by media id. A missing
 * description becomes an empty `alt`, a clip without a poster has no `poster` key, and a
 * record still processing or needing a trim has no entry at all.
 */
export function previewManifest(assets: readonly AssetView[]): Record<MediaId, ResolvedMedia> {
  const manifest: Record<MediaId, ResolvedMedia> = {};
  for (const asset of assets) {
    const entry = entryOf(asset);
    if (entry !== undefined) manifest[asset.id] = entry;
  }
  return manifest;
}
