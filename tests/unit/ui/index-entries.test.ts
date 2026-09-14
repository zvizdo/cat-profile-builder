import { describe, expect, it } from "vitest";
import type { PublishedRow } from "@/core/ports";
import type { ResolvedMedia } from "@/core/profile/schema";
import { indexEntries } from "@/ui/profile/index-entries";
import { bio, document, gallery, hero, video } from "../core/profile/builders";

// F1: every document has a hero block; "no hero photo" is `hero(null)`, not a missing block.

// The public index's rows (FR-090): one per live cat from `listPublished()`, most recently
// published first, each with the address, the name, the display line and one photo from
// the manifest — the hero's, else the first photo the page references, else none.

const PHOTO: ResolvedMedia = {
  kind: "photo",
  src: "https://cdn.test/profiles/kx3f7q2m/media/media2aa/clean.a1b2c3d4e5.jpg",
  alt: "Charlotte on a windowsill.",
  focal: { x: 62, y: 40 },
  width: 2560,
  height: 1920,
};
const OTHER: ResolvedMedia = { ...PHOTO, alt: "Charlotte asleep." };
const CLIP: ResolvedMedia = {
  kind: "video",
  src: "https://cdn.test/profiles/kx3f7q2m/media/video2aa/web.e5f6a7b8c9.mp4",
  alt: "Rain.",
  focal: { x: 50, y: 50 },
  width: 1080,
  height: 1920,
};

function row(
  pid: string,
  publishedAt: string,
  overrides: Parameters<typeof document>[0] = {},
  media: Record<string, ResolvedMedia> = { media2aa: PHOTO },
): PublishedRow {
  const doc = document({ id: pid, ...overrides });
  return { pid, doc: { ...doc, publishedAt, slug: doc.name.toLowerCase(), media } };
}

describe("indexEntries", () => {
  it("orders most recently published first and takes the hero's photo", () => {
    const rows = [
      row("aaaaaaaa", "2026-09-01T00:00:00.000Z", { tagline: "Old." }),
      row("bbbbbbbb", "2026-09-10T00:00:00.000Z", { name: "Milo", blocks: [hero(), bio("Naps.")] }),
    ];
    expect(indexEntries(rows)).toEqual([
      { href: "/cats/milo-bbbbbbbb", name: "Milo", line: "Naps.", photo: PHOTO },
      { href: "/cats/charlotte-aaaaaaaa", name: "Charlotte", line: "Old.", photo: PHOTO },
    ]);
  });

  it("falls back to the first photo the page references, skipping clips, else none", () => {
    const noHeroPhoto = row(
      "cccccccc",
      "2026-09-02T00:00:00.000Z",
      { blocks: [hero(null), video("video2aa"), gallery(["media2ab", "media2aa"])] },
      { video2aa: CLIP, media2ab: OTHER, media2aa: PHOTO },
    );
    const onlyClip = row(
      "dddddddd",
      "2026-09-03T00:00:00.000Z",
      { blocks: [hero(null), video("video2aa")] },
      { video2aa: CLIP },
    );
    expect(indexEntries([noHeroPhoto, onlyClip]).map((entry) => entry.photo)).toEqual([
      null,
      OTHER,
    ]);
  });

  it("throws on a stored copy that fails its schema rather than rendering part of it", () => {
    expect(() => indexEntries([{ pid: "eeeeeeee", doc: { schemaVersion: 1 } }])).toThrow();
  });
});
