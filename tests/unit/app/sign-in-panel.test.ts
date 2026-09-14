import { describe, expect, it } from "vitest";
import { FALLBACK_PHOTO, signInPanelData, signInSentence } from "@/app/sign-in/_lib/panel";
import type { PublishedRow } from "@/core/ports";
import type { ResolvedMedia } from "@/core/profile/schema";
import { document, hero, video } from "../core/profile/builders";

// The sign-in photo panel (hi-fi 4b; CONTENT.md → Photo panel): the live count in one
// sentence — plural, singular, and plain words for none — and the most recently
// published cat's photo, falling back to the design's own when nothing live has one.

const PHOTO: ResolvedMedia = {
  kind: "photo",
  src: "/media/profiles/kx3f7q2m/media/media2aa/clean.a1b2c3d4e5.jpg",
  alt: "Charlotte on a windowsill.",
  focal: { x: 62, y: 40 },
  width: 2560,
  height: 1920,
};
const CLIP: ResolvedMedia = {
  kind: "video",
  src: "/media/profiles/kx3f7q2m/media/video2aa/web.e5f6a7b8c9.mp4",
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

describe("signInSentence", () => {
  it("counts the live cats in the plural, the singular, and plain words for none", () => {
    expect(signInSentence(7)).toBe("7 cats are waiting on a page.");
    expect(signInSentence(1)).toBe("1 cat is waiting on a page.");
    expect(signInSentence(0)).toBe("No cats are on a page yet.");
  });
});

describe("signInPanelData", () => {
  it("shows the design's photo and the zero sentence when nothing is published", () => {
    expect(signInPanelData([])).toEqual({
      count: 0,
      sentence: "No cats are on a page yet.",
      photo: FALLBACK_PHOTO,
    });
  });

  it("takes the most recently published cat's photo and counts every live cat", () => {
    const older = { ...PHOTO, alt: "Older." };
    const rows = [
      row("aaaaaaaa", "2026-09-01T00:00:00.000Z", {}, { media2aa: older }),
      row("bbbbbbbb", "2026-09-10T00:00:00.000Z", { name: "Milo", blocks: [hero()] }),
    ];
    expect(signInPanelData(rows)).toEqual({
      count: 2,
      sentence: "2 cats are waiting on a page.",
      photo: PHOTO,
    });
  });

  it("walks back to the first cat with a photo, and falls back when none has one", () => {
    const clipsOnly = row(
      "bbbbbbbb",
      "2026-09-10T00:00:00.000Z",
      { name: "Milo", blocks: [hero(null), video()] },
      { video2aa: CLIP },
    );
    const withPhoto = row("aaaaaaaa", "2026-09-01T00:00:00.000Z");
    expect(signInPanelData([withPhoto, clipsOnly]).photo).toEqual(PHOTO);
    expect(signInPanelData([clipsOnly])).toEqual({
      count: 1,
      sentence: "1 cat is waiting on a page.",
      photo: FALLBACK_PHOTO,
    });
  });
});
