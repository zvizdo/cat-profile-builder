import { InternalError, parseOrThrow } from "@/core/errors";
import { MEDIA_ID_PATTERN, REV_PATTERN } from "@/core/media/public-path";
import { PROFILES_PREFIX, documentName } from "@/core/media/paths";
import { RevSchema } from "@/core/media/schema";
import type { DraftMeta, ProfileRow, ProfileState, ThumbnailRef } from "@/core/ports";
import { MediaIdSchema } from "@/core/profile/schema";

// What every store adapter shares about the list view (ADR-015 → Draft saves): the custom
// metadata keys a draft save stamps, and how one listing of `profiles/` — names and
// metadata, no document bytes — turns into rows. The memory, filesystem and GCS stores all
// feed their own listing through `rowsOf`, so the keys and the state rule live here once.
//
// F30: a draft never stamps a URL. `thumbnail-media` holds `"{mid}/{rev}"`, resolved to a
// URL only by the caller of `list()` (`src/app/actions/_lib/profiles.ts`), through
// `MediaStore.publicUrl` — see the `ProfileRow` comment for why. A draft saved before this
// fix (and before F23) still carries the old `thumbnail-url` key, an absolute URL stamped
// at save time; it is never written again, only read and repaired by parsing its path's
// tail into the same pair, regardless of which host it once pointed at.

/** The three documents a cat can have, by the name they are stored under. */
export type DocumentState = "draft" | "published" | "archived";

/** Metadata keys ADR-015 fixes for a draft save, plus `line` for the card's second line. */
export const META_NAME = "name";
export const META_LINE = "line";
export const META_THUMBNAIL_MEDIA = "thumbnail-media";
export const META_UPDATED_AT = "updated-at";

/** The key a draft saved before F30 (and before F23) stamped its thumbnail under: a URL. */
export const LEGACY_META_THUMBNAIL_URL = "thumbnail-url";

/** One entry of a listing: an object name and its custom metadata. */
export interface ListedObject {
  name: string;
  metadata: Record<string, string>;
}

/** The custom metadata a draft save stamps; `thumbnail-media` is left out when there is none. */
export function metadataOf(meta: DraftMeta): Record<string, string> {
  const metadata: Record<string, string> = {
    [META_NAME]: meta.name,
    [META_LINE]: meta.line,
    [META_UPDATED_AT]: meta.updatedAt,
  };
  if (meta.thumbnail !== null) {
    const mid = parseOrThrow(MediaIdSchema, meta.thumbnail.mid);
    const rev = parseOrThrow(RevSchema, meta.thumbnail.rev);
    metadata[META_THUMBNAIL_MEDIA] = `${mid}/${rev}`;
  }
  return metadata;
}

/** `{mid}/{rev}` from `metadataOf`, or `null` for anything that is not exactly that shape. */
function parseThumbnailMedia(value: string): ThumbnailRef | null {
  const [mid, rev, extra] = value.split("/");
  if (mid === undefined || rev === undefined || extra !== undefined) return null;
  if (!MediaIdSchema.safeParse(mid).success || !RevSchema.safeParse(rev).success) return null;
  return { mid, rev };
}

/**
 * The trailing `profiles/{pid}/media/{mid}/clean.{rev}.jpg` of a `thumbnail-url` stamped
 * before F30 — an absolute bucket URL before F23, a root-relative `/media/…` path after it.
 * Anchored only at the end, so the host and everything before `profiles/` are ignored; a
 * thumbnail is always a photo, so only the `clean` kind ever appears here. The pid is
 * captured too (review F30 round 1, finding 1): a repair must never hand back media that
 * names a different cat than the draft it was read from.
 */
const LEGACY_THUMBNAIL_TAIL = new RegExp(
  `${PROFILES_PREFIX}(${MEDIA_ID_PATTERN})/media/(${MEDIA_ID_PATTERN})/clean\\.(${REV_PATTERN})\\.jpg$`,
);

/**
 * `url`'s `{mid, rev}` by {@link LEGACY_THUMBNAIL_TAIL}, or `null` when it does not parse —
 * including when it parses to a pid other than `pid`, the draft this stamp was read from.
 * A legacy stamp naming another cat's media is never repaired into a thumbnail: that would
 * silently point one cat's card at another cat's photo instead of at nothing.
 */
export function repairLegacyThumbnail(url: string, pid: string): ThumbnailRef | null {
  const match = LEGACY_THUMBNAIL_TAIL.exec(url);
  if (match === null) return null;
  const [, urlPid = "", mid = "", rev = ""] = match;
  if (urlPid !== pid) return null;
  return { mid, rev };
}

/**
 * The row's thumbnail from its metadata: the `thumbnail-media` pair when the draft was
 * saved by F30 or later; otherwise a legacy `thumbnail-url` repaired by
 * {@link repairLegacyThumbnail} against this same `pid`; otherwise `null` — including when
 * either key's value fails to parse, so a corrupt or unrecognised stamp never breaks the
 * whole listing.
 */
function thumbnailOf(metadata: Record<string, string>, pid: string): ThumbnailRef | null {
  const paired = metadata[META_THUMBNAIL_MEDIA];
  if (paired !== undefined) return parseThumbnailMedia(paired);
  const legacy = metadata[LEGACY_META_THUMBNAIL_URL];
  if (legacy !== undefined) return repairLegacyThumbnail(legacy, pid);
  return null;
}

/** The pid of an object named `profiles/{pid}/{state}.json`, or `null` for any other name. */
export function pidOf(name: string, state: DocumentState): string | null {
  const suffix = `/${state}.json`;
  if (!name.startsWith(PROFILES_PREFIX) || !name.endsWith(suffix)) return null;
  return name.slice(PROFILES_PREFIX.length, -suffix.length);
}

function stateOf(names: ReadonlySet<string>, pid: string): ProfileState {
  if (names.has(documentName(pid, "published"))) return "live";
  if (names.has(documentName(pid, "archived"))) return "archived";
  return "draft";
}

function required(metadata: Record<string, string>, key: string, name: string): string {
  const value = metadata[key];
  if (value === undefined) {
    throw new InternalError(`Draft ${name} has no "${key}" metadata.`);
  }
  return value;
}

/**
 * The list rows a listing of `profiles/` yields: one per `draft.json`, its `state` from
 * which sibling documents the listing also names, its text from the draft's metadata. The
 * order is the listing's order, which for every store is by name — and so by pid.
 */
export function rowsOf(listing: readonly ListedObject[]): ProfileRow[] {
  const names = new Set(listing.map((entry) => entry.name));
  const rows: ProfileRow[] = [];
  for (const { name, metadata } of listing) {
    const pid = pidOf(name, "draft");
    if (pid === null) continue;
    rows.push({
      pid,
      state: stateOf(names, pid),
      name: required(metadata, META_NAME, name),
      line: metadata[META_LINE] ?? "",
      thumbnail: thumbnailOf(metadata, pid),
      updatedAt: required(metadata, META_UPDATED_AT, name),
    });
  }
  return rows;
}
