import "server-only";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { z } from "zod";
import { RefusedError } from "@/core/errors";
import { PROFILES_PREFIX, documentName, profilePrefix } from "@/core/media/paths";
import { ProfileIdSchema } from "@/core/profile/schema";
import type { DraftMeta, ProfileRow, ProfileStore, PublishedRow } from "@/core/ports";
import { type DocumentState, type ListedObject, metadataOf, rowsOf } from "../listing";
import {
  io,
  ioOrNull,
  isMissing,
  metaPath,
  privatePath,
  publicPath,
  readJson,
  writeJson,
} from "./layout";

// The filesystem ProfileStore (ADR-015 → Local development), wired when `STORE=fs`. Every
// document is the file `DATA_DIR/private/<documentName>` with its custom metadata in a
// `.meta.json` sidecar beside it; the layout is the bucket's, so `.data` can be read in an
// editor and `rm -rf .data` resets. Writes are atomic (`layout.ts`), moves are renames, and
// `list()` reads folders and sidecars only — never a document.

const DOCUMENT_STATES: readonly DocumentState[] = ["draft", "published", "archived"];

/** What a sidecar holds: the custom metadata of its document, string to string. */
const MetadataSchema = z.record(z.string(), z.string());

export interface FsProfileStoreOptions {
  /** The absolute DATA_DIR. */
  root: string;
}

class FsProfileStore implements ProfileStore {
  constructor(private readonly root: string) {}

  private file(pid: string, state: DocumentState): string {
    return privatePath(this.root, documentName(pid, state));
  }

  /** The folder every cat's folder sits in — the profiles prefix as a path. */
  private profilesFolder(): string {
    return privatePath(this.root, PROFILES_PREFIX);
  }

  private read(pid: string, state: DocumentState): Promise<unknown | null> {
    return ioOrNull(() => readJson(this.file(pid, state)));
  }

  private async write(
    pid: string,
    state: DocumentState,
    doc: unknown,
    meta: Record<string, string> = {},
  ): Promise<void> {
    const file = this.file(pid, state);
    await writeJson(file, doc);
    await writeJson(metaPath(file), meta);
  }

  private async remove(file: string): Promise<void> {
    await rm(file, { force: true });
    await rm(metaPath(file), { force: true });
  }

  /** Renames a document and its sidecar; `false` when there was no document to move. */
  private async move(pid: string, from: DocumentState, to: DocumentState): Promise<boolean> {
    const source = this.file(pid, from);
    const target = this.file(pid, to);
    return io(async () => {
      try {
        await rename(source, target);
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
      await rename(metaPath(source), metaPath(target));
      return true;
    });
  }

  readDraft(pid: string): Promise<unknown | null> {
    return this.read(pid, "draft");
  }

  writeDraft(pid: string, doc: unknown, meta: DraftMeta): Promise<void> {
    return io(() => this.write(pid, "draft", doc, metadataOf(meta)));
  }

  readPublished(pid: string): Promise<unknown | null> {
    return this.read(pid, "published");
  }

  writePublished(pid: string, doc: unknown): Promise<void> {
    return io(async () => {
      await this.remove(this.file(pid, "archived"));
      await this.write(pid, "published", doc);
    });
  }

  deletePublished(pid: string): Promise<void> {
    return io(() => this.remove(this.file(pid, "published")));
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

  deleteArchived(pid: string): Promise<void> {
    return io(() => this.remove(this.file(pid, "archived")));
  }

  delete(pid: string): Promise<void> {
    const prefix = profilePrefix(pid);
    return io(async () => {
      await rm(privatePath(this.root, prefix), { recursive: true, force: true });
      await rm(publicPath(this.root, prefix), { recursive: true, force: true });
    });
  }

  /** The profile ids that have a folder, in name order; stray entries are skipped. */
  private async pids(): Promise<string[]> {
    const entries = await ioOrNull(() => readdir(this.profilesFolder(), { withFileTypes: true }));
    return (entries ?? [])
      .filter((entry) => entry.isDirectory() && ProfileIdSchema.safeParse(entry.name).success)
      .map((entry) => entry.name)
      .sort();
  }

  /** The documents of one cat as listing entries: names from the folder, metadata from sidecars. */
  private async listed(pid: string): Promise<ListedObject[]> {
    const present = new Set(await readdir(dirname(this.file(pid, "draft"))));
    const listing: ListedObject[] = [];
    for (const state of DOCUMENT_STATES) {
      const file = this.file(pid, state);
      if (!present.has(basename(file))) continue;
      const metadata = MetadataSchema.parse(await readJson(metaPath(file)));
      listing.push({ name: documentName(pid, state), metadata });
    }
    return listing;
  }

  async list(): Promise<ProfileRow[]> {
    const pids = await this.pids();
    const listing = await io(() => Promise.all(pids.map((pid) => this.listed(pid))));
    return rowsOf(listing.flat());
  }

  async listPublished(): Promise<PublishedRow[]> {
    const rows: PublishedRow[] = [];
    for (const pid of await this.pids()) {
      const doc = await this.read(pid, "published");
      if (doc !== null) rows.push({ pid, doc });
    }
    return rows;
  }

  async exists(pid: string): Promise<boolean> {
    return (await ioOrNull(() => stat(this.file(pid, "draft")))) !== null;
  }
}

export function createFsProfileStore(options: FsProfileStoreOptions): ProfileStore {
  return new FsProfileStore(options.root);
}
