import { PassThrough, Writable } from "node:stream";
import type { DeleteFilesOptions, GetFilesOptions } from "@google-cloud/storage";
import type { ObjectBucket, ObjectFile } from "@/adapters/gcs/client";

// A stand-in for `@google-cloud/storage`'s Bucket with just what the GCS stores call, over
// an in-memory map. It records every call so a test can assert the exact options that go
// to Google — metadata keys, cache-control, signed-URL shape — and that nothing else (an
// ACL, `makePublic`) is ever asked for. `fail` makes the next call throw a given error.

export interface Stored {
  bytes: Uint8Array;
  options: Record<string, unknown>;
}

export interface RecordedCall {
  method: string;
  name?: string;
  args: unknown[];
}

/** An error shaped like the client's `ApiError`: a `code` with the HTTP status. */
export function apiError(code: number): Error & { code: number } {
  return Object.assign(new Error(`api ${code}`), { code });
}

/** An error shaped like a raw gaxios failure from the resumable path: `status`, no `code`. */
export function gaxiosError(status: number): Error & { status: number } {
  return Object.assign(new Error(`gaxios ${status}`), { status });
}

export class FakeBucket implements ObjectBucket {
  readonly objects = new Map<string, Stored>();
  readonly calls: RecordedCall[] = [];
  /** When set, the next client call throws it (and clears it). */
  nextError: Error | null = null;
  /** The error shape a failed generation precondition on `save` throws. */
  preconditionError: (status: number) => Error = apiError;

  constructor(readonly name: string) {}

  private record(method: string, args: unknown[], name?: string): void {
    this.calls.push({ method, args, ...(name === undefined ? {} : { name }) });
    if (this.nextError !== null) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
  }

  /** The metadata a listing would return for `name`, as the client shapes it. */
  private metadataOf(name: string): ObjectFile["metadata"] {
    const stored = this.objects.get(name);
    const options = (stored?.options.metadata ?? {}) as Record<string, unknown>;
    return { ...options };
  }

  file(name: string): ObjectFile {
    return {
      name,
      // Filled at creation, as a listing fills it on the real client.
      metadata: this.metadataOf(name),
      save: async (data, options) => {
        this.record("save", [data, options], name);
        const generation = options?.preconditionOpts?.ifGenerationMatch;
        if (generation === 0 && this.objects.has(name)) throw this.preconditionError(412);
        this.objects.set(name, {
          bytes: new Uint8Array(data),
          options: (options ?? {}) as Record<string, unknown>,
        });
      },
      download: async () => {
        this.record("download", [], name);
        const stored = this.objects.get(name);
        if (stored === undefined) throw apiError(404);
        return [Buffer.from(stored.bytes)];
      },
      exists: async () => {
        this.record("exists", [], name);
        return [this.objects.has(name)];
      },
      getMetadata: async () => {
        this.record("getMetadata", [], name);
        const stored = this.objects.get(name);
        if (stored === undefined) throw apiError(404);
        // The real client reports `size` as a decimal string.
        return [{ size: String(stored.bytes.byteLength) }];
      },
      delete: async (options) => {
        this.record("delete", [options], name);
        if (!this.objects.has(name) && options?.ignoreNotFound !== true) throw apiError(404);
        this.objects.delete(name);
        return [undefined];
      },
      copy: async (destination) => {
        this.record("copy", [destination], name);
        const stored = this.objects.get(name);
        if (stored === undefined) throw apiError(404);
        this.objects.set(destination, stored);
        return [this.file(destination), undefined];
      },
      getSignedUrl: async (config) => {
        this.record("getSignedUrl", [config], name);
        return [`https://signed.test/${this.name}/${name}?sig=1`];
      },
      createReadStream: (options) => {
        this.record("createReadStream", [options], name);
        // A real `PassThrough`, like the client's own `File#createReadStream` (F36): a
        // fake built from `Readable.from` never showed the production listener count,
        // since it isn't the class Node warns about.
        const stream = new PassThrough();
        const stored = this.objects.get(name);
        if (stored === undefined) {
          stream._read = () => stream.destroy(apiError(404));
          return stream;
        }
        // The real client re-emits `'response'` on this same stream, carrying the raw HTTP
        // response it is about to pipe from (F40 review round 1, Minor finding 2's fix:
        // `withHeadroom` raises that stream's own listener ceiling too). A fresh
        // `PassThrough` stands in for it here, closely enough for a test to see the
        // ceiling get raised — emitted a tick late, as a real response always is, so a
        // listener attached synchronously on the returned stream (as `withHeadroom` does)
        // is never missed.
        queueMicrotask(() => stream.emit("response", new PassThrough()));
        const end = options?.end === undefined ? stored.bytes.length : options.end + 1;
        stream.end(Buffer.from(stored.bytes.slice(options?.start ?? 0, end)));
        return stream;
      },
      createWriteStream: (options) => {
        this.record("createWriteStream", [options], name);
        // A real `Writable`, the same way `createReadStream` above stands in for the real
        // client's `PassThrough` (F36) — a fake built from a plain `EventEmitter` would
        // never show the vendored listener count `withHeadroom` exists for (F53).
        const chunks: Buffer[] = [];
        const stream = new Writable({
          write: (chunk: Buffer, _encoding, callback) => {
            chunks.push(Buffer.from(chunk));
            callback();
          },
          final: (callback) => {
            const generation = options?.preconditionOpts?.ifGenerationMatch;
            if (generation === 0 && this.objects.has(name)) {
              callback(this.preconditionError(412));
              return;
            }
            this.objects.set(name, {
              bytes: new Uint8Array(Buffer.concat(chunks)),
              options: (options ?? {}) as Record<string, unknown>,
            });
            callback();
          },
        });
        // The real client's `createWriteStream()` re-emits `'response'` on this same
        // stream too (`fileWriteStream.on('response', resp => writeStream.emit('response',
        // resp))`); a fresh `PassThrough` stands in for it here the same way the read side
        // does above.
        queueMicrotask(() => stream.emit("response", new PassThrough()));
        return stream;
      },
    };
  }

  async getFiles(query: GetFilesOptions): Promise<[ObjectFile[], ...unknown[]]> {
    this.record("getFiles", [query]);
    const prefix = query.prefix ?? "";
    const names = [...this.objects.keys()].filter((name) => name.startsWith(prefix)).sort();
    return [names.map((name) => this.file(name)), {}, undefined];
  }

  async deleteFiles(query: DeleteFilesOptions): Promise<void> {
    this.record("deleteFiles", [query]);
    const prefix = query.prefix ?? "";
    for (const name of [...this.objects.keys()]) {
      if (name.startsWith(prefix)) this.objects.delete(name);
    }
  }
}

export interface FakeBuckets {
  privateBucket: FakeBucket;
  publicBucket: FakeBucket;
}

export function createFakeBuckets(): FakeBuckets {
  return {
    privateBucket: new FakeBucket("test-private"),
    publicBucket: new FakeBucket("test-public"),
  };
}
