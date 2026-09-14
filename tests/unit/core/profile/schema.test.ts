import { describe, expect, it } from "vitest";
import {
  BlockIdSchema,
  BlockSchema,
  FIELD_LIMITS,
  HttpsUrlSchema,
  PublicMediaUrlSchema,
  MediaIdSchema,
  ProfileIdSchema,
  ProfileDocumentSchema,
  PublishedDocumentSchema,
  referencedMediaIds,
  ThemeSchema,
  type Block,
} from "@/core/profile/schema";
import { bio, BIO_ID, document, hero, without } from "./builders";

/** The dotted path of the first issue a failed parse reports. */
function firstIssuePath(input: unknown): string {
  const result = ProfileDocumentSchema.safeParse(input);
  if (result.success) throw new Error("expected the document to be rejected");
  return result.error.issues.map((issue) => issue.path.join(".")).join(" | ");
}

function blockWith(fields: Record<string, unknown>): Record<string, unknown> {
  return { id: "blockaaaaaac", ...fields };
}

describe("ProfileDocumentSchema top level", () => {
  it("accepts a minimal valid document unchanged", () => {
    const doc = document();
    expect(ProfileDocumentSchema.parse(doc)).toEqual(doc);
  });

  it("accepts every optional field", () => {
    const doc = document({ age: "3 years", sex: "female", tagline: "Loves sunbeams." });
    expect(ProfileDocumentSchema.parse(doc)).toEqual(doc);
  });

  it("requires schemaVersion 1 (a missing version is never coerced)", () => {
    expect(firstIssuePath(without(document(), "schemaVersion"))).toBe("schemaVersion");
    expect(firstIssuePath({ ...document(), schemaVersion: 2 })).toBe("schemaVersion");
    expect(firstIssuePath({ ...document(), schemaVersion: "1" })).toBe("schemaVersion");
  });

  it("requires id to be 8 chars of [a-z2-7]", () => {
    expect(firstIssuePath(document({ id: "kx3f7q2" }))).toBe("id");
    expect(firstIssuePath(document({ id: "kx3f7q2mm" }))).toBe("id");
    expect(firstIssuePath(document({ id: "kx3f7q1m" }))).toBe("id");
    expect(firstIssuePath(document({ id: "KX3F7Q2M" }))).toBe("id");
  });

  it("bounds name to 60 chars and allows it to be empty", () => {
    expect(ProfileDocumentSchema.parse(document({ name: "" })).name).toBe("");
    expect(ProfileDocumentSchema.parse(document({ name: "n".repeat(60) })).name).toHaveLength(60);
    expect(firstIssuePath(document({ name: "n".repeat(61) }))).toBe("name");
  });

  it("bounds age to 30 chars", () => {
    expect(ProfileDocumentSchema.parse(document({ age: "a".repeat(30) })).age).toHaveLength(30);
    expect(firstIssuePath(document({ age: "a".repeat(31) }))).toBe("age");
  });

  it("restricts sex to female, male or unknown", () => {
    expect(ProfileDocumentSchema.parse(document({ sex: "unknown" })).sex).toBe("unknown");
    expect(firstIssuePath({ ...document(), sex: "other" })).toBe("sex");
  });

  it("bounds tagline to 80 chars", () => {
    expect(ProfileDocumentSchema.parse(document({ tagline: "t".repeat(80) })).tagline).toHaveLength(
      80,
    );
    expect(firstIssuePath(document({ tagline: "t".repeat(81) }))).toBe("tagline");
  });

  it("requires updatedAt to be an ISO datetime", () => {
    expect(firstIssuePath(document({ updatedAt: "yesterday" }))).toBe("updatedAt");
  });
});

describe("ProfileDocumentSchema strictness", () => {
  it("requires theme to be present", () => {
    expect(firstIssuePath(without(document(), "theme"))).toBe("theme");
  });

  it("rejects an unknown top-level key", () => {
    expect(firstIssuePath({ ...document(), extra: true })).toBe("");
  });
});

