// The ProfileStore port (contracts/ports.md, ADR-015). Type-only: the GCS and filesystem
// adapters implement it under `src/adapters/`, the in-memory fake under `tests/fakes/`, and
// the shared contract suite in `tests/contract/stores.suite.ts` pins every guarantee below.

/**
 * Where a cat is in its life: `draft` (only `draft.json`), `live` (`published.json`
 * exists) or `archived` (`archived.json` exists). Never both of the last two (ADR-015).
 */
export type ProfileState = "draft" | "live" | "archived";

/**
 * The identity of a thumbnail photo: its media id and the `clean` revision to show. Never a
 * URL (F30) — a stamped or repaired pair is resolved to a URL only at the point something
 * needs one, through `MediaStore.publicUrl`, so a URL scheme change never touches storage.
 */
export interface ThumbnailRef {
  mid: string;
  rev: string;
}

/**
 * What a draft save stamps as object metadata so the list view can render without reading
 * a document (ADR-015 → Draft saves): the cat's name, its display line (`displayLine`, so
 * two tabbies can be told apart on a card), the thumbnail photo's id and revision (or
 * `null` when the draft has no photo yet) and the ISO instant of the save.
 */
export interface DraftMeta {
  name: string;
  line: string;
  thumbnail: ThumbnailRef | null;
  updatedAt: string;
}

/**
 * One row of the list view, built from metadata and file presence only. `thumbnail` is the
 * raw `{mid, rev}` pair a draft save stamped, or the one repaired from an old `thumbnail-url`
 * stamp (F30) — never a URL. `ProfileStore` stays ignorant of URLs on purpose: it is the
 * caller (`src/app/actions/_lib/profiles.ts`, which already holds the `MediaStore`) that
 * turns the pair into the URL a `ProfileSummary` carries, through `MediaStore.publicUrl`.
 * That keeps a URL scheme change (ADR-015 as amended by F23, and any future one) out of
 * every store adapter — they only ever read and write ids.
 */
export interface ProfileRow {
  pid: string;
  state: ProfileState;
  name: string;
  line: string;
  thumbnail: ThumbnailRef | null;
  updatedAt: string;
}

/** A published document with the id it belongs to. */
export interface PublishedRow {
  pid: string;
  doc: unknown;
}

/**
 * Durable storage for the three documents of a cat — `draft.json`, `published.json` and
 * `archived.json` under `profiles/{pid}/` in the private bucket.
 *
 * Guarantees every implementation keeps (and the contract suite checks):
 * - Documents go in and come out as `unknown`: the store serialises what it is given as
 *   JSON and hands back exactly what it parsed, byte-faithfully. Validation is the caller's
 *   job (`loadProfile`), never the store's.
 * - `published.json` and `archived.json` never exist together. `archive` and `restore` move
 *   the bytes verbatim; a fresh `writePublished` replaces any archive.
 * - `list()` is one listing call over `profiles/` and reads no document: `name`, `line`,
 *   `thumbnail` and `updatedAt` come from the draft's metadata, `state` from which files
 *   exist. `thumbnail` is resolved at list time, never a value stamped in the past (F30):
 *   an old `thumbnail-url` stamp is repaired into a `{mid, rev}` pair by parsing its path,
 *   so a URL scheme change never leaves a stale thumbnail behind.
 * - A profile exists exactly when its `draft.json` exists.
 * - Ids are validated before they become paths (`documentName`), so a bad id throws
 *   `ProfileInvalidError` rather than reaching storage.
 */
export interface ProfileStore {
  /** The draft document, or `null` when the profile does not exist. */
  readDraft(pid: string): Promise<unknown | null>;
  /** Overwrites the draft (last write wins, ADR-015) and stamps `meta` on the object. */
  writeDraft(pid: string, doc: unknown, meta: DraftMeta): Promise<void>;
  /** The published document, or `null` when the profile is not live. */
  readPublished(pid: string): Promise<unknown | null>;
  /** Makes the profile live; removes `archived.json` if it exists. */
  writePublished(pid: string, doc: unknown): Promise<void>;
  /** Takes the profile off the public site (draft stays). No-op when not live. */
  deletePublished(pid: string): Promise<void>;
  /** Moves `published.json` to `archived.json`. Throws `RefusedError` unless live. */
  archive(pid: string): Promise<void>;
  /** Moves `archived.json` back to `published.json` verbatim. Throws `RefusedError` unless archived. */
  restore(pid: string): Promise<void>;
  /** The archived document, or `null` when the profile is not archived. */
  readArchived(pid: string): Promise<unknown | null>;
  /** Takes an archived profile back to draft by removing `archived.json`. No-op when not archived. */
  deleteArchived(pid: string): Promise<void>;
  /** Hard-deletes everything under `profiles/{pid}/` in both buckets — documents and media. */
  delete(pid: string): Promise<void>;
  /** Every profile as a list row, from metadata alone. Order is by `pid`. */
  list(): Promise<ProfileRow[]>;
  /** Every published document, for the public index and the carousel. Order is by `pid`. */
  listPublished(): Promise<PublishedRow[]>;
  /** Whether `draft.json` exists for `pid`. */
  exists(pid: string): Promise<boolean>;
}
