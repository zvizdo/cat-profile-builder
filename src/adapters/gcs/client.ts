import "server-only";
import type { Readable, Writable } from "node:stream";
import {
  type CreateReadStreamOptions,
  type CreateWriteStreamOptions,
  type DeleteFileOptions,
  type DeleteFilesOptions,
  type GetFilesOptions,
  type GetSignedUrlConfig,
  type SaveOptions,
  Storage,
} from "@google-cloud/storage";
import type { Config } from "@/adapters/config";
import { AppError, InternalError, UpstreamError } from "@/core/errors";

// The Google Cloud Storage client (ADR-015): one `Storage` over Application Default
// Credentials (the Cloud Run service account in production, `gcloud auth
// application-default login` on a laptop) and the two buckets the stores work on. The
// stores take the buckets through the narrow interfaces below — exactly the calls they
// make — so a unit test hands them an in-memory double and the real `Bucket` satisfies the
// same type (checked by `createGcsClient` returning one).

/** The one object of a bucket, as the stores use it. */
export interface ObjectFile {
  readonly name: string;
  /** The last metadata seen for the object; a listing fills it, so no download is needed. */
  readonly metadata: { metadata?: Record<string, string | boolean | number | null> };
  save(data: Uint8Array, options?: SaveOptions): Promise<void>;
  download(): Promise<[Buffer]>;
  exists(): Promise<[boolean]>;
  /** The object's stored metadata; `size` is the byte length (the client types it as string or number). */
  getMetadata(): Promise<[{ size?: string | number }, ...unknown[]]>;
  delete(options?: DeleteFileOptions): Promise<unknown>;
  copy(destination: string): Promise<unknown>;
  getSignedUrl(config: GetSignedUrlConfig): Promise<[string]>;
  createReadStream(options?: CreateReadStreamOptions): Readable;
  createWriteStream(options?: CreateWriteStreamOptions): Writable;
}

/** A bucket, as the stores use it: named, with files, a listing and a prefix delete. */
export interface ObjectBucket {
  readonly name: string;
  file(name: string): ObjectFile;
  getFiles(query: GetFilesOptions): Promise<[ObjectFile[], ...unknown[]]>;
  deleteFiles(query: DeleteFilesOptions): Promise<void>;
}

/** The private and public buckets of ADR-015. */
export interface GcsBuckets {
  privateBucket: ObjectBucket;
  publicBucket: ObjectBucket;
}

/** What the client needs from the configuration; `loadConfig` demands them when `STORE=gcs`. */
export type GcsConfig = Pick<
  Config,
  "GOOGLE_CLOUD_PROJECT" | "GCS_PRIVATE_BUCKET" | "GCS_PUBLIC_BUCKET"
>;

/** The sentence a person sees when a call to the storage service fails. */
export const STORAGE_FAILED = "The storage service didn't respond.";

/**
 * Whether a client failure carries HTTP status `status`. The client's `ApiError` (simple
 * uploads, downloads, deletes, streams) puts it in `code`; a raw gaxios error from the
 * resumable-upload path puts it in `status` with `code` undefined — both are read.
 */
export function hasStatus(error: unknown, status: number): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, status: httpStatus } = error as { code?: unknown; status?: unknown };
  return code === status || httpStatus === status;
}

/**
 * The app's error for a client failure: an `AppError` raised before the client was reached
 * (a bad id from a path builder) passes through unchanged; anything else becomes an
 * `UpstreamError` with the client's own error kept as `cause` for the log.
 */
function asAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new UpstreamError(STORAGE_FAILED, { cause: error });
}

/** Runs one client call and rethrows any failure through {@link asAppError}. */
export async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asAppError(error);
  }
}

/** Like {@link call}, but a failure with HTTP status `status` is `null` rather than an error. */
export async function callUnless<T>(
  status: number,
  operation: () => Promise<T>,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (hasStatus(error, status)) return null;
    throw asAppError(error);
  }
}

/** {@link callUnless} for `404`: a missing object is `null`, as the ports read "missing". */
export function callOrNull<T>(operation: () => Promise<T>): Promise<T | null> {
  return callUnless(404, operation);
}

/** Reads the whole of a client stream into one byte array; a failure rejects as the stream's error. */
export async function drain(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

/** Writes the whole of `data` to a client write stream and waits for it to finish; a failure
 * rejects as the stream's error, the same shape {@link drain} gives the read side. */
export function writeAll(stream: Writable, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    // `on`, not `once`: Node emits `'error'` at most once per stream anyway, but `.save()`
    // itself uses `.on('error', ...)` (`file.js`) — matching it removes the question of
    // whether the two ever behave differently (nit, F53 review round 1).
    stream.on("error", reject);
    stream.once("finish", resolve);
    stream.end(data);
  });
}