describe("ProfileDocumentSchema blocks", () => {
  it("rejects zero blocks: the hero is mandatory (F1)", () => {
    expect(firstIssuePath(document({ blocks: [] }))).toBe("blocks.0");
  });

  it("requires the first block to be the hero", () => {
    expect(firstIssuePath(document({ blocks: [bio()] }))).toBe("blocks.0");
    expect(firstIssuePath(document({ blocks: [bio(), hero()] }))).toBe("blocks.0");
  });

  it("allows 30 blocks and rejects 31", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
    // The hero is always first; the rest are bio blocks with fresh ids after it.
    const blocks = (count: number): Block[] => [
      hero(),
      ...Array.from({ length: count - 1 }, (_, index) => ({
        id: `blockaaaaaa${alphabet.charAt(index + 1)}`,
        type: "bio" as const,
        content: { paragraphs: [] },
      })),
    ];
    expect(ProfileDocumentSchema.parse(document({ blocks: blocks(30) })).blocks).toHaveLength(30);
    expect(firstIssuePath(document({ blocks: blocks(31) }))).toBe("blocks");
  });

  it("rejects duplicate block ids, naming the repeated block", () => {
    const doc = document({ blocks: [hero(), bio(), bio()] });
    expect(firstIssuePath(doc)).toBe("blocks.2.id");
  });

  it("rejects a second hero block", () => {
    const doc = document({ blocks: [hero(), { ...hero(), id: BIO_ID }] });
    expect(firstIssuePath(doc)).toBe("blocks.1");
  });

  it("rejects an unknown block type", () => {
    const doc = { ...document(), blocks: [hero(), blockWith({ type: "carousel" })] };
    expect(firstIssuePath(doc)).toBe("blocks.1.type");
  });

  it("rejects a block id that is not 12 chars of [a-z2-7]", () => {
    const doc = { ...document(), blocks: [hero(), { ...bio(), id: "block-000001" }] };
    expect(firstIssuePath(doc)).toBe("blocks.1.id");
  });

  it("rejects an unknown key inside a block", () => {
    const doc = { ...document(), blocks: [hero(), { ...bio(), extra: 1 }] };
    expect(firstIssuePath(doc)).toBe("blocks.1");
  });
});

describe("ProfileDocumentSchema bio content strictness", () => {
  const withContent = (content: unknown) => ({
    ...document(),
    blocks: [hero(), { ...bio(), content }],
  });

  it("rejects an unknown key on a run", () => {
    const content = { paragraphs: [{ runs: [{ text: "x", weird: 1 }] }] };
    expect(firstIssuePath(withContent(content))).toBe("blocks.1.content.paragraphs.0.runs.0");
  });

  it("rejects an unknown key on a paragraph", () => {
    const content = { paragraphs: [{ runs: [{ text: "x" }], align: "left" }] };
    expect(firstIssuePath(withContent(content))).toBe("blocks.1.content.paragraphs.0");
  });

  it("rejects an unknown key on content", () => {
    const content = { paragraphs: [], html: "<b>x</b>" };
    expect(firstIssuePath(withContent(content))).toBe("blocks.1.content");
  });
});

const ok = (block: Record<string, unknown>) => BlockSchema.safeParse(blockWith(block)).success;

