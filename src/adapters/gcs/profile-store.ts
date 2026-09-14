import "server-only";
import { RefusedError } from "@/core/errors";
import { PROFILES_PREFIX, documentName, profilePrefix } from "@/core/media/paths";
import type { DraftMeta, ProfileRow, ProfileStore, PublishedRow } from "@/core/ports";
import { type DocumentState, type ListedObject, metadataOf, pidOf, rowsOf } from "../listing";
import {
  type GcsBuckets,
  type ObjectBucket,
  type ObjectFile,
  call,
  callOrNull,
  drain,
  withHeadroom,
  writeAll,
} from "./client";

// The Google Cloud Storage ProfileStore (ADR-015), wired when `STORE=gcs`. Documents are
// JSON objects in the private bucket; a draft save stamps the ADR-015 metadata keys
// (`../listing`) so `list()` is one listing call and never a download. Archive and restore
// are a server-side copy followed by a delete, so the bytes are never re-uploaded and the
// restored page is byte-identical (FR-087). Every client call goes through `call` /
// `callOrNull`, so a failure reaches the app as an `UpstreamError` and a `404` as `null`.
//
// F53: `read`/`write` call `createReadStream`/`createWriteStream` directly, wrapped in
// `withHeadroom` (see its comment in `./client`), rather than `.download()`/`.save()` —
// neither convenience wrapper hands the stream back to the caller, so `withHeadroom` could
// never reach it, and this document is read or written on every builder page load, every
// draft save and every helper turn (`readDraft` under `loadDraft`, `writeDraft` under
// `saveDraft`) — the exact routes the warning burst correlated with on Cloud Run
// (`/builder/{id}`, `/api/profiles/{id}/draft`, `/api/helper/chat`, `/builder`), not the
// media-stream path F36/F40 already fixed. `read`'s headroom is real (the returned stream is
// part of the vendored chain, F36/F40); `write`'s is precautionary only — the write side's
// own listeners stack on internal emitters `write` never touches (see
// `VENDORED_STREAM_MAX_LISTENERS` in `./client` for the measured counts). `write`'s calls
// never carry a precondition, so `.save()` was never retrying them anyway (the client's
// default idempotency strategy disables retries without one) — switching away from it loses
// nothing there, and gains something elsewhere: `.save()` without a precondition was
// silently flipping the shared client's `autoRetry` off for every later call on it, which
// `createWriteStream()` never does (F53 review round 1).

const JSON_TYPE = "application/json";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Custom metadata as a listing returns it, narrowed to the string values the rows read. */
function stringMetadata(file: ObjectFile): Record<string, string> {
  const custom = file.metadata.metadata ?? {};
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(custom)) {
    if (typeof value === "string") strings[key] = value;
  }
  return strings;
}

class GcsProfileStore implements ProfileStore {
  private readonly bucket: ObjectBucket;

  constructor(private readonly buckets: GcsBuckets) {
    this.bucket = buckets.privateBucket;
  }

  private file(pid: string, state: DocumentState): ObjectFile {
    return this.bucket.file(documentName(pid, state));
  }

  /** The document as parsed JSON, `null` when missing; a corrupt object is an upstream failure. */
  private read(pid: string, state: DocumentState): Promise<unknown | null> {
    return callOrNull(async () => {
      const bytes = await drain(withHeadroom(this.file(pid, state).createReadStream()));
      return JSON.parse(decoder.decode(bytes)) as unknown;
    });
  }

  private write(
    pid: string,
    state: DocumentState,
    doc: unknown,
    meta: Record<string, string> = {},
  ): Promise<void> {
    return call(() =>
      writeAll(
        withHeadroom(
          this.file(pid, state).createWriteStream({
            contentType: JSON_TYPE,
            resumable: false,
            metadata: { metadata: meta },
          }),
        ),
        encoder.encode(JSON.stringify(doc)),
      ),
    );
  }

  /** Copies a document to another name and deletes the source; `false` when it did not exist. */
  private async move(pid: string, from: DocumentState, to: DocumentState): Promise<boolean> {
    const source = this.file(pid, from);
    const copied = await callOrNull(() => source.copy(documentName(pid, to)));
    if (copied === null) return false;
    await call(() => source.delete());
    return true;
  }

  readDraft(pid: string): Promise<unknown | null> {
    return this.read(pid, "draft");
  }

  writeDraft(pid: string, doc: unknown, meta: DraftMeta): Promise<void> {
    return this.write(pid, "draft", doc, metadataOf(meta));
  }

  readPublished(pid: string): Promise<unknown | null> {
    return this.read(pid, "published");
  }

  async writePublished(pid: string, doc: unknown): Promise<void> {
    await call(() => this.file(pid, "archived").delete({ ignoreNotFound: true }));
    await this.write(pid, "published", doc);
  }

  async deletePublished(pid: string): Promise<void> {
    await call(() => this.file(pid, "published").delete({ ignoreNotFound: true }));
  }

  async archive(pid: string): Promise<void> {
    if (!(await this.move(pid, "published", "archived"))) {
      throw new RefusedError("Only a live profile can be archived.");
    }
  }

  async restore(pid: string): Promise<void> {
    if (!(await this.move(pid, "archived", "published"))) {
      throw new RefusedError("Only an archived profile can be restored.");
    }
  }

  readArchived(pid: string): Promise<unknown | null> {
    return this.read(pid, "archived");
  }

  async deleteArchived(pid: string): Promise<void> {
    await call(() => this.file(pid, "archived").delete({ ignoreNotFound: true }));
  }

  async delete(pid: string): Promise<void> {
    const prefix = profilePrefix(pid);
    await call(() => this.buckets.privateBucket.deleteFiles({ prefix }));
    await call(() => this.buckets.publicBucket.deleteFiles({ prefix }));
  }

  /** One listing of everything under `profiles/`: names and metadata, no bytes. */
  private async listing(): Promise<ListedObject[]> {
    const [files] = await call(() =>
      this.bucket.getFiles({ prefix: PROFILES_PREFIX, autoPaginate: true }),
    );
    return files.map((file) => ({ name: file.name, metadata: stringMetadata(file) }));
  }

  async list(): Promise<ProfileRow[]> {
    return rowsOf(await this.listing());
  }

  async listPublished(): Promise<PublishedRow[]> {
    const rows: PublishedRow[] = [];
    for (const { name } of await this.listing()) {
      const pid = pidOf(name, "published");
      if (pid === null) continue;
      const doc = await this.read(pid, "published");
      if (doc !== null) rows.push({ pid, doc });
    }
    return rows;
  }

  async exists(pid: string): Promise<boolean> {
    const [exists] = await call(() => this.file(pid, "draft").exists());
    return exists;
  }
}

export function createGcsProfileStore(buckets: GcsBuckets): ProfileStore {
  return new GcsProfileStore(buckets);
}
