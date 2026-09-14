import "server-only";
import { createReadStream } from "node:fs";
import { access, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { lazyWeb } from "@/adapters/lazy-stream";
import { clampByteRange } from "@/core/media/byte-range";
import { derivedName, mediaPrefix, objectName, publicUrl } from "@/core/media/paths";
import { MEDIA_ROUTE } from "@/core/media/public-path";
import { revOf } from "@/core/media/rev";
import { MediaIdSchema } from "@/core/profile/schema";
import type { ByteRange, DerivedKind, DerivedStream, MediaStore, SignedUpload } from "@/core/ports";
import {
  io,
  ioOrNull,
  isMissing,
  privatePath,
  publicPath,
  readJson,
  writeAtomic,
  writeJson,
} from "./layout";

// The filesystem MediaStore (ADR-015 → Local development), wired when `STORE=fs`. Records
// and originals are files under `DATA_DIR/private/<objectName>`, derived files under
// `DATA_DIR/public/<derivedName>`, so the two folders mirror the two buckets exactly.
//
// Two things differ from GCS by necessity. A signed upload is a URL on this app
// (`PUT /api/dev-upload/{pid}/{mid}`, a route that exists only under `STORE=fs`) that
// streams the bytes into place through `writeOriginal` in `./dev-upload.ts`; `putOriginal`
// below is the same landing for a test that already holds the bytes. And `gsUri` is a
// `file://` URL: the fake describer never opens it, and the real one never runs against
// `STORE=fs`. Public files are served the same way under every store (F23): by this app's
// `/media/<name>` route, streamed from `readDerivedRange`, so `publicUrl` is the
// root-relative `/media/<name>` here exactly as it is on GCS.

/** The filesystem MediaStore plus the write the dev upload route needs. */
export interface FsMediaStore extends MediaStore {
  /** Puts the original bytes in place, as the dev upload route does for a browser. */
  putOriginal(pid: string, mid: string, bytes: Uint8Array): Promise<void>;
}

export interface FsMediaStoreOptions {
  /** The absolute DATA_DIR. */
  root: string;
}

class FsMediaStoreImpl implements FsMediaStore {
  constructor(private readonly root: string) {}

  private original(pid: string, mid: string): string {
    return privatePath(this.root, objectName(pid, mid, "original"));
  }

  private asset(pid: string, mid: string): string {
    return privatePath(this.root, objectName(pid, mid, "asset"));
  }

  private derived(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return publicPath(this.root, derivedName(pid, mid, kind, rev));
  }

  putOriginal(pid: string, mid: string, bytes: Uint8Array): Promise<void> {
    return io(() => writeAtomic(this.original(pid, mid), bytes));
  }

  async createSignedUpload(pid: string, mid: string): Promise<SignedUpload> {
    objectName(pid, mid, "original"); // validates both ids before they become a URL
    return { url: `/api/dev-upload/${pid}/${mid}`, method: "PUT", headers: {} };
  }

  async readOriginal(pid: string, mid: string): Promise<ReadableStream<Uint8Array> | null> {
    const file = this.original(pid, mid);
    if ((await ioOrNull(() => stat(file))) === null) return null;
    return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  }

  readRange(pid: string, mid: string, range: ByteRange): Promise<Uint8Array | null> {
    const file = this.original(pid, mid);
    return ioOrNull(async () => {
      const size = (await stat(file)).size;
      if (range.start >= size) return new Uint8Array();
      const chunks: Buffer[] = [];
      const stream: AsyncIterable<Buffer> = createReadStream(file, range);
      for await (const chunk of stream) chunks.push(chunk);
      return new Uint8Array(Buffer.concat(chunks));
    });
  }

  async originalSize(pid: string, mid: string): Promise<number | null> {
    const stats = await ioOrNull(() => stat(this.original(pid, mid)));
    return stats === null ? null : stats.size;
  }

  readAsset(pid: string, mid: string): Promise<unknown | null> {
    return ioOrNull(() => readJson(this.asset(pid, mid)));
  }

  writeAsset(pid: string, mid: string, asset: unknown): Promise<void> {
    return io(() => writeJson(this.asset(pid, mid), asset));
  }

  writeDerived(pid: string, mid: string, kind: DerivedKind, bytes: Uint8Array): Promise<string> {
    const rev = revOf(bytes);
    const file = this.derived(pid, mid, kind, rev);
    return io(async () => {
      try {
        await access(file);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await writeAtomic(file, bytes);
      }
      return rev;
    });
  }

  async readDerived(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
  ): Promise<Uint8Array | null> {
    const bytes = await ioOrNull(() => readFile(this.derived(pid, mid, kind, rev)));
    return bytes === null ? null : new Uint8Array(bytes);
  }

  async readDerivedRange(
    pid: string,
    mid: string,
    kind: DerivedKind,
    rev: string,
    range?: ByteRange,
  ): Promise<DerivedStream | null> {
    const file = this.derived(pid, mid, kind, rev);
    const stats = await ioOrNull(() => stat(file));
    if (stats === null) return null;
    const slice = clampByteRange(range, stats.size);
    if (slice === null) return { stream: null, size: stats.size };
    const { start, end } = slice;
    // Opened on the first read, so a caller that only wanted the size costs one `stat`.
    const stream = lazyWeb(() => createReadStream(file, { start, end }));
    return { stream, size: stats.size, start, end };
  }

  deleteMedia(pid: string, mid: string): Promise<void> {
    const folder = dirname(objectName(pid, mid, "asset"));
    return this.removeBoth(folder);
  }

  deleteProfileMedia(pid: string): Promise<void> {
    return this.removeBoth(mediaPrefix(pid));
  }

  private removeBoth(folder: string): Promise<void> {
    return io(async () => {
      await rm(privatePath(this.root, folder), { recursive: true, force: true });
      await rm(publicPath(this.root, folder), { recursive: true, force: true });
    });
  }

  async listMedia(pid: string): Promise<string[]> {
    const mediaFolder = privatePath(this.root, mediaPrefix(pid));
    const entries = (await ioOrNull(() => readdir(mediaFolder, { withFileTypes: true }))) ?? [];
    const mids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !MediaIdSchema.safeParse(entry.name).success) continue;
      if ((await ioOrNull(() => stat(this.asset(pid, entry.name)))) !== null) mids.push(entry.name);
    }
    return mids.sort();
  }

  publicUrl(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return publicUrl(MEDIA_ROUTE, derivedName(pid, mid, kind, rev));
  }

  gsUri(pid: string, mid: string, kind: DerivedKind, rev: string): string {
    return `file://${this.derived(pid, mid, kind, rev)}`;
  }
}

export function createFsMediaStore(options: FsMediaStoreOptions): FsMediaStore {
  return new FsMediaStoreImpl(options.root);
}
