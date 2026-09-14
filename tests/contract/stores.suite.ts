import { describe, expect, it } from "vitest";
import { ProfileInvalidError, RefusedError } from "@/core/errors";
import { derivedName } from "@/core/media/paths";
import { revOf } from "@/core/media/rev";
import type { ByteRange, MediaStore, ProfileStore } from "@/core/ports";

// The shared port contract for ProfileStore and MediaStore (contracts/ports.md, ADR-015).
// Every store implementation registers itself once with a factory and runs the same tests:
// `memory` here (T013), `fs` and `gcs` in T016. Both stores come from one factory because
// they share a layout — deleting a cat through the profile store must take its media too.

/**
 * Both stores over one fresh, empty backing, plus two things the port cannot do on purpose:
 * put an original in place the way a browser's signed upload would, and plant a draft's
 * metadata exactly as given, bypassing `metadataOf` — the only way to reconstruct an old
 * `thumbnail-url` stamp (F30) for the repair test, since `writeDraft` itself never writes
 * one any more.
 */
export interface Stores {
  profiles: ProfileStore;
  media: MediaStore;
  putOriginal(pid: string, mid: string, bytes: Uint8Array): Promise<void>;
  writeRawDraft(pid: string, doc: unknown, metadata: Record<string, string>): Promise<void>;
}

export type StoreFactory = () => Stores | Promise<Stores>;

const PID = "abcdefgh";
const OTHER_PID = "zyxwvuts";
const MID = "mmmmmmm2";
const OTHER_MID = "nnnnnnn3";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: number[] = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(...next.value);
  }
  return new Uint8Array(chunks);
}

const META = {
  name: "Charlotte",
  line: "",
  thumbnail: null,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

function documentTests(factory: StoreFactory): void {
  describe("documents", () => {
    it("round-trips a draft byte-faithfully and reports it as a draft", async () => {
      const { profiles } = await factory();
      const doc = { schemaVersion: 1, name: "Charlotte", blocks: [{ z: 1, a: "first" }] };
      expect(await profiles.readDraft(PID)).toBeNull();
      expect(await profiles.exists(PID)).toBe(false);

      await profiles.writeDraft(PID, doc, META);

      const read = await profiles.readDraft(PID);
      expect(read).toEqual(doc);
      expect(JSON.stringify(read)).toBe(JSON.stringify(doc));
      expect(await profiles.exists(PID)).toBe(true);
      expect(await profiles.readPublished(PID)).toBeNull();
      expect(await profiles.readArchived(PID)).toBeNull();
    });

    it("rejects a bad id as invalid before anything reaches storage", async () => {
      const { profiles } = await factory();
      await expect(profiles.writeDraft("../x", { v: 1 }, META)).rejects.toBeInstanceOf(
        ProfileInvalidError,
      );
      await expect(profiles.readDraft("../x")).rejects.toBeInstanceOf(ProfileInvalidError);
      await expect(profiles.list()).resolves.toEqual([]);
    });

    it("lists rows from the draft's metadata, without reading the document", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { name: "Other" }, META);
      await profiles.writeDraft(
        OTHER_PID,
        { name: "Other" },
        {
          name: "Biscuit",
          line: "A negotiator, not a complainer.",
          thumbnail: { mid: MID, rev: "abc1234567" },
          updatedAt: "2026-09-11T00:00:00.000Z",
        },
      );

      const rows = await profiles.list();
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.pid === PID)).toEqual({
        pid: PID,
        state: "draft",
        name: "Charlotte",
        line: "",
        thumbnail: null,
        updatedAt: META.updatedAt,
      });
      expect(rows.find((row) => row.pid === OTHER_PID)).toEqual({
        pid: OTHER_PID,
        state: "draft",
        name: "Biscuit",
        line: "A negotiator, not a complainer.",
        thumbnail: { mid: MID, rev: "abc1234567" },
        updatedAt: "2026-09-11T00:00:00.000Z",
      });
    });
  });
}

/**
 * F30: a draft's list thumbnail is resolved from ids at list time, never from a value
 * stamped in the past. Found on Cloud Run: a draft saved before F23 kept an absolute
 * bucket-host `thumbnail-url` in its metadata, and the list rendered it verbatim — broken
 * once F23 stopped granting any bucket a public read.
 */
