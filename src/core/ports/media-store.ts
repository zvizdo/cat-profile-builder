// The MediaStore port (contracts/ports.md, ADR-015). Type-only; see ProfileStore for where
// the implementations, the fake and the contract suite live.

/** The three derived files a media id can have in the public bucket. */
export type DerivedKind = "clean" | "web" | "poster";

/** An inclusive byte range, as an HTTP `Range` header names it. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * A derived revision opened for streaming (F23): `stream` carries bytes `start`–`end`
 * (inclusive) of the `size`-byte file. When the range asked for starts past the last byte
 * there is nothing to stream, so `stream` is `null` and only `size` comes back — what an HTTP
 * `416` needs to name.
 */
export type DerivedStream =
  | { stream: ReadableStream<Uint8Array>; size: number; start: number; end: number }
  | { stream: null; size: number };

/**
 * Where and how the browser sends the original bytes (a signed URL, ADR-005). `headers`
 * are the ones the signature covers and must be sent byte-exact — GCS refuses the request
 * otherwise; a store that signs nothing returns `{}`.
 */
export interface SignedUpload {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
}

/**
 * Storage for a cat's media: the record (`asset.json`) and the original bytes in the
 * private bucket, the derived files (`clean`, `web`, `poster`) in the public bucket. The
 * "public" bucket has no public reader (F23): this app is the only thing that reads it,
 * and serves every derived file itself at `/media/<name>`.
 *
 * Guarantees every implementation keeps:
 * - Originals are written only through a signed upload, never by the app, and read only
 *   as a stream or a byte range (ADR-006: the trim editor's Route Handler). They are never
 *   served and never sent to a model.
 * - A derived file is named by the content rev `revOf(bytes)` and is immutable: the same
 *   bytes land on the same name, different bytes never overwrite an old rev (ADR-015).
 * - `publicUrl` and `gsUri` are built from ids and the rev through `derivedName`, never from
 *   a stored path, so a record cannot point outside its own folder.
 * - Deletes are prefix deletes: `deleteMedia` takes one media folder in both buckets,
 *   `deleteProfileMedia` every media folder of the cat.
 * - Records go in and out as `unknown`; validation (`loadAsset`) is the caller's job.
 */
export interface MediaStore {
  /** A URL the browser can send `contentLength` bytes to as the original of `mid`. */
  createSignedUpload(pid: string, mid: string, contentLength: number): Promise<SignedUpload>;
  /** The original as a stream, or `null` when no upload has landed. */
  readOriginal(pid: string, mid: string): Promise<ReadableStream<Uint8Array> | null>;
  /** The inclusive byte slice `range` of the original (clamped to its end), or `null`. */
  readRange(pid: string, mid: string, range: ByteRange): Promise<Uint8Array | null>;
  /** The byte length of the original without reading it, or `null` when none has landed. */
  originalSize(pid: string, mid: string): Promise<number | null>;
  /** The media record, or `null` when there is none. */
  readAsset(pid: string, mid: string): Promise<unknown | null>;
  /** Overwrites the media record. */
  writeAsset(pid: string, mid: string, asset: unknown): Promise<void>;
  /** Stores a derived file under its content rev and returns that rev. */
  writeDerived(pid: string, mid: string, kind: DerivedKind, bytes: Uint8Array): Promise<string>;
  /** The bytes of one derived revision, or `null` when that rev was never written. */
  readDerived(pid: string, mid: string, kind: DerivedKind, rev: string): Promise<Uint8Array | null>;
  /**
   * One derived revision opened for streaming — the whole file, or the inclusive slice
   * `range` with an end past the last byte clamped to it (see {@link DerivedStream} for a
   * start past it). `null` when that rev was never written. Nothing is buffered: the
   * `/media` route hands the stream straight to the response, so a clip of any size costs
   * one chunk of memory at a time.
   */
  readDerivedRange(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
    range?: ByteRange,
  ): Promise<DerivedStream | null>;
  /** Removes the record, the original and every derived revision of one media id. */
  deleteMedia(pid: string, mid: string): Promise<void>;
  /** Removes every media of the cat in both buckets; the documents stay. */
  deleteProfileMedia(pid: string): Promise<void>;
  /** The media ids that have a record, in `mid` order. */
  listMedia(pid: string): Promise<string[]>;
  /**
   * The public URL of a derived revision: the root-relative `/media/…` path this app serves
   * under every store (F23) — stable, same-origin, and cacheable forever.
   */
  publicUrl(pid: string, mid: string, kind: DerivedKind, rev: string): string;
  /** The `gs://bucket/name` of a derived revision, for a model file part (ADR-001). */
  gsUri(pid: string, mid: string, kind: DerivedKind, rev: string): string;
}
