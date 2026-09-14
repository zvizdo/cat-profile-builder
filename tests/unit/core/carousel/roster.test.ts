import { describe, expect, it } from "vitest";
import { document, hero, video } from "../profile/builders";
import type { PublishedDocument, ResolvedMedia } from "@/core/profile/schema";
import {
  buildRoster,
  clipWindow,
  pickMedia,
  RosterResponseSchema,
  type CarouselCat,
} from "@/core/carousel/roster";

// The carousel roster (FR-059, FR-061, FR-084; contracts/server-boundary.md → `GET
// /api/carousel`): what a visitor's browser receives, built from validated published
// documents. No id beyond the address, no draft content, no cap on the count.

const PHOTO: ResolvedMedia = {
  kind: "photo",
  src: "https://cdn.test/profiles/kx3f7q2m/media/media2aa/clean.a1b2c3d4e5.jpg",
  alt: "Charlotte on a windowsill.",
  focal: { x: 62, y: 40 },
  width: 2560,
  height: 1920,
};
const CLIP: ResolvedMedia = {
  kind: "video",
  src: "https://cdn.test/profiles/kx3f7q2m/media/video2aa/web.e5f6a7b8c9.mp4",
  poster: "https://cdn.test/profiles/kx3f7q2m/media/video2aa/poster.0123456789.jpg",
  alt: "Rain on the window.",
  focal: { x: 50, y: 50 },
  width: 1080,
  height: 1920,
  durationSeconds: 15,
};

const BASE_URL = "https://cats.example.org";

/** A published document, defaulting to one photo behind the hero. */
function published(overrides: Partial<PublishedDocument> = {}): PublishedDocument {
  return {
    ...document({ age: "3 years", sex: "female", tagline: "Loves a sunbeam." }),
    publishedAt: "2026-09-01T00:00:00.000Z",
    slug: "charlotte",
    media: { media2aa: PHOTO },
    ...overrides,
  };
}