function thumbnailResolutionTests(factory: StoreFactory): void {
  describe("thumbnail resolution (F30)", () => {
    it("repairs an old thumbnail-url stamp (an absolute bucket URL) into the same media pair a new stamp holds", async () => {
      const { profiles, media, writeRawDraft } = await factory();
      const rev = "abc1234567";
      const legacyUrl = `https://storage.googleapis.com/some-bucket/profiles/${PID}/media/${MID}/clean.${rev}.jpg`;
      await writeRawDraft(
        PID,
        { name: "Other" },
        {
          name: "Charlotte",
          line: "",
          "thumbnail-url": legacyUrl,
          "updated-at": META.updatedAt,
        },
      );

      const row = (await profiles.list()).find((r) => r.pid === PID);
      expect(row?.thumbnail).toEqual({ mid: MID, rev });
      // What the caller of `list()` does with that pair (src/app/actions/_lib/profiles.ts):
      // resolve it through MediaStore.publicUrl. It names the same derived file the old
      // stamp pointed at, but through this store's own URL scheme — never the stale bucket
      // host the `thumbnail-url` stamp carried.
      const resolved = media.publicUrl(row!.pid, row!.thumbnail!.mid, "clean", row!.thumbnail!.rev);
      expect(resolved).toContain(derivedName(PID, MID, "clean", rev));
      expect(resolved).not.toContain("storage.googleapis.com");
    });

    it("repairs an old thumbnail-url already in the root-relative /media/… form the same way", async () => {
      const { profiles, writeRawDraft } = await factory();
      const rev = "def7654321";
      await writeRawDraft(
        OTHER_PID,
        { name: "Other" },
        {
          name: "Biscuit",
          line: "",
          "thumbnail-url": `/media/profiles/${OTHER_PID}/media/${OTHER_MID}/clean.${rev}.jpg`,
          "updated-at": META.updatedAt,
        },
      );

      const row = (await profiles.list()).find((r) => r.pid === OTHER_PID);
      expect(row?.thumbnail).toEqual({ mid: OTHER_MID, rev });
    });

    it("lists null for a thumbnail-url that does not parse, rather than failing the listing", async () => {
      const { profiles, writeRawDraft } = await factory();
      await writeRawDraft(
        PID,
        { name: "Other" },
        {
          name: "Charlotte",
          line: "",
          "thumbnail-url": "https://cdn.test/not-a-derived-path.jpg",
          "updated-at": META.updatedAt,
        },
      );

      const row = (await profiles.list()).find((r) => r.pid === PID);
      expect(row?.thumbnail).toBeNull();
    });

    it("lists null for a thumbnail-url naming another cat's media, rather than repairing it (review F30 round 1, finding 1)", async () => {
      const { profiles, writeRawDraft } = await factory();
      const rev = "0000000000";
      // Written under PID, but the stamp's own path names OTHER_PID's media — a legacy
      // stamp that must never be trusted to point at the draft it happens to sit on.
      await writeRawDraft(
        PID,
        { name: "Other" },
        {
          name: "Charlotte",
          line: "",
          "thumbnail-url": `https://storage.googleapis.com/some-bucket/profiles/${OTHER_PID}/media/${OTHER_MID}/clean.${rev}.jpg`,
          "updated-at": META.updatedAt,
        },
      );

      const row = (await profiles.list()).find((r) => r.pid === PID);
      expect(row?.thumbnail).toBeNull();
    });

    it("a new draft stamps the thumbnail as a {mid, rev} pair, never a URL", async () => {
      const { profiles } = await factory();
      const thumbnail = { mid: MID, rev: "1234567890" };
      await profiles.writeDraft(PID, { name: "Other" }, { ...META, thumbnail });

      const row = (await profiles.list()).find((r) => r.pid === PID);
      expect(row?.thumbnail).toEqual(thumbnail);
    });

    it("lists null when the draft has no hero photo yet", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { name: "Other" }, META);

      const row = (await profiles.list()).find((r) => r.pid === PID);
      expect(row?.thumbnail).toBeNull();
    });
  });
}