describe("BlockSchema media blocks", () => {
  it("hero and video take a media id or null", () => {
    expect(ok({ type: "hero", mediaId: null })).toBe(true);
    expect(ok({ type: "video", mediaId: "media2aa" })).toBe(true);
    expect(ok({ type: "hero" })).toBe(false);
    expect(ok({ type: "video", mediaId: "not-an-id" })).toBe(false);
  });

  it("bio takes rich text", () => {
    expect(ok({ type: "bio", content: { paragraphs: [{ runs: [{ text: "Hi." }] }] } })).toBe(true);
    expect(ok({ type: "bio", content: "plain string" })).toBe(false);
  });

  it("photo takes a media id and an optional caption of at most 200 chars", () => {
    expect(ok({ type: "photo", mediaId: null })).toBe(true);
    expect(ok({ type: "photo", mediaId: "media2aa", caption: "c".repeat(200) })).toBe(true);
    expect(ok({ type: "photo", mediaId: "media2aa", caption: "c".repeat(201) })).toBe(false);
  });

  it("gallery takes 0 to 12 media ids", () => {
    const ids = (count: number) => Array.from({ length: count }, () => "media2aa");
    expect(ok({ type: "gallery", mediaIds: [] })).toBe(true);
    expect(ok({ type: "gallery", mediaIds: ids(12) })).toBe(true);
    expect(ok({ type: "gallery", mediaIds: ids(13) })).toBe(false);
    expect(ok({ type: "gallery", mediaIds: [null] })).toBe(false);
  });
});

describe("BlockSchema day, needs and quote", () => {
  it("day takes exactly three scenes with captions of at most 120 chars", () => {
    const scene = (caption = "") => ({ mediaId: "media2aa", caption });
    expect(ok({ type: "day", scenes: [scene(), scene(), scene()] })).toBe(true);
    expect(ok({ type: "day", scenes: [{ mediaId: null, caption: "" }, scene(), scene()] })).toBe(
      true,
    );
    expect(ok({ type: "day", scenes: [scene(), scene()] })).toBe(false);
    expect(ok({ type: "day", scenes: [scene(), scene(), scene(), scene()] })).toBe(false);
    expect(ok({ type: "day", scenes: [scene("x".repeat(121)), scene(), scene()] })).toBe(false);
  });

  it("needs takes 1 to 3 cards with bounded title and text", () => {
    const card = (title = "Quiet", text = "A calm home.") => ({ title, text });
    expect(ok({ type: "needs", cards: [card()] })).toBe(true);
    expect(ok({ type: "needs", cards: [card(), card(), card()] })).toBe(true);
    expect(ok({ type: "needs", cards: [] })).toBe(false);
    expect(ok({ type: "needs", cards: [card(), card(), card(), card()] })).toBe(false);
    expect(ok({ type: "needs", cards: [card("t".repeat(61))] })).toBe(false);
    expect(ok({ type: "needs", cards: [card("Quiet", "t".repeat(241))] })).toBe(false);
  });

  it("quote takes a media id, text of at most 200 chars and an optional attribution", () => {
    expect(ok({ type: "quote", mediaId: null, text: "" })).toBe(true);
    expect(ok({ type: "quote", mediaId: "media2aa", text: "q", attribution: "a".repeat(60) })).toBe(
      true,
    );
    expect(ok({ type: "quote", mediaId: "media2aa", text: "q".repeat(201) })).toBe(false);
    expect(ok({ type: "quote", mediaId: "media2aa", text: "q", attribution: "a".repeat(61) })).toBe(
      false,
    );
  });
});

describe("ThemeSchema", () => {
  it("fills the defaults: paper, warmth 0.5, contrast 0.5", () => {
    expect(ThemeSchema.parse({})).toEqual({ preset: "paper", warmth: 0.5, contrast: 0.5 });
  });

  it("accepts every preset", () => {
    for (const preset of ["paper", "card", "night", "sand"]) {
      expect(ThemeSchema.parse({ preset }).preset).toBe(preset);
    }
  });

  it("rejects an unknown preset", () => {
    expect(ThemeSchema.safeParse({ preset: "neon" }).success).toBe(false);
  });

  it("bounds warmth and contrast to 0..1 inclusive", () => {
    expect(ThemeSchema.parse({ warmth: 0, contrast: 1 })).toMatchObject({ warmth: 0, contrast: 1 });
    expect(ThemeSchema.safeParse({ warmth: -0.01 }).success).toBe(false);
    expect(ThemeSchema.safeParse({ warmth: 1.01 }).success).toBe(false);
    expect(ThemeSchema.safeParse({ contrast: -1 }).success).toBe(false);
    expect(ThemeSchema.safeParse({ contrast: 2 }).success).toBe(false);
  });

  it("rejects an unknown key", () => {
    expect(ThemeSchema.safeParse({ accent: "#ff0000" }).success).toBe(false);
  });
});

