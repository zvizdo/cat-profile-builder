import { clampByteRange } from "@/core/media/byte-range";
import { derivedName, mediaPrefix, objectName, publicUrl } from "@/core/media/paths";
import { revOf } from "@/core/media/rev";
import type { ByteRange, DerivedKind, DerivedStream, MediaStore, SignedUpload } from "@/core/ports";
import { createMemoryBuckets, decodeJson, encodeJson, type MemoryBuckets } from "./bucket";

// The in-memory MediaStore (contracts/ports.md → Fake), wired when `STORE=memory` and used by
// every unit and contract test. Keys are the real object names from `objectName`/
// `derivedName`, revs come from `revOf`, so the filesystem and GCS adapters
// share its contract suite. Originals arrive through `putOriginal`, the test's stand-in for
// a browser's signed upload.

/** The memory MediaStore plus what a test needs that the port keeps out on purpose. */
export interface MemoryMediaStore extends MediaStore {
  /** Puts the original bytes in place, as a browser's signed upload would. */
  putOriginal(pid: string, mid: string, bytes: Uint8Array): Promise<void>;
  /** Every `createSignedUpload` call, in order. */
  readonly signedUploads: Array<{ pid: string; mid: string; contentLength: number }>;
}

export interface MemoryMediaStoreOptions {
  /** What public URLs start with: a bucket's `https:` base, or `/media` as the container wires it. */
  publicBase: string;
  /** Share these with a memory ProfileStore so its `delete` takes the media too. */
  buckets?: MemoryBuckets;
  /** The bucket name `gsUri` puts after `gs://`. */
  gsBucket?: string;
}

const ASSET_FILE = "asset.json";

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

class MemoryMediaStoreImpl implements MemoryMediaStore {
  readonly signedUploads: MemoryMediaStore["signedUploads"] = [];
  private readonly buckets: MemoryBuckets;
  private readonly publicBase: string;
  private readonly gsBucket: string;

  constructor(options: MemoryMediaStoreOptions) {
    this.buckets = options.buckets ?? createMemoryBuckets();
    this.publicBase = options.publicBase;
    this.gsBucket = options.gsBucket ?? "memory-public";
  }

  private original(pid: string, mid: string): Uint8Array | null {
    return this.buckets.privateBucket.get(objectName(pid, mid, "original"))?.bytes ?? null;
  }

  async putOriginal(pid: string, mid: string, bytes: Uint8Array): Promise<void> {
    this.buckets.privateBucket.put(objectName(pid, mid, "original"), bytes);
  }

  async createSignedUpload(pid: string, mid: string, contentLength: number): Promise<SignedUpload> {
    this.signedUploads.push({ pid, mid, contentLength });
    return {
      url: `memory://upload/${objectName(pid, mid, "original")}`,
      method: "PUT",
      headers: {},
    };
  }

  async readOriginal(pid: string, mid: string): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = this.original(pid, mid);
    return bytes === null ? null : streamOf(new Uint8Array(bytes));
  }

  async readRange(pid: string, mid: string, range: ByteRange): Promise<Uint8Array | null> {
    const bytes = this.original(pid, mid);
    return bytes === null ? null : bytes.slice(range.start, range.end + 1);
  }

  async originalSize(pid: string, mid: string): Promise<number | null> {
    return this.original(pid, mid)?.byteLength ?? null;
  }

  async readAsset(pid: string, mid: string): Promise<unknown | null> {
    const object = this.buckets.privateBucket.get(objectName(pid, mid, "asset"));
    return object === null ? null : decodeJson(object.bytes);
  }

  async writeAsset(pid: string, mid: string, asset: unknown): Promise<void> {
    this.buckets.privateBucket.put(objectName(pid, mid, "asset"), encodeJson(asset));
  }

  async writeDerived(
    pid: string,
    mid: string,
    kind: DerivedKind,
    bytes: Uint8Array,
  ): Promise<string> {
    const rev = revOf(bytes);
    const name = derivedName(pid, mid, kind, rev);
    if (!this.buckets.publicBucket.has(name)) this.buckets.publicBucket.put(name, bytes);
    return rev;
  }

  async readDerived(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
  ): Promise<Uint8Array | null> {
    const object = this.buckets.publicBucket.get(derivedName(pid, mid, kind, rev));
    return object === null ? null : new Uint8Array(object.bytes);
  }

  async readDerivedRange(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
    range?: ByteRange,
  ): Promise<DerivedStream | null> {
    const object = this.buckets.publicBucket.get(derivedName(pid, mid, kind, rev));
    if (object === null) return null;
    const size = object.bytes.byteLength;
    const slice = clampByteRange(range, size);
    if (slice === null) return { stream: null, size };
    const { start, end } = slice;
    return { stream: streamOf(object.bytes.slice(start, end + 1)), size, start, end };
  }

  async deleteMedia(pid: string, mid: string): Promise<void> {
    this.deletePrefix(objectName(pid, mid, "asset").slice(0, -ASSET_FILE.length));
  }

  async deleteProfileMedia(pid: string): Promise<void> {
    this.deletePrefix(mediaPrefix(pid));
  }

  private deletePrefix(prefix: string): void {
    this.buckets.privateBucket.deletePrefix(prefix);
    this.buckets.publicBucket.deletePrefix(prefix);
  }

  async listMedia(pid: string): Promise<string[]> {
    const prefix = mediaPrefix(pid);
    const suffix = `/${ASSET_FILE}`;
    return this.buckets.privateBucket
      .list(prefix)
      .filter(({ name }) => name.endsWith(suffix))
      .map(({ name }) => name.slice(prefix.length, -suffix.length));
  }

  publicUrl(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return publicUrl(this.publicBase, derivedName(pid, mid, kind, rev));
  }

  gsUri(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return `gs://${this.gsBucket}/${derivedName(pid, mid, kind, rev)}`;
  }
}

export function createMemoryMediaStore(options: MemoryMediaStoreOptions): MemoryMediaStore {
  return new MemoryMediaStoreImpl(options);
}