function lifecycleTests(factory: StoreFactory): void {
  describe("publish, archive, restore", () => {
    it("derives the state from which document exists beside the draft", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      const stateOf = async () => (await profiles.list()).find((row) => row.pid === PID)?.state;

      expect(await stateOf()).toBe("draft");
      await profiles.writePublished(PID, { v: 1, publishedAt: "x" });
      expect(await stateOf()).toBe("live");
      await profiles.archive(PID);
      expect(await stateOf()).toBe("archived");
      await profiles.restore(PID);
      expect(await stateOf()).toBe("live");
      await profiles.deletePublished(PID);
      expect(await stateOf()).toBe("draft");
    });

    it("archive moves the published document; restore moves it back byte-identical", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      const published = { schemaVersion: 1, z: "last", a: "first", media: { m: { k: 1 } } };
      await profiles.writePublished(PID, published);

      await profiles.archive(PID);
      expect(await profiles.readPublished(PID)).toBeNull();
      expect(await profiles.readArchived(PID)).toEqual(published);

      await profiles.restore(PID);
      expect(await profiles.readArchived(PID)).toBeNull();
      const restored = await profiles.readPublished(PID);
      expect(JSON.stringify(restored)).toBe(JSON.stringify(published));
      expect(await profiles.readDraft(PID)).toEqual({ v: 1 });
    });

    it("deleteArchived removes the archive so the cat is a draft again; a no-op otherwise", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      await profiles.deleteArchived(PID);
      await profiles.writePublished(PID, { v: 1 });
      await profiles.deleteArchived(PID);
      expect(await profiles.readPublished(PID)).toEqual({ v: 1 });

      await profiles.archive(PID);
      await profiles.deleteArchived(PID);
      expect(await profiles.readArchived(PID)).toBeNull();
      expect(await profiles.readPublished(PID)).toBeNull();
      expect((await profiles.list()).find((row) => row.pid === PID)?.state).toBe("draft");
      expect(await profiles.readDraft(PID)).toEqual({ v: 1 });
    });

    it("refuses to archive a draft and to restore a live or draft profile", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      await expect(profiles.archive(PID)).rejects.toBeInstanceOf(RefusedError);
      await expect(profiles.restore(PID)).rejects.toBeInstanceOf(RefusedError);

      await profiles.writePublished(PID, { v: 1 });
      await expect(profiles.restore(PID)).rejects.toBeInstanceOf(RefusedError);
      expect(await profiles.readPublished(PID)).toEqual({ v: 1 });
    });
  });
}

function publishedListTests(factory: StoreFactory): void {
  describe("published documents and delete", () => {
    it("publishing an archived profile replaces the archive, so never both exist", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      await profiles.writePublished(PID, { v: 1 });
      await profiles.archive(PID);

      await profiles.writePublished(PID, { v: 2 });
      expect(await profiles.readArchived(PID)).toBeNull();
      expect(await profiles.readPublished(PID)).toEqual({ v: 2 });
    });

    it("lists every published document with its pid", async () => {
      const { profiles } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      await profiles.writeDraft(OTHER_PID, { v: 1 }, META);
      await profiles.writePublished(OTHER_PID, { name: "Biscuit" });
      expect(await profiles.listPublished()).toEqual([
        { pid: OTHER_PID, doc: { name: "Biscuit" } },
      ]);
    });

    it("delete removes the draft, published and archived documents and the media", async () => {
      const { profiles, media, putOriginal } = await factory();
      await profiles.writeDraft(PID, { v: 1 }, META);
      await profiles.writePublished(PID, { v: 1 });
      await profiles.writeDraft(OTHER_PID, { v: 1 }, META);
      await media.writeAsset(PID, MID, { id: MID });
      await putOriginal(PID, MID, bytes("orig"));
      const rev = await media.writeDerived(PID, MID, "clean", bytes("jpeg"));
      await media.writeAsset(OTHER_PID, MID, { id: MID });

      await profiles.delete(PID);

      expect(await profiles.exists(PID)).toBe(false);
      expect(await profiles.readDraft(PID)).toBeNull();
      expect(await profiles.readPublished(PID)).toBeNull();
      expect(await profiles.readArchived(PID)).toBeNull();
      expect((await profiles.list()).map((row) => row.pid)).toEqual([OTHER_PID]);
      expect(await media.readAsset(PID, MID)).toBeNull();
      expect(await media.readOriginal(PID, MID)).toBeNull();
      expect(await media.readDerived(PID, MID, "clean", rev)).toBeNull();
      expect(await media.readAsset(OTHER_PID, MID)).toEqual({ id: MID });
    });
  });
}

export function runProfileStoreContract(name: string, factory: StoreFactory): void {
  describe(`ProfileStore contract (${name})`, () => {
    documentTests(factory);
    lifecycleTests(factory);
    publishedListTests(factory);
    thumbnailResolutionTests(factory);
  });
}

