// An in-memory object bucket with the three things the stores need from GCS: bytes, custom
// metadata and a prefix listing. Both memory stores share a pair of these, so deleting a
// cat through the profile store takes its media too — exactly as the prefix deletes do in
// the filesystem and GCS adapters (ADR-015).

export interface StoredObject {
  bytes: Uint8Array;
  metadata: Record<string, string>;
}

export class MemoryBucket {
  private readonly objects = new Map<string, StoredObject>();

  get(name: string): StoredObject | null {
    return this.objects.get(name) ?? null;
  }

  has(name: string): boolean {
    return this.objects.has(name);
  }

  /** Stores a private copy of `bytes`, so a caller mutating its buffer later changes nothing. */
  put(name: string, bytes: Uint8Array, metadata: Record<string, string> = {}): void {
    this.objects.set(name, { bytes: new Uint8Array(bytes), metadata: { ...metadata } });
  }

  delete(name: string): void {
    this.objects.delete(name);
  }

  deletePrefix(prefix: string): void {
    for (const name of this.objects.keys()) {
      if (name.startsWith(prefix)) this.objects.delete(name);
    }
  }

  /** Moves an object verbatim — bytes and metadata — and returns whether it existed. */
  move(from: string, to: string): boolean {
    const object = this.objects.get(from);
    if (object === undefined) return false;
    this.objects.delete(from);
    this.objects.set(to, object);
    return true;
  }

  /** Names and metadata under `prefix`, sorted by name like a GCS listing; no bytes. */
  list(prefix: string): Array<{ name: string; metadata: Record<string, string> }> {
    return [...this.objects.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, object]) => ({ name, metadata: { ...object.metadata } }));
  }
}

/** The private and public buckets of ADR-015, empty. */
export interface MemoryBuckets {
  privateBucket: MemoryBucket;
  publicBucket: MemoryBucket;
}

export function createMemoryBuckets(): MemoryBuckets {
  return { privateBucket: new MemoryBucket(), publicBucket: new MemoryBucket() };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** JSON as the stores write it: UTF-8 bytes of `JSON.stringify`. */
export function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

/** Reads bytes back as the `unknown` a store hands its caller. */
export function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes));
}
