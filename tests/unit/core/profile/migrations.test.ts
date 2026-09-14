import { describe, expect, it } from "vitest";
import { ProfileInvalidError } from "@/core/errors";
import {
  CURRENT_SCHEMA_VERSION,
  loadProfile,
  loadPublished,
  migrate,
} from "@/core/profile/migrations";
import { bio, document, hero, without } from "./builders";

describe("migrate", () => {
  it("is the identity at the current version", () => {
    const doc = document();
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(migrate(doc)).toBe(doc);
  });

  it("rejects a document newer than this app", () => {
    expect(() => migrate({ ...document(), schemaVersion: 2 })).toThrow(ProfileInvalidError);
    expect(() => migrate({ ...document(), schemaVersion: 2 })).toThrow("newer");
  });

  it("passes its own 'newer' message through loadProfile unchanged", () => {
    expect(() => loadProfile({ ...document(), schemaVersion: 2 })).toThrow(
      /^This profile was saved by a version newer than this app/,
    );
  });

  it("re-words a missing schemaVersion through loadProfile", () => {
    expect(() => loadProfile(without(document(), "schemaVersion"))).toThrow(
      "This profile couldn't be read: schemaVersion",
    );
  });

  it("rejects a document with no schemaVersion instead of assuming one", () => {
    expect(() => migrate(without(document(), "schemaVersion"))).toThrow(ProfileInvalidError);
    expect(() => migrate(without(document(), "schemaVersion"))).toThrow("schemaVersion");
  });

  it("rejects a schemaVersion that is not a number", () => {
    expect(() => migrate({ ...document(), schemaVersion: "1" })).toThrow(ProfileInvalidError);
  });

  it("rejects input that is not an object", () => {
    expect(() => migrate(null)).toThrow(ProfileInvalidError);
    expect(() => migrate("{}")).toThrow(ProfileInvalidError);
  });
});

describe("loadProfile", () => {
  it("migrates then parses a valid document", () => {
    const doc = document();
    expect(loadProfile(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("throws ProfileInvalidError naming the issue path", () => {
    const doc = document({
      blocks: [hero(), { id: "blockaaaaaac", type: "day", scenes: [] }, bio()],
    });
    let caught: unknown;
    try {
      loadProfile(doc);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProfileInvalidError);
    if (!(caught instanceof ProfileInvalidError)) throw new Error("unreachable");
    expect(caught.message).toBe("This profile couldn't be read: blocks.1.scenes");
    expect(caught.issues).toEqual([{ path: "blocks.1.scenes", message: expect.any(String) }]);
    expect(caught.cause).toBeInstanceOf(ProfileInvalidError);
    expect(caught.code).toBe("invalid");
    expect(caught.status).toBe(400);
  });

  // F1 (Checkpoint 2, waiver of constitution Principle VI): the hero-at-`blocks[0]` rule
  // is a v1 refinement, not a schema bump — no stored document predates it, so one that
  // fails it is simply invalid, the same way any other broken document is (FR-018).
  it("denies a v1 document with no hero, or with the hero not first", () => {
    const noHero = document({ blocks: [bio()] });
    expect(() => loadProfile(noHero)).toThrow(ProfileInvalidError);
    expect(() => loadProfile(noHero)).toThrow("This profile couldn't be read: blocks.0");

    const heroNotFirst = document({ blocks: [bio(), hero()] });
    expect(() => loadProfile(heroNotFirst)).toThrow(ProfileInvalidError);
    expect(() => loadProfile(heroNotFirst)).toThrow("This profile couldn't be read: blocks.0");
  });
});

describe("loadPublished", () => {
  const published = {
    ...document({ blocks: [hero(), bio("A cat.")] }),
    publishedAt: "2026-09-10T12:00:00.000Z",
    slug: "charlotte",
    media: {
      media2aa: {
        kind: "photo",
        src: "https://storage.googleapis.com/bucket/profiles/kx3f7q2m/media/media2aa/clean.0123456789.jpg",
        alt: "A tabby on a sill.",
        focal: { x: 50, y: 50 },
        width: 1600,
        height: 1200,
      },
    },
  };

  it("migrates then parses a valid published document", () => {
    expect(loadPublished(JSON.parse(JSON.stringify(published)))).toEqual(published);
  });

  it("refuses a published document whose manifest misses a referenced id", () => {
    expect(() => loadPublished({ ...published, media: {} })).toThrow(
      "This profile couldn't be read: media.media2aa",
    );
  });

  it("refuses a draft (no publishedAt, slug or media) rather than rendering it", () => {
    expect(() => loadPublished(document())).toThrow(ProfileInvalidError);
    expect(() => loadPublished(document())).toThrow(/^This profile couldn't be read: /);
  });

  it("passes the 'newer than this app' message through unchanged", () => {
    expect(() => loadPublished({ ...published, schemaVersion: 2 })).toThrow(
      /^This profile was saved by a version newer than this app/,
    );
  });
});
