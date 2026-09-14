import { RefusedError } from "@/core/errors";
import { PROFILES_PREFIX, documentName, profilePrefix } from "@/core/media/paths";
import type { DraftMeta, ProfileRow, ProfileStore, PublishedRow } from "@/core/ports";
import { type DocumentState, metadataOf, pidOf, rowsOf } from "../listing";
import {
  createMemoryBuckets,
  decodeJson,
  encodeJson,
  type MemoryBucket,
  type MemoryBuckets,
} from "./bucket";

// The in-memory ProfileStore (contracts/ports.md → Fake), wired when `STORE=memory` and used
// by every unit and contract test. Keys are the real object names from `documentName`,
// documents are stored as the UTF-8 bytes of their JSON and metadata under the ADR-015
// keys (`../listing`), so the filesystem and GCS adapters can share its contract suite.

class MemoryProfileStore implements ProfileStore {
  private readonly bucket: MemoryBucket;

  constructor(private readonly buckets: MemoryBuckets) {
    this.bucket = buckets.privateBucket;
  }

  private read(pid: string, state: DocumentState): unknown | null {
    const object = this.bucket.get(documentName(pid, state));
    return object === null ? null : decodeJson(object.bytes);
  }

  async readDraft(pid: string): Promise<unknown | null> {
    return this.read(pid, "draft");
  }

  async writeDraft(pid: string, doc: unknown, meta: DraftMeta): Promise<void> {
    this.bucket.put(documentName(pid, "draft"), encodeJson(doc), metadataOf(meta));
  }

  async readPublished(pid: string): Promise<unknown | null> {
    return this.read(pid, "published");
  }

  async writePublished(pid: string, doc: unknown): Promise<void> {
    this.bucket.delete(documentName(pid, "archived"));
    this.bucket.put(documentName(pid, "published"), encodeJson(doc));
  }

  async deletePublished(pid: string): Promise<void> {
    this.bucket.delete(documentName(pid, "published"));
  }

  async archive(pid: string): Promise<void> {
    if (!this.bucket.move(documentName(pid, "published"), documentName(pid, "archived"))) {
      throw new RefusedError("Only a live profile can be archived.");
    }
  }

  async restore(pid: string): Promise<void> {
    if (!this.bucket.move(documentName(pid, "archived"), documentName(pid, "published"))) {
      throw new RefusedError("Only an archived profile can be restored.");
    }
  }

  async readArchived(pid: string): Promise<unknown | null> {
    return this.read(pid, "archived");
  }

  async deleteArchived(pid: string): Promise<void> {
    this.bucket.delete(documentName(pid, "archived"));
  }

  async delete(pid: string): Promise<void> {
    const prefix = profilePrefix(pid);
    this.buckets.privateBucket.deletePrefix(prefix);
    this.buckets.publicBucket.deletePrefix(prefix);
  }

  async list(): Promise<ProfileRow[]> {
    return rowsOf(this.bucket.list(PROFILES_PREFIX));
  }

  async listPublished(): Promise<PublishedRow[]> {
    const rows: PublishedRow[] = [];
    for (const { name } of this.bucket.list(PROFILES_PREFIX)) {
      const pid = pidOf(name, "published");
      if (pid !== null) rows.push({ pid, doc: this.read(pid, "published") });
    }
    return rows;
  }

  async exists(pid: string): Promise<boolean> {
    return this.bucket.has(documentName(pid, "draft"));
  }
}

export function createMemoryProfileStore(options: { buckets?: MemoryBuckets } = {}): ProfileStore {
  return new MemoryProfileStore(options.buckets ?? createMemoryBuckets());
}
