// The grammar of a root-relative public media URL: what this app serves itself under every
// store (ADR-015 as amended by F23 — no bucket carries a public grant). `/media/` plus a
// derived name — `profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` — and nothing else, so a
// URL a published page carries can only ever name one derived revision of one cat's media.
// The schema, every store's `publicUrl` and the `/media` route all read the rule from here.

/** The route prefix every store's public URLs start with. */
export const MEDIA_ROUTE = "/media";

const ID = "[a-z2-7]{8}";
const REV = "[0-9a-f]{10}";

/**
 * The character-class grammar of a media id and a derived-file revision, as bare regex
 * fragments. The single source both `MediaIdSchema` (`core/profile/schema.ts`) and
 * `RevSchema` (`core/media/schema.ts`) build their anchored pattern from, and what
 * composes into another path pattern without duplicating the literal — F30's
 * legacy-thumbnail repair in `src/adapters/listing.ts` (review F30 round 1, finding 4:
 * one pattern, not two that happen to agree).
 */
export const MEDIA_ID_PATTERN = ID;
export const REV_PATTERN = REV;

/** The whole URL, anchored: `/media/profiles/{pid}/media/{mid}/{clean|poster}.{rev}.jpg` or `web.{rev}.mp4`. */
export const PUBLIC_MEDIA_PATH = new RegExp(
  `^${MEDIA_ROUTE}/profiles/(${ID})/media/(${ID})/(?:(clean|poster)\\.(${REV})\\.jpg|(web)\\.(${REV})\\.mp4)$`,
);

/** The four ids a public media URL names. */
export interface PublicMediaPath {
  pid: string;
  mid: string;
  kind: "clean" | "poster" | "web";
  rev: string;
}

/**
 * The ids of a URL in {@link PUBLIC_MEDIA_PATH}, or `null` for any other string. The
 * extension is tied to the kind by the pattern, so `web.{rev}.jpg` is not a path.
 */
export function parsePublicMediaPath(url: string): PublicMediaPath | null {
  const match = PUBLIC_MEDIA_PATH.exec(url);
  if (match === null) return null;
  const [, pid = "", mid = "", image, imageRev = "", , videoRev = ""] = match;
  if (image === "clean" || image === "poster") return { pid, mid, kind: image, rev: imageRev };
  return { pid, mid, kind: "web", rev: videoRev };
}
