import { parseOrThrow, RefusedError } from "../errors";
import {
  referencedMediaIds,
  ResolvedMediaSchema,
  type MediaId,
  type ProfileDocument,
  type ResolvedMedia,
} from "../profile/schema";
import type { MediaStore } from "../ports/media-store";
import { type MediaAsset } from "./schema";
import { LIMITS } from "./validation";

/** The one thing the resolver needs from a media store: the public URL of a derived rev. */
export type PublicUrls = Pick<MediaStore, "publicUrl">;

/**
 * Builds the publish manifest (ADR-015): one {@link ResolvedMedia} entry for exactly the
 * media ids `referencedMediaIds(doc)` returns, keyed by id, with nothing for any other
 * asset. Every `src` and `poster` is the store's public URL of the derived file at its
 * current rev, so a published page never reads a media record and never changes until the
 * next publish. Refuses — throws a {@link RefusedError} with a plain sentence naming the
 * file — when a referenced id has no asset, when an asset is not `ready`, has no
 * description, or lacks the derived file the page would load (`clean` for a photo, `web`
 * for a video). A video without a poster is still published without one (ADR-006). Every
 * entry is validated against `ResolvedMediaSchema`, so a store whose URLs are neither
 * `https:` nor `/media/…` fails loudly as a `ProfileInvalidError` rather than reaching a page.
 */
export function resolveManifest(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
  urls: PublicUrls,
): Record<MediaId, ResolvedMedia> {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const manifest: Record<MediaId, ResolvedMedia> = {};
  for (const id of referencedMediaIds(doc)) {
    const asset = byId.get(id);
    if (asset === undefined) {
      throw new RefusedError("A photo or clip is missing from the library.");
    }
    manifest[id] = parseOrThrow(ResolvedMediaSchema, resolveAsset(doc.id, asset, urls));
  }
  return manifest;
}

/** The unvalidated entry for one ready, described asset; refuses anything less. */
function resolveAsset(pid: string, asset: MediaAsset, urls: PublicUrls): unknown {
  if (asset.status === "processing") {
    throw new RefusedError(`${asset.fileName} is still processing.`);
  }
  if (asset.status === "needs-trim") {
    throw new RefusedError(`Trim ${asset.fileName} to ${LIMITS.maxClipSeconds} seconds or less.`);
  }
  if (asset.alt === null) {
    throw new RefusedError(`Write a description for ${asset.fileName}.`);
  }
  const common = {
    kind: asset.kind,
    alt: asset.alt.text,
    focal: asset.focal,
    width: asset.width,
    height: asset.height,
  };
  const url = (kind: "clean" | "web" | "poster", rev: string): string =>
    urls.publicUrl(pid, asset.id, kind, rev);
  if (asset.kind === "photo") {
    if (asset.revisions.clean === undefined) throw notProcessed(asset);
    return { ...common, src: url("clean", asset.revisions.clean) };
  }
  if (asset.revisions.web === undefined) throw notProcessed(asset);
  return {
    ...common,
    src: url("web", asset.revisions.web),
    ...(asset.revisions.poster === undefined
      ? {}
      : { poster: url("poster", asset.revisions.poster) }),
    ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
  };
}

function notProcessed(asset: MediaAsset): RefusedError {
  return new RefusedError(`${asset.fileName} hasn't been processed yet.`);
}