describe("buildRoster", () => {
  it("orders most recently published first", () => {
    const older = published({ id: "aaaaaaaa", publishedAt: "2026-09-01T00:00:00.000Z" });
    const newer = published({
      id: "bbbbbbbb",
      name: "Milo",
      blocks: [hero()],
      publishedAt: "2026-09-10T00:00:00.000Z",
      slug: "milo",
    });
    const roster = buildRoster([older, newer], BASE_URL);
    expect(roster.map((cat) => cat.name)).toEqual(["Milo", "Charlotte"]);
  });

  it("never skips a single-photo, no-video cat", () => {
    const [cat] = buildRoster([published()], BASE_URL);
    expect(cat).toMatchObject({
      url: `${BASE_URL}/cats/charlotte-kx3f7q2m`,
      name: "Charlotte",
      line: "Loves a sunbeam.",
      age: "3 years",
      sex: "female",
      photos: [{ src: PHOTO.src, alt: PHOTO.alt, focal: PHOTO.focal }],
    });
    expect(cat?.video).toBeUndefined();
  });

  it("omits age and sex when the document has neither", () => {
    const doc = published({ age: undefined, sex: undefined });
    const [cat] = buildRoster([doc], BASE_URL);
    expect(cat).not.toHaveProperty("age");
    expect(cat).not.toHaveProperty("sex");
  });

  it("omits age when it is whitespace-only or empty rather than sending it blank", () => {
    const whitespace = published({ id: "aaaaaaaa", slug: "a", age: "   " });
    const empty = published({ id: "bbbbbbbb", slug: "b", age: "" });
    for (const doc of [whitespace, empty]) {
      const [cat] = buildRoster([doc], BASE_URL);
      expect(cat).not.toHaveProperty("age");
    }
  });

  it("caps photos at five, hero first, and carries the clip separately", () => {
    const ids = ["media2aa", "media2ab", "media2ac", "media2ad", "media2ae", "media2af"];
    const media: Record<string, ResolvedMedia> = Object.fromEntries(
      ids.map((id, i) => [id, { ...PHOTO, src: `${PHOTO.src}#${i}` }]),
    );
    media.video2aa = CLIP;
    const doc = published({
      blocks: [
        hero("media2aa"),
        { id: "blockaaaaaab", type: "gallery", mediaIds: ids.slice(1) },
        video(),
      ],
      media,
    });
    const [cat] = buildRoster([doc], BASE_URL);
    expect(cat?.photos).toHaveLength(5);
    expect(cat?.photos[0]?.src).toBe(`${PHOTO.src}#0`);
    expect(cat?.video).toEqual({
      src: CLIP.src,
      poster: CLIP.poster,
      alt: CLIP.alt,
      durationSeconds: 15,
    });
  });

  it("carries a clip with no poster (ADR-006: extraction can fail; the video still publishes)", () => {
    const clipWithoutPoster: ResolvedMedia = {
      kind: "video",
      src: CLIP.src,
      alt: CLIP.alt,
      focal: CLIP.focal,
      width: CLIP.width,
      height: CLIP.height,
      durationSeconds: CLIP.durationSeconds,
    };
    const doc = published({
      blocks: [hero(), video()],
      media: { media2aa: PHOTO, video2aa: clipWithoutPoster },
    });
    const [cat] = buildRoster([doc], BASE_URL);
    expect(cat?.video).toEqual({
      src: CLIP.src,
      alt: CLIP.alt,
      durationSeconds: 15,
    });
    expect(cat?.video).not.toHaveProperty("poster");
  });

  it("has no ids beyond the url and no draft field", () => {
    const [cat] = buildRoster([published()], BASE_URL);
    const keys = Object.keys(cat ?? {});
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("pid");
    expect(keys).not.toContain("draft");
  });

  it("returns sixty profiles as sixty", () => {
    const docs = Array.from({ length: 60 }, (_, i) =>
      published({
        id: `cat${String(i).padStart(5, "0")}`,
        slug: `cat-${i}`,
        publishedAt: `2026-09-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      }),
    );
    expect(buildRoster(docs, BASE_URL)).toHaveLength(60);
  });
});

describe("pickMedia", () => {
  const PHOTO_ONE: CarouselCat["photos"][number] = { src: "a", alt: "a", focal: { x: 50, y: 50 } };
  const PHOTO_TWO: CarouselCat["photos"][number] = { src: "b", alt: "b", focal: { x: 50, y: 50 } };
  const CLIP_ONE: NonNullable<CarouselCat["video"]> = { src: "c", alt: "c", durationSeconds: 15 };

  it("shows a single photo on every loop", () => {
    const cat: CarouselCat = { url: "u", name: "n", line: "l", photos: [PHOTO_ONE] };
    expect(pickMedia(cat, 0)).toEqual({ kind: "photo", photo: PHOTO_ONE });
    expect(pickMedia(cat, 1)).toEqual({ kind: "photo", photo: PHOTO_ONE });
    expect(pickMedia(cat, 7)).toEqual({ kind: "photo", photo: PHOTO_ONE });
  });

  it("cycles through photos then the clip, wrapping", () => {
    const cat: CarouselCat = {
      url: "u",
      name: "n",
      line: "l",
      photos: [PHOTO_ONE, PHOTO_TWO],
      video: CLIP_ONE,
    };
    expect(pickMedia(cat, 0)).toEqual({ kind: "photo", photo: PHOTO_ONE });
    expect(pickMedia(cat, 1)).toEqual({ kind: "photo", photo: PHOTO_TWO });
    expect(pickMedia(cat, 2)).toEqual({ kind: "video", video: CLIP_ONE });
    expect(pickMedia(cat, 3)).toEqual({ kind: "photo", photo: PHOTO_ONE });
  });
});

describe("clipWindow", () => {
  it("shows a 15s clip's first 8 seconds at the default hold", () => {
    expect(clipWindow(15, 8)).toEqual({ start: 0, end: 8 });
  });

  it("caps the window at the clip's own length when it is shorter than the hold", () => {
    expect(clipWindow(5, 8)).toEqual({ start: 0, end: 5 });
  });

  it("caps the window at a longer hold too", () => {
    expect(clipWindow(15, 20)).toEqual({ start: 0, end: 15 });
  });
});

describe("RosterResponseSchema — what the kiosk's poll accepts (FR-066)", () => {
  const cat: CarouselCat = {
    url: "https://cats.example.org/cats/charlotte-kx3f7q2m",
    name: "Charlotte",
    line: "A negotiator, not a complainer.",
    age: "3 years",
    sex: "female",
    photos: [{ src: PHOTO.src, alt: PHOTO.alt, focal: PHOTO.focal }],
    video: { src: CLIP.src, poster: CLIP.poster, alt: CLIP.alt, durationSeconds: 15 },
  };

  it("accepts exactly what GET /api/carousel answers, with the optional facts and clip absent or present", () => {
    const bare: CarouselCat = { url: cat.url, name: cat.name, line: cat.line, photos: cat.photos };
    expect(RosterResponseSchema.parse({ cats: [cat, bare] })).toEqual({ cats: [cat, bare] });
    expect(RosterResponseSchema.parse({ cats: [] })).toEqual({ cats: [] });
  });

  it("refuses an answer that is not a roster: no cats, a photo without alt text, a clip without a length", () => {
    expect(RosterResponseSchema.safeParse({}).success).toBe(false);
    expect(RosterResponseSchema.safeParse({ cats: "none" }).success).toBe(false);
    expect(
      RosterResponseSchema.safeParse({
        cats: [{ ...cat, photos: [{ src: PHOTO.src, focal: PHOTO.focal }] }],
      }).success,
    ).toBe(false);
    expect(
      RosterResponseSchema.safeParse({
        cats: [{ ...cat, video: { src: CLIP.src, alt: CLIP.alt } }],
      }).success,
    ).toBe(false);
    expect(RosterResponseSchema.safeParse({ cats: [{ ...cat, sex: "unknown" }] }).success).toBe(
      false,
    );
  });
});