// F36/F53: `File#createReadStream()` (the real client, not the fake) hands back a stream
// that IS one of the links in Node's own `stream.pipeline` — called once, inside the
// client's own request wiring, to pipe the fetch response into it — so the `close`/`error`
// listeners that chain adds (on top of what `teeny-request`, `retry-request` and
// `google-auth-library`'s `duplexify` already added upstream) land on the exact stream this
// app is handed back. Measured by instrumenting every `EventEmitter`'s `on`/`once` against
// this app's pinned `@google-cloud/storage`/`teeny-request`/`retry-request` versions, run
// against the real dev bucket: a single, non-retried, uncontested read already carries ~8
// `close`/`error` listeners on that one returned stream before this app adds its own
// (`Readable.toWeb`, `drain`'s async iterator) — a real Cloud Run download, with TLS, an
// auth header and Cloud Run's own network path in the mix, was observed crossing Node's
// default-10 warning from this alone (F36's own report). `withHeadroom`'s `'response'` hook
// also reaches node-fetch's own response-body `PassThrough`, measured the same way at 5-8
// listeners on its own (F40). None of it is shared or long-lived: every call opens a
// brand-new stream that dies with the request that opened it.
//
// The write side is not the same shape, and F53's own review round 1 caught this: reading
// `File#createWriteStream()`'s source shows its returned `Writable` sits *upstream* of the
// internal pipeline (`pipeline(emitStream, ...transforms, fileWriteStream)`), not inside
// it — so the listeners that actually stack on a write are on emitters this app never sees:
// `ClientRequest` (close 6 / error 5), the response-body `PassThrough` (close 6 / error 6),
// `duplexify`'s `Duplexify` (close 5 / error 4), `HashStreamValidator` (close 6 / error 5) —
// measured the same instrumented way, against the same real bucket, on both `.save()` and
// `createWriteStream()` (they share the identical internal wiring, so the numbers are
// identical either way). The stream `withHeadroom` actually reaches on a write — the one
// `write`/`writeAsset` get back — peaked at 1 `close` / 2 `error` listeners of its own in
// that same run, nowhere near Node's default of 10. So on the write side `withHeadroom` is
// precautionary only: it raises the ceiling on the writable we are handed, but the listener
// stacking that could trip the warning lives on the SDK's internal request/response
// emitters, which this app has no handle on and this change does not cover. If a write-side
// warning is ever seen in production, its line will name `[ClientRequest]` or `[Duplexify]`,
// not `[Writable]` — that is not this fix.
//
// `write`/`writeAsset` still moved off `.save()` (F53) for a reason unrelated to listener
// headroom: `.save()` without a precondition sets `this.storage.retryOptions.autoRetry =
// false` on the whole *shared* `Storage` client and never restores it (confirmed by reading
// `file.js` and by a probe: `true` → `false` after one unconditioned `save()`, unchanged
// after `createWriteStream()` or a `save()` that does carry a precondition) — so the first
// unconditioned draft save of this process's life was silently turning off retries for
// every later call this client makes, reads included. `createWriteStream()` never touches
// that flag, so switching restores the client's own default retry behaviour for everything
// after the first save; a real, if incidental, availability improvement, worth keeping on
// its own even without the (inert) write-side headroom. `.download()`/`.save()` are
// convenience wrappers around `createReadStream()`/`createWriteStream()` that never hand
// the stream back to the caller, so both effects — real headroom on a read, `autoRetry` left
// alone on a write — require calling `createReadStream`/`createWriteStream` directly; this
// is what `read`/`write` in `gcs/profile-store.ts` and `readAsset`/`writeAsset`/
// `readDerived` in `gcs/media-store.ts` now do. `writeDerived` keeps `.save()`: it passes
// `ifGenerationMatch: 0`, the one precondition this app ever sets, so it never flips
// `autoRetry` off and is also the one write `.save()`'s own retry wrapper actually retries
// — switching it would lose that retry for no headroom benefit, since its write-side
// listeners are exactly as unreachable as any other write's.
const VENDORED_STREAM_MAX_LISTENERS = 30;

/** Anything with Node's own `setMaxListeners` — {@link withHeadroom} never assumes more than that. */
interface HasMaxListeners {
  setMaxListeners(n: number): unknown;
}

function hasMaxListeners(value: unknown): value is HasMaxListeners {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { setMaxListeners?: unknown }).setMaxListeners === "function"
  );
}

/**
 * `stream`, with headroom for the vendored client's own listeners (see above) on `stream`
 * itself, and again on the raw response stream it later re-emits as its own `'response'`
 * event, if the object that event carries turns out to have `setMaxListeners` at all (the
 * fake client's stand-in never emits one, so this is a no-op there). Registering the
 * listener now, before returning, is not a race: the client only starts the request once
 * something reads from (or writes to and ends) `stream`, which cannot happen before the
 * caller gets `stream` back from this function.
 *
 * On a read stream this genuinely raises the ceiling the vendored chain runs into (`stream`
 * *is* one of the links in it). On a write stream it is precautionary only: `stream` sits
 * outside the internal pipeline where that chain's own listeners actually stack, so this
 * cannot prevent a warning that comes from there — see the comment above for what does and
 * doesn't reach on each side, and why the write side is still worth calling this on anyway.
 */
export function withHeadroom<T extends Readable | Writable>(stream: T): T {
  stream.setMaxListeners(VENDORED_STREAM_MAX_LISTENERS);
  stream.on("response", (response: unknown) => {
    if (hasMaxListeners(response)) response.setMaxListeners(VENDORED_STREAM_MAX_LISTENERS);
  });
  return stream;
}

/**
 * The two buckets over a `Storage` client on Application Default Credentials. The bucket
 * names are optional in `Config` because other modes do not need them; a caller reaching
 * here without them is a wiring mistake, reported as such.
 */
export function createGcsClient(config: GcsConfig): GcsBuckets {
  const { GCS_PRIVATE_BUCKET, GCS_PUBLIC_BUCKET, GOOGLE_CLOUD_PROJECT } = config;
  if (GCS_PRIVATE_BUCKET === undefined || GCS_PUBLIC_BUCKET === undefined) {
    throw new InternalError("STORE=gcs needs GCS_PRIVATE_BUCKET and GCS_PUBLIC_BUCKET.");
  }
  const storage = new Storage({ projectId: GOOGLE_CLOUD_PROJECT });
  return {
    privateBucket: storage.bucket(GCS_PRIVATE_BUCKET),
    publicBucket: storage.bucket(GCS_PUBLIC_BUCKET),
  };
}
