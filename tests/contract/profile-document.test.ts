import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProfileInvalidError } from "@/core/errors";
import { resolveManifest } from "@/core/media/manifest";
import { loadAsset, migrateAsset } from "@/core/media/migrations";
import { MediaAssetSchema, type MediaAsset } from "@/core/media/schema";
import { loadProfile, migrate } from "@/core/profile/migrations";
import {
  ProfileDocumentSchema,
  PublishedDocumentSchema,
  referencedMediaIds,
  type ProfileDocument,
} from "@/core/profile/schema";

// Contract: specs/001-cat-profile-builder/contracts/profile-document.md. Guarantees 1–7 and
// the manifest resolver are covered here; readiness and the display line belong to T010 (see
// the `it.todo` markers at the bottom).

const FIXTURE = new URL("../fixtures/maximal-document.json", import.meta.url);
const PHOTO_FIXTURE = new URL("../fixtures/maximal-asset-photo.json", import.meta.url);
const VIDEO_FIXTURE = new URL("../fixtures/maximal-asset-video.json", import.meta.url);

/** The maximal fixture as raw JSON — `unknown`, as it arrives from storage. */
function fixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE, "utf8"));
}

const ASSET_KINDS: Array<"photo" | "video"> = ["photo", "video"];

/** One of the two maximal media records as raw JSON — `unknown`, as it arrives from storage. */
function assetFixture(kind: "photo" | "video"): unknown {
  return JSON.parse(readFileSync(kind === "photo" ? PHOTO_FIXTURE : VIDEO_FIXTURE, "utf8"));
}

/** A deep copy of the parsed fixture, ready to be broken one field at a time. */
function maximal(): ProfileDocument {
  return ProfileDocumentSchema.parse(fixture());
}

function rejects(input: unknown): string {
  const result = ProfileDocumentSchema.safeParse(input);
  if (result.success) throw new Error("expected the document to be rejected");
  return result.error.issues.map((issue) => issue.path.join(".")).join(" | ");
}