function recordAndDerivedTests(factory: StoreFactory): void {
  describe("records and derived files", () => {
    it("rejects a bad id as invalid before anything reaches storage", async () => {
      const { media } = await factory();
      await expect(media.readAsset("bad", "id")).rejects.toBeInstanceOf(ProfileInvalidError);
      await expect(media.writeAsset(PID, "../mid", {})).rejects.toBeInstanceOf(ProfileInvalidError);
      await expect(media.createSignedUpload("bad", MID, 1)).rejects.toBeInstanceOf(
        ProfileInvalidError,
      );
    });

    it("round-trips the media record", async () => {
      const { media } = await factory();
      expect(await media.readAsset(PID, MID)).toBeNull();
      const asset = { schemaVersion: 1, id: MID, focal: { x: 50, y: 50 } };
      await media.writeAsset(PID, MID, asset);
      expect(await media.readAsset(PID, MID)).toEqual(asset);
      expect(await media.listMedia(PID)).toEqual([MID]);
      expect(await media.listMedia(OTHER_PID)).toEqual([]);
    });

    it("names derived files by the content rev and never changes what a rev holds", async () => {
      const { media } = await factory();
      const clean = bytes("clean jpeg bytes");
      const rev = await media.writeDerived(PID, MID, "clean", clean);
      expect(rev).toBe(revOf(clean));
      expect(await media.writeDerived(PID, MID, "clean", new Uint8Array(clean))).toBe(rev);

      const other = await media.writeDerived(PID, MID, "clean", bytes("re-cleaned"));
      expect(other).not.toBe(rev);
      expect(await media.readDerived(PID, MID, "clean", rev)).toEqual(clean);
      expect(await media.readDerived(PID, MID, "clean", other)).toEqual(bytes("re-cleaned"));
      expect(await media.readDerived(PID, MID, "poster", rev)).toBeNull();
    });

    it("builds public URLs and gs URIs from the rev, never from a stored path", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes("mp4"));
      // Every real store answers the root-relative `/media/…` path this app serves (F23:
      // no bucket carries a public grant); the memory store answers whatever base it was
      // given, so the shape is checked here and the base by each adapter's own tests.
      expect(media.publicUrl(PID, MID, "web", rev)).toMatch(
        new RegExp(`^(https://.+|/media)/profiles/${PID}/media/${MID}/web\\.${rev}\\.mp4$`),
      );
      // `gs://bucket/…` for a bucket store; the filesystem store, which no model ever
      // reads from, answers `file:///…` for the same object.
      expect(media.gsUri(PID, MID, "web", rev)).toMatch(
        new RegExp(`^(gs|file)://.+/profiles/${PID}/media/${MID}/web\\.${rev}\\.mp4$`),
      );
      expect(media.publicUrl(PID, MID, "poster", rev)).toMatch(/\/poster\.[0-9a-f]{10}\.jpg$/);
    });
  });
}

function mediaDeleteTests(factory: StoreFactory): void {
  describe("deletes", () => {
    it("deleteMedia removes one media id and leaves its siblings intact", async () => {
      const { media, putOriginal } = await factory();
      await media.writeAsset(PID, MID, { id: MID });
      await media.writeAsset(PID, OTHER_MID, { id: OTHER_MID });
      await putOriginal(PID, MID, bytes("orig"));
      await putOriginal(PID, OTHER_MID, bytes("sibling"));
      const rev = await media.writeDerived(PID, MID, "clean", bytes("a"));
      const siblingRev = await media.writeDerived(PID, OTHER_MID, "clean", bytes("b"));

      await media.deleteMedia(PID, MID);

      expect(await media.readAsset(PID, MID)).toBeNull();
      expect(await media.readOriginal(PID, MID)).toBeNull();
      expect(await media.readRange(PID, MID, { start: 0, end: 1 })).toBeNull();
      expect(await media.readRange(PID, OTHER_MID, { start: 0, end: 6 })).toEqual(bytes("sibling"));
      expect(await media.readDerived(PID, MID, "clean", rev)).toBeNull();
      expect(await media.readAsset(PID, OTHER_MID)).toEqual({ id: OTHER_MID });
      expect(await media.readDerived(PID, OTHER_MID, "clean", siblingRev)).toEqual(bytes("b"));
      expect(await media.listMedia(PID)).toEqual([OTHER_MID]);
    });

    it("deleteProfileMedia removes every media of one cat and nothing of another", async () => {
      const { media, putOriginal } = await factory();
      await media.writeAsset(PID, MID, { id: MID });
      await media.writeAsset(PID, OTHER_MID, { id: OTHER_MID });
      await media.writeAsset(OTHER_PID, MID, { id: MID });
      await putOriginal(PID, OTHER_MID, bytes("orig"));
      await putOriginal(OTHER_PID, MID, bytes("other cat"));
      const rev = await media.writeDerived(PID, MID, "poster", bytes("p"));

      await media.deleteProfileMedia(PID);

      expect(await media.listMedia(PID)).toEqual([]);
      expect(await media.readOriginal(PID, OTHER_MID)).toBeNull();
      expect(await media.readRange(OTHER_PID, MID, { start: 0, end: 99 })).toEqual(
        bytes("other cat"),
      );
      expect(await media.readDerived(PID, MID, "poster", rev)).toBeNull();
      expect(await media.readAsset(OTHER_PID, MID)).toEqual({ id: MID });
    });
  });
}

