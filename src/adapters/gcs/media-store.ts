import "server-only";
import { Readable } from "node:stream";
import { lazyWeb } from "@/adapters/lazy-stream";
import { clampByteRange } from "@/core/media/byte-range";
import { derivedName, mediaPrefix, objectName, publicUrl } from "@/core/media/paths";
import { MEDIA_ROUTE } from "@/core/media/public-path";
import { revOf } from "@/core/media/rev";
import type { ByteRange, DerivedKind, DerivedStream, MediaStore, SignedUpload } from "@/core/ports";
import {
  type GcsBuckets,
  type ObjectFile,
  call,
  callOrNull,
  callUnless,
  drain,
  withHeadroom,
  writeAll,
} from "./client";

// The Google Cloud Storage MediaStore (ADR-005, ADR-015), wired when `STORE=gcs`. Records
// and originals live in the private bucket, derived files in the public one, where every
// object is written with `Cache-Control: public, max-age=31536000, immutable` and never
// overwritten (a generation-0 precondition makes a second write of the same rev a no-op).
// The public bucket keeps its name and layout but carries no public grant (F23: the
// shelter's organisation forbids `allUsers` on a bucket), so this app is its only reader:
// `publicUrl` is the same root-relative `/media/<name>` the filesystem store answers, and
// the `/media` route streams the object through `readDerivedRange`. This store never
// touches an ACL. The browser gets its original in through a V4 signed resumable upload
// scoped to one object and one byte size, valid for 15 minutes.

/** How long a signed upload URL stays valid (ADR-005). */
export const SIGNED_UPLOAD_MINUTES = 15;

/** What every public object is served with (ADR-015): cached forever, never revalidated. */
export const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

const CONTENT_TYPE: Record<DerivedKind, string> = {
  clean: "image/jpeg",
  web: "video/mp4",
  poster: "image/jpeg",
};

const JSON_TYPE = "application/json";
const ASSET_FILE = "asset.json";
const ASSET_SUFFIX = `/${ASSET_FILE}`;

/** `412 Precondition Failed`: the object exists, which for an immutable rev is fine. */
const ALREADY_THERE = 412;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// F36/F40/F53: every read stream this store gets back from the client — from
// `createReadStream()`, including via `readAsset`/`readDerived` since F53 — gets
// `withHeadroom`'s genuine headroom on Node's own listener-count warning; `writeAsset`'s
// `createWriteStream()` gets the same call, but there it is precautionary only, not real
// protection — `withHeadroom`'s own comment in `./client` has the full account (F36's
// original measurement, F40's "also the re-emitted `'response'` stream" fix, F53's
// extension to `readAsset`/`writeAsset`/`readDerived` in place of `.download()`/`.save()`
// — which never handed the stream back, so `withHeadroom` never reached it either way — and
// exactly why the write side differs). None of it is shared or long-lived: every call opens
// a brand-new stream that dies with the request that opened it (proved below: 15 concurrent
// reads over the fake bucket, some drained and some cancelled mid-flight, raise no warning
// and always destroy the Node stream they opened).

class GcsMediaStore implements MediaStore {
  constructor(private readonly buckets: GcsBuckets) {}

  private original(pid: string, mid: string): ObjectFile {
    return this.buckets.privateBucket.file(objectName(pid, mid, "original"));
  }

  private asset(pid: string, mid: string): ObjectFile {
    return this.buckets.privateBucket.file(objectName(pid, mid, "asset"));
  }

  private derived(pid: string, mid: string, kind: DerivedKind, rev: string): ObjectFile {
    return this.buckets.publicBucket.file(derivedName(pid, mid, kind, rev));
  }

  async createSignedUpload(pid: string, mid: string, contentLength: number): Promise<SignedUpload> {
    // The signature covers these headers, and the client adds `x-goog-resumable: start` to
    // them for a resumable action; the browser must send exactly this set.
    // `x-goog-if-generation-match: 0` (T040 security review, L3) makes the resumable session
    // itself refuse to start once an object with this name already exists, so a second
    // upload to an already-finalized original is a `412` rather than a silent overwrite.
    const headers = {
      "x-goog-resumable": "start",
      "x-goog-content-length-range": `0,${contentLength}`,
      "x-goog-if-generation-match": "0",
    };
    const [url] = await call(() =>
      this.original(pid, mid).getSignedUrl({
        version: "v4",
        action: "resumable",
        expires: Date.now() + SIGNED_UPLOAD_MINUTES * 60 * 1000,
        extensionHeaders: {
          "x-goog-content-length-range": headers["x-goog-content-length-range"],
          "x-goog-if-generation-match": headers["x-goog-if-generation-match"],
        },
      }),
    );
    return { url, method: "POST", headers };
  }

  async readOriginal(pid: string, mid: string): Promise<ReadableStream<Uint8Array> | null> {
    const file = this.original(pid, mid);
    const [exists] = await call(() => file.exists());
    if (!exists) return null;
    return Readable.toWeb(withHeadroom(file.createReadStream())) as ReadableStream<Uint8Array>;
  }

  readRange(pid: string, mid: string, range: ByteRange): Promise<Uint8Array | null> {
    return callOrNull(() => drain(withHeadroom(this.original(pid, mid).createReadStream(range))));
  }