/** `value` with one top-level key removed, the way a broken stored document would arrive. */
function without(value: object, key: string): unknown {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function block(doc: ProfileDocument, type: ProfileDocument["blocks"][number]["type"]) {
  const found = doc.blocks.find((candidate) => candidate.type === type);
  if (!found) throw new Error(`fixture has no ${type} block`);
  return found;
}

describe("round-trip (guarantee 5)", () => {
  it("the maximal fixture validates", () => {
    expect(ProfileDocumentSchema.safeParse(fixture()).success).toBe(true);
  });

  it("serialize → load → validate is deep-equal", () => {
    const parsed = maximal();
    const reloaded = loadProfile(JSON.parse(JSON.stringify(parsed)));
    expect(reloaded).toEqual(parsed);
  });

  it("the fixture exercises every block type and every optional field", () => {
    const parsed = maximal();
    const types = new Set(parsed.blocks.map((candidate) => candidate.type));
    expect([...types].sort()).toEqual(
      ["bio", "day", "gallery", "hero", "needs", "photo", "quote", "video"].sort(),
    );
    expect(parsed.age).toBeDefined();
    expect(parsed.sex).toBeDefined();
    expect(parsed.tagline).toBeDefined();
  });
});

describe("rejections at the document level (guarantee 3)", () => {
  it("unknown block type", () => {
    const doc = maximal();
    const broken = { ...doc, blocks: [{ ...doc.blocks[0], type: "banner" }] };
    expect(rejects(broken)).toBe("blocks.0.type");
  });

  it("duplicate block ids", () => {
    const doc = maximal();
    const second = doc.blocks[1];
    if (!second) throw new Error("fixture has fewer than two blocks");
    const broken = { ...doc, blocks: [doc.blocks[0], { ...second, id: doc.blocks[0]?.id }] };
    expect(rejects(broken)).toBe("blocks.1.id");
  });

  it("warmth out of range", () => {
    const doc = maximal();
    expect(rejects({ ...doc, theme: { ...doc.theme, warmth: 1.5 } })).toBe("theme.warmth");
    expect(rejects({ ...doc, theme: { ...doc.theme, warmth: -0.5 } })).toBe("theme.warmth");
  });

  it("href with a javascript: scheme", () => {
    const doc = maximal();
    const bio = block(doc, "bio");
    if (bio.type !== "bio") throw new Error("unreachable");
    const content = { paragraphs: [{ runs: [{ text: "x", href: "javascript:alert(1)" }] }] };
    const broken = { ...doc, blocks: [doc.blocks[0], { ...bio, content }] };
    expect(rejects(broken)).toBe("blocks.1.content.paragraphs.0.runs.0.href");
  });

  it("a document without schemaVersion", () => {
    expect(rejects(without(maximal(), "schemaVersion"))).toBe("schemaVersion");
    expect(() => loadProfile(without(maximal(), "schemaVersion"))).toThrow(ProfileInvalidError);
  });

  it("a document with version 2", () => {
    expect(rejects({ ...maximal(), schemaVersion: 2 })).toBe("schemaVersion");
    expect(() => loadProfile({ ...maximal(), schemaVersion: 2 })).toThrow("newer than this app");
  });

  it("a tagline over 80 characters", () => {
    expect(rejects({ ...maximal(), tagline: "t".repeat(81) })).toBe("tagline");
  });

  it("a document whose first block is not the hero (F1: the hero is mandatory and fixed at the top)", () => {
    const doc = maximal();
    const bio = block(doc, "bio");
    const withoutHero = { ...doc, blocks: doc.blocks.filter((b) => b.type !== "hero") };
    expect(rejects(withoutHero)).toBe("blocks.0");
    expect(() => loadProfile(withoutHero)).toThrow("This profile couldn't be read: blocks.0");

    const heroNotFirst = { ...doc, blocks: [bio, ...doc.blocks.filter((b) => b !== bio)] };
    expect(rejects(heroNotFirst)).toBe("blocks.0");
  });
});

describe("rejections inside blocks (guarantee 3)", () => {
  it("a day block without exactly three scenes", () => {
    const doc = maximal();
    const day = block(doc, "day");
    if (day.type !== "day") throw new Error("unreachable");
    const [first, second] = day.scenes;
    expect(rejects({ ...doc, blocks: [doc.blocks[0], { ...day, scenes: [first, second] }] })).toBe(
      "blocks.1.scenes",
    );
    expect(
      rejects({ ...doc, blocks: [doc.blocks[0], { ...day, scenes: [...day.scenes, first] }] }),
    ).toBe("blocks.1.scenes");
  });

  it("a needs block with zero or four cards", () => {
    const doc = maximal();
    const needs = block(doc, "needs");
    if (needs.type !== "needs") throw new Error("unreachable");
    expect(rejects({ ...doc, blocks: [doc.blocks[0], { ...needs, cards: [] }] })).toBe(
      "blocks.1.cards",
    );
    const four = [...needs.cards, needs.cards[0]];
    expect(rejects({ ...doc, blocks: [doc.blocks[0], { ...needs, cards: four }] })).toBe(
      "blocks.1.cards",
    );
  });

  it("a parse failure is a ProfileInvalidError carrying the issue path", () => {
    const doc = maximal();
    const day = block(doc, "day");
    let caught: unknown;
    try {
      loadProfile({ ...doc, blocks: [doc.blocks[0], doc.blocks[1], { ...day, scenes: [] }] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProfileInvalidError);
    if (!(caught instanceof ProfileInvalidError)) throw new Error("unreachable");
    expect(caught.message).toBe("This profile couldn't be read: blocks.2.scenes");
    expect(caught.issues.map((issue) => issue.path)).toEqual(["blocks.2.scenes"]);
  });
});

describe("migration (guarantee 4)", () => {
  it("is the identity at v1 and the result validates", () => {
    const raw = fixture();
    const migrated = migrate(raw);
    expect(migrated).toBe(raw);
    expect(migrated).toEqual(fixture());
    expect(ProfileDocumentSchema.safeParse(migrated).success).toBe(true);
  });
});

describe("media records (guarantee 7)", () => {
  it.each(ASSET_KINDS)("the maximal %s fixture validates", (kind) => {
    expect(MediaAssetSchema.safeParse(assetFixture(kind)).success).toBe(true);
  });

  it("the photo fixture exercises enhancement, alt, a non-default focal and a clean revision", () => {
    const photo = MediaAssetSchema.parse(assetFixture("photo"));
    expect(photo.kind).toBe("photo");
    expect(photo.enhancement).toBeDefined();
    expect(photo.alt).not.toBeNull();
    expect(photo.focal).not.toEqual({ x: 50, y: 50 });
    expect(photo.revisions.clean).toBeDefined();
  });

  it("the video fixture exercises trim, both durations, web and poster revisions", () => {
    const video = MediaAssetSchema.parse(assetFixture("video"));
    expect(video.kind).toBe("video");
    expect(video.trim).toBeDefined();
    expect(video.originalDurationSeconds).toBeDefined();
    expect(video.durationSeconds).toBeDefined();
    expect(video.revisions.web).toBeDefined();
    expect(video.revisions.poster).toBeDefined();
  });

  it.each(ASSET_KINDS)(
    "migrateAsset is the identity at v1 for the %s fixture and the result re-validates",
    (kind) => {
      const raw = assetFixture(kind);
      const migrated = migrateAsset(raw);
      expect(migrated).toBe(raw);
      expect(migrated).toEqual(assetFixture(kind));
      expect(MediaAssetSchema.safeParse(migrated).success).toBe(true);
    },
  );

  it.each(ASSET_KINDS)("serialize → loadAsset → validate is deep-equal (%s)", (kind) => {
    const parsed = MediaAssetSchema.parse(assetFixture(kind));
    expect(loadAsset(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("rejects a record without schemaVersion, and one with version 2 as newer", () => {
    expect(MediaAssetSchema.safeParse(without(maximalPhoto(), "schemaVersion")).success).toBe(
      false,
    );
    expect(() => loadAsset(without(maximalPhoto(), "schemaVersion"))).toThrow(ProfileInvalidError);
    expect(MediaAssetSchema.safeParse({ ...maximalPhoto(), schemaVersion: 2 }).success).toBe(false);
    expect(() => loadAsset({ ...maximalPhoto(), schemaVersion: 2 })).toThrow("newer than this app");
  });
});

/** The parsed photo fixture, ready to be broken one field at a time. */
function maximalPhoto(): MediaAsset {
  return MediaAssetSchema.parse(assetFixture("photo"));
}

/** A manifest entry for `id`, shaped as the publish step would resolve it. */
function resolved(kind: "photo" | "video", id: string) {
  return {
    kind,
    src: `https://cdn.example.org/${id}.${kind === "photo" ? "jpg" : "mp4"}`,
    ...(kind === "video"
      ? { poster: `https://cdn.example.org/${id}.jpg`, durationSeconds: 8 }
      : {}),
    alt: `Charlotte, ${id}.`,
    focal: { x: 50, y: 50 },
    width: 1600,
    height: 1200,
  };
}

/** The maximal fixture as published: every referenced id resolved into the manifest. */
function published() {
  const doc = maximal();
  const videoIds = new Set(
    doc.blocks.flatMap((candidate) => (candidate.type === "video" ? [candidate.mediaId] : [])),
  );
  const media = Object.fromEntries(
    referencedMediaIds(doc).map((id) => [id, resolved(videoIds.has(id) ? "video" : "photo", id)]),
  );
  return { ...doc, publishedAt: "2026-09-11T09:00:00.000Z", slug: "charlotte", media };
}

describe("manifest (guarantee 6)", () => {
  it("PublishedDocument round-trips", () => {
    const parsed = PublishedDocumentSchema.parse(published());
    expect(PublishedDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(Object.keys(parsed.media).sort()).toEqual(referencedMediaIds(parsed).sort());
  });

  it("rejects a manifest missing an id the blocks reference", () => {
    const doc = published();
    const media = without(doc.media, "media2ab");
    const result = PublishedDocumentSchema.safeParse({ ...doc, media });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["media.media2ab"]);
  });

  it("rejects a manifest entry whose src is an absolute http: URL; a /media path is accepted", () => {
    const doc = published();
    const entry = doc.media.media2aa;
    if (!entry) throw new Error("fixture does not reference media2aa");
    const media = { ...doc.media, media2aa: { ...entry, src: "http://cdn.example.org/a.jpg" } };
    const result = PublishedDocumentSchema.safeParse({ ...doc, media });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "media.media2aa.src",
    ]);
    const local = "/media/profiles/kx3f7q2m/media/media2aa/clean.a1b2c3d4e5.jpg";
    const accepted = { ...doc.media, media2aa: { ...entry, src: local } };
    expect(PublishedDocumentSchema.safeParse({ ...doc, media: accepted }).success).toBe(true);
  });

  it("rejects a video block whose manifest entry is a photo", () => {
    const doc = published();
    const video = block(doc, "video");
    if (video.type !== "video" || video.mediaId === null) throw new Error("unreachable");
    const entry = doc.media[video.mediaId];
    if (!entry) throw new Error("manifest lacks the video id");
    const media = { ...doc.media, [video.mediaId]: { ...entry, kind: "photo" } };
    const result = PublishedDocumentSchema.safeParse({ ...doc, media });
    if (result.success) throw new Error("expected the document to be rejected");
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      `media.${video.mediaId}`,
    ]);
  });
});

describe("manifest resolver (guarantee 6, ADR-015)", () => {
  it("resolveManifest(doc, assets) covers exactly the referenced ids and nothing else", () => {
    const doc = maximal();
    const videoIds = new Set(
      doc.blocks.flatMap((candidate) => (candidate.type === "video" ? [candidate.mediaId] : [])),
    );
    const photo = MediaAssetSchema.parse(assetFixture("photo"));
    const video = MediaAssetSchema.parse(assetFixture("video"));
    const referenced = referencedMediaIds(doc).map((id) =>
      videoIds.has(id) ? { ...video, id } : { ...photo, id },
    );
    const unreferenced = [
      { ...photo, id: "media2ax" },
      { ...video, id: "media2ay" },
    ];
    const media = resolveManifest(doc, [...referenced, ...unreferenced], {
      publicUrl: (pid, mid, kind, rev) => `https://cdn.example.org/${pid}/${mid}/${kind}.${rev}`,
    });
    expect(Object.keys(media).sort()).toEqual(referencedMediaIds(doc).sort());
    const parsed = PublishedDocumentSchema.parse({
      ...doc,
      publishedAt: "2026-09-11T09:00:00.000Z",
      slug: "charlotte",
      media,
    });
    for (const id of videoIds) {
      if (id === null) throw new Error("fixture has an empty video slot");
      expect(parsed.media[id]?.kind).toBe("video");
      expect(parsed.media[id]?.poster).toBeDefined();
      expect(parsed.media[id]?.durationSeconds).toBe(9);
    }
  });
});

describe("readiness and display line", () => {
  it.todo("T010: checkReadiness returns the exact strings in data-model.md for each missing item");
  it.todo("T010: checkReadiness applies the 15-second clip rule");
  it.todo("T010: displayLine returns the tagline, else the bio's first sentence, else empty");
});