function originalTests(factory: StoreFactory): void {
  describe("originals", () => {
    it("signs an upload and serves the original back whole and by range", async () => {
      const { media } = await factory();
      const upload = await media.createSignedUpload(PID, MID, 10);
      expect(upload.method).toMatch(/^(PUT|POST)$/);
      expect(upload.url.length).toBeGreaterThan(0);
      expect(await media.readOriginal(PID, MID)).toBeNull();
      expect(await media.readRange(PID, MID, { start: 0, end: 3 })).toBeNull();
    });

    it("originalSize is the byte length of a stored original, null before and after", async () => {
      const { media, putOriginal } = await factory();
      expect(await media.originalSize(PID, MID)).toBeNull();
      await putOriginal(PID, MID, bytes("0123456789"));
      expect(await media.originalSize(PID, MID)).toBe(10);
      await media.deleteMedia(PID, MID);
      expect(await media.originalSize(PID, MID)).toBeNull();
    });

    it("readRange returns the inclusive byte slice of a stored original", async () => {
      const { media, putOriginal } = await factory();
      await putOriginal(PID, MID, bytes("0123456789"));

      const whole = await media.readOriginal(PID, MID);
      if (whole === null) {
        throw new Error("readOriginal returned null for a stored original");
      }
      expect(await drain(whole)).toEqual(bytes("0123456789"));
      expect(await media.readRange(PID, MID, { start: 2, end: 4 })).toEqual(bytes("234"));
      expect(await media.readRange(PID, MID, { start: 8, end: 100 })).toEqual(bytes("89"));
    });
  });
}

function derivedStreamTests(factory: StoreFactory): void {
  describe("derived files as streams (F23: the app serves every derived file itself)", () => {
    const CONTENT = "0123456789";

    /** The stream of a read that must have one, drained, plus the numbers beside it. */
    async function read(
      media: MediaStore,
      rev: string,
      range?: ByteRange,
    ): Promise<{ text: string; size: number; start: number; end: number }> {
      const result = await media.readDerivedRange(PID, MID, "web", rev, range);
      if (result === null || result.stream === null) {
        throw new Error(`expected a stream for ${JSON.stringify(range)}, got ${String(result)}`);
      }
      const text = new TextDecoder().decode(await drain(result.stream));
      return { text, size: result.size, start: result.start, end: result.end };
    }

    it("streams the whole file with its size when no range is asked for", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await read(media, rev)).toEqual({ text: CONTENT, size: 10, start: 0, end: 9 });
    });

    it("streams a middle range, inclusive at both ends", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await read(media, rev, { start: 2, end: 4 })).toEqual({
        text: "234",
        size: 10,
        start: 2,
        end: 4,
      });
    });

    it("clamps an end past the last byte to it (an open-ended range)", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await read(media, rev, { start: 7, end: 1000 })).toEqual({
        text: "789",
        size: 10,
        start: 7,
        end: 9,
      });
    });

    it("streams a range ending exactly on the last byte, unclamped", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await read(media, rev, { start: 8, end: 9 })).toEqual({
        text: "89",
        size: 10,
        start: 8,
        end: 9,
      });
    });

    it("answers the size and no stream for a start past the last byte", async () => {
      const { media } = await factory();
      const rev = await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await media.readDerivedRange(PID, MID, "web", rev, { start: 10, end: 12 })).toEqual({
        stream: null,
        size: 10,
      });
    });

    it("answers null for a rev that was never written, with or without a range", async () => {
      const { media } = await factory();
      await media.writeDerived(PID, MID, "web", bytes(CONTENT));
      expect(await media.readDerivedRange(PID, MID, "web", "0123456789")).toBeNull();
      expect(
        await media.readDerivedRange(PID, MID, "poster", "0123456789", { start: 0, end: 1 }),
      ).toBeNull();
    });

    it("rejects a bad id as invalid before anything reaches storage", async () => {
      const { media } = await factory();
      await expect(media.readDerivedRange("bad", MID, "web", "0123456789")).rejects.toBeInstanceOf(
        ProfileInvalidError,
      );
    });
  });
}

export function runMediaStoreContract(name: string, factory: StoreFactory): void {
  describe(`MediaStore contract (${name})`, () => {
    recordAndDerivedTests(factory);
    mediaDeleteTests(factory);
    originalTests(factory);
    derivedStreamTests(factory);
  });
}