describe("id and URL schemas", () => {
  it("MediaIdSchema and ProfileIdSchema accept 8 chars of [a-z2-7] only", () => {
    expect(MediaIdSchema.safeParse("media2aa").success).toBe(true);
    expect(MediaIdSchema.safeParse("media2a").success).toBe(false);
    expect(MediaIdSchema.safeParse("media0aa").success).toBe(false);
    expect(ProfileIdSchema.safeParse("kx3f7q2m").success).toBe(true);
    expect(ProfileIdSchema.safeParse("kx3f7q2").success).toBe(false);
  });

  it("BlockIdSchema accepts 12 chars of [a-z2-7] only", () => {
    expect(BlockIdSchema.safeParse("blockaaaaaaa").success).toBe(true);
    expect(BlockIdSchema.safeParse("block-000001").success).toBe(false);
    expect(BlockIdSchema.safeParse("blockaaaaaa").success).toBe(false);
  });

  it("accepts https and rejects http and other schemes", () => {
    expect(HttpsUrlSchema.safeParse("https://cdn.example.org/a.jpg").success).toBe(true);
    expect(HttpsUrlSchema.safeParse("http://cdn.example.org/a.jpg").success).toBe(false);
    expect(HttpsUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(HttpsUrlSchema.safeParse("https:not a url").success).toBe(false);
  });
});

describe("referencedMediaIds", () => {
  it("lists every referenced id once, in document order, skipping nulls", () => {
    const doc = document({
      blocks: [
        hero("media2ab"),
        { id: "blockaaaaaac", type: "photo", mediaId: null },
        { id: "blockaaaaaad", type: "gallery", mediaIds: ["media2ac", "media2ab"] },
        { id: "blockaaaaaae", type: "video", mediaId: "media2ad" },
        {
          id: "blockaaaaaaf",
          type: "day",
          scenes: [
            { mediaId: "media2ae", caption: "" },
            { mediaId: null, caption: "" },
            { mediaId: "media2ac", caption: "" },
          ],
        },
        { id: "blockaaaaaag", type: "needs", cards: [{ title: "t", text: "x" }] },
        { id: "blockaaaaaah", type: "quote", mediaId: "media2af", text: "q" },
        bio(),
      ],
    });
    expect(referencedMediaIds(doc)).toEqual([
      "media2ab",
      "media2ac",
      "media2ad",
      "media2ae",
      "media2af",
    ]);
  });

  it("returns an empty list for a document with no media", () => {
    expect(referencedMediaIds(document({ blocks: [bio()] }))).toEqual([]);
  });
});

const resolved = {
  kind: "photo",
  src: "https://cdn.example.org/a.jpg",
  alt: "A cat.",
  focal: { x: 50, y: 50 },
  width: 1600,
  height: 1200,
};

/** A published copy of {@link document} whose manifest covers its one referenced id. */
function published() {
  return {
    ...document(),
    publishedAt: "2026-09-11T09:00:00.000Z",
    slug: "charlotte",
    media: { media2aa: resolved },
  };
}

describe("PublishedDocumentSchema", () => {
  it("accepts a document whose manifest covers every referenced id", () => {
    expect(PublishedDocumentSchema.safeParse(published()).success).toBe(true);
  });

  it("bounds slug to [a-z0-9-]{1,40}", () => {
    expect(PublishedDocumentSchema.safeParse({ ...published(), slug: "" }).success).toBe(false);
    expect(PublishedDocumentSchema.safeParse({ ...published(), slug: "Charlotte" }).success).toBe(
      false,
    );
    expect(
      PublishedDocumentSchema.safeParse({ ...published(), slug: "a".repeat(41) }).success,
    ).toBe(false);
  });

  it("rejects a manifest key that is not a media id", () => {
    const doc = { ...published(), media: { ...published().media, "not-an-id": resolved } };
    expect(PublishedDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a video block whose manifest entry is not a video", () => {
    const doc = {
      ...published(),
      blocks: [hero(), { id: "blockaaaaaac", type: "video", mediaId: "media2aa" }],
    };
    const result = PublishedDocumentSchema.safeParse(doc);
    if (result.success) throw new Error("expected the document to be rejected");
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["media.media2aa"]);
  });

  it("still enforces the draft rules (unknown key, duplicate ids)", () => {
    expect(PublishedDocumentSchema.safeParse({ ...published(), extra: 1 }).success).toBe(false);
    const doc = { ...published(), blocks: [bio(), bio()] };
    expect(PublishedDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe("ResolvedMediaSchema entries", () => {
  it("accepts a video entry with poster and durationSeconds", () => {
    const video = {
      ...resolved,
      kind: "video",
      src: "https://cdn.example.org/a.mp4",
      poster: "https://cdn.example.org/a.jpg",
      durationSeconds: 8.5,
    };
    const doc = { ...published(), media: { media2aa: video } };
    expect(PublishedDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects an http poster and out-of-range focal points", () => {
    const withPoster = { ...resolved, poster: "http://cdn.example.org/a.jpg" };
    expect(
      PublishedDocumentSchema.safeParse({ ...published(), media: { media2aa: withPoster } })
        .success,
    ).toBe(false);
    const badFocal = { ...resolved, focal: { x: 101, y: 50 } };
    expect(
      PublishedDocumentSchema.safeParse({ ...published(), media: { media2aa: badFocal } }).success,
    ).toBe(false);
  });
});

describe("FIELD_LIMITS", () => {
  it("is the one place the text caps live: each limit is exactly where the schema refuses", () => {
    expect(FIELD_LIMITS).toEqual({
      name: 60,
      age: 30,
      tagline: 80,
      caption: 200,
      sceneCaption: 120,
      cardTitle: 60,
      cardText: 240,
      quoteText: 200,
      attribution: 60,
      galleryPhotos: 12,
    });
    expect(firstIssuePath(document({ name: "n".repeat(FIELD_LIMITS.name + 1) }))).toBe("name");
    expect(firstIssuePath(document({ age: "a".repeat(FIELD_LIMITS.age + 1) }))).toBe("age");
    expect(firstIssuePath(document({ tagline: "t".repeat(FIELD_LIMITS.tagline + 1) }))).toBe(
      "tagline",
    );
  });
});

describe("PublicMediaUrlSchema", () => {
  it("accepts an https URL and a root-relative /media path in the layout's grammar", () => {
    expect(PublicMediaUrlSchema.safeParse("https://cdn.example.org/a.jpg").success).toBe(true);
    expect(
      PublicMediaUrlSchema.safeParse("/media/profiles/kx3f7q2m/media/media2ax/clean.a1b2c3d4e5.jpg")
        .success,
    ).toBe(true);
    expect(
      PublicMediaUrlSchema.safeParse("/media/profiles/kx3f7q2m/media/media2ax/web.a1b2c3d4e5.mp4")
        .success,
    ).toBe(true);
  });

  it("rejects an http: URL, a path outside the grammar and other schemes", () => {
    expect(PublicMediaUrlSchema.safeParse("http://cdn.example.org/a.jpg").success).toBe(false);
    expect(PublicMediaUrlSchema.safeParse("/media/../etc/passwd").success).toBe(false);
    expect(PublicMediaUrlSchema.safeParse("/uploads/a.jpg").success).toBe(false);
    expect(PublicMediaUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});