  originalSize(pid: string, mid: string): Promise<number | null> {
    return callOrNull(async () => {
      const [metadata] = await this.original(pid, mid).getMetadata();
      return Number(metadata.size);
    });
  }

  // F53: `readAsset`/`writeAsset` used to go through `.download()`/`.save()`, which never
  // hand the stream back to this store — so `withHeadroom` (see the file-top comment) never
  // reached them, unlike the three read paths above. These are the exact calls the builder
  // page and the helper route make once per media item on every load (`readAssets`), which
  // is what correlated the warning with those routes rather than the media-stream ones F36
  // already covered. Calling `createReadStream`/`createWriteStream` directly, the same way
  // `readOriginal`/`readRange` already do, gives `readAsset` real headroom; `writeAsset`'s
  // is precautionary only (see `VENDORED_STREAM_MAX_LISTENERS` in `./client` — the write
  // side's own listeners stack on emitters this store never touches). `writeAsset` moving
  // off `.save()` loses no retry (an asset write carries no precondition, so `.save()` never
  // retried it anyway — `shouldRetryBasedOnPreconditionAndIdempotencyStrat` disables retries
  // whenever `preconditionOpts` is absent) and gains one: `.save()` without a precondition
  // was silently flipping the shared client's `autoRetry` off for every later call, which
  // `createWriteStream()` never does (F53 review round 1).
  readAsset(pid: string, mid: string): Promise<unknown | null> {
    return callOrNull(async () => {
      const bytes = await drain(withHeadroom(this.asset(pid, mid).createReadStream()));
      return JSON.parse(decoder.decode(bytes)) as unknown;
    });
  }

  writeAsset(pid: string, mid: string, asset: unknown): Promise<void> {
    return call(() =>
      writeAll(
        withHeadroom(
          this.asset(pid, mid).createWriteStream({ contentType: JSON_TYPE, resumable: false }),
        ),
        encoder.encode(JSON.stringify(asset)),
      ),
    );
  }

  async writeDerived(
    pid: string,
    mid: string,
    kind: DerivedKind,
    bytes: Uint8Array,
  ): Promise<string> {
    const rev = revOf(bytes);
    // A simple (non-resumable) upload: derived files are small, and on this path a failed
    // precondition comes back as the client's own `ApiError` rather than a raw gaxios error.
    await callUnless(ALREADY_THERE, () =>
      this.derived(pid, mid, kind, rev).save(bytes, {
        contentType: CONTENT_TYPE[kind],
        metadata: { cacheControl: PUBLIC_CACHE_CONTROL },
        preconditionOpts: { ifGenerationMatch: 0 },
        resumable: false,
      }),
    );
    return rev;
  }

  // F53: see `readAsset`'s comment above — `.download()` never handed this store the stream
  // to raise its listener ceiling on, and `readDerived` is the one call `view_photos`
  // (`/api/helper/chat`) makes per photo it shows the model.
  readDerived(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
  ): Promise<Uint8Array | null> {
    return callOrNull(() =>
      drain(withHeadroom(this.derived(pid, mid, kind, rev).createReadStream())),
    );
  }

  async readDerivedRange(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
    range?: ByteRange,
  ): Promise<DerivedStream | null> {
    const file = this.derived(pid, mid, kind, rev);
    // One metadata read gives the size and stands in for an existence check. The object
    // read is opened on the stream's first pull (`lazyWeb`), so a start past the end, a
    // `HEAD`, a `304` or a size-only read never sends a second request at all.
    const size = await callOrNull(async () => Number((await file.getMetadata())[0].size));
    if (size === null) return null;
    const slice = clampByteRange(range, size);
    if (slice === null) return { stream: null, size };
    const { start, end } = slice;
    return {
      stream: lazyWeb(() => withHeadroom(file.createReadStream({ start, end }))),
      size,
      start,
      end,
    };
  }

  private async deletePrefix(prefix: string): Promise<void> {
    await call(() => this.buckets.privateBucket.deleteFiles({ prefix }));
    await call(() => this.buckets.publicBucket.deleteFiles({ prefix }));
  }

  deleteMedia(pid: string, mid: string): Promise<void> {
    return this.deletePrefix(objectName(pid, mid, "asset").slice(0, -ASSET_FILE.length));
  }

  deleteProfileMedia(pid: string): Promise<void> {
    return this.deletePrefix(mediaPrefix(pid));
  }

  async listMedia(pid: string): Promise<string[]> {
    const prefix = mediaPrefix(pid);
    const [files] = await call(() =>
      this.buckets.privateBucket.getFiles({ prefix, autoPaginate: true }),
    );
    return files
      .map((file) => file.name)
      .filter((name) => name.endsWith(ASSET_SUFFIX))
      .map((name) => name.slice(prefix.length, -ASSET_SUFFIX.length))
      .sort();
  }

  publicUrl(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return publicUrl(MEDIA_ROUTE, derivedName(pid, mid, kind, rev));
  }

  gsUri(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return `gs://${this.buckets.publicBucket.name}/${derivedName(pid, mid, kind, rev)}`;
  }
}

export function createGcsMediaStore(buckets: GcsBuckets): MediaStore {
  return new GcsMediaStore(buckets);
}
