import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { ProfileDocument } from "@/core/profile/schema";
import {
  durationLabel,
  onPageLine,
  originalLine,
  shortFileName,
  tileFace,
} from "@/ui/builder/media-state";

// What a library tile shows for each media state (data-model.md → Media state
// transitions): stripes with a mono word while nothing can be shown, else the clean photo
// or the poster cropped on the focal point, with one mark — the clip length, or the clay
// `needs a description` that blocks publishing (FR-073).

function fixture(name: string): AssetView {
  return JSON.parse(
    readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
  ) as AssetView;
}

const photo: AssetView = { ...fixture("maximal-asset-photo.json"), cleanUrl: "/clean.jpg" };
const video: AssetView = {
  ...fixture("maximal-asset-video.json"),
  webUrl: "/web.mp4",
  posterUrl: "/poster.jpg",
};

/** The maximal photo is an enhanced copy; this is the same record as an original. */
const original: AssetView = { ...photo, enhancement: undefined };

describe("tileFace", () => {
  it("shows a ready photo cropped on its focal point with no mark", () => {
    expect(tileFace(original)).toEqual({
      kind: "image",
      src: "/clean.jpg",
      position: "62% 40%",
      mark: null,
    });
  });

  it("marks an enhanced copy ENHANCED (FR-052)", () => {
    expect(tileFace(photo).kind === "image" && tileFace(photo)).toMatchObject({
      mark: { text: "ENHANCED", tone: "card" },
    });
  });

  it("shows a ready clip's poster with its length as the mark", () => {
    expect(tileFace(video)).toEqual({
      kind: "image",
      src: "/poster.jpg",
      position: "62% 40%",
      mark: { text: "0:09", tone: "card" },
    });
  });

  it("marks a failed description in clay on either kind", () => {
    const failed = { ...photo, alt: null, descriptionStatus: "failed" as const };
    expect(tileFace(failed)).toMatchObject({ mark: { text: "needs a description", tone: "clay" } });
    expect(tileFace({ ...video, alt: null, descriptionStatus: "failed" })).toMatchObject({
      mark: { text: "needs a description", tone: "clay" },
    });
  });

  it("is striped while processing, while a clip needs a trim, and for a clip with no cover frame", () => {
    expect(tileFace({ ...photo, status: "processing" })).toEqual({
      kind: "placeholder",
      label: "processing",
    });
    expect(
      tileFace({
        ...video,
        status: "needs-trim",
        trim: undefined,
        durationSeconds: undefined,
        revisions: {},
        webUrl: undefined,
        posterUrl: undefined,
      }),
    ).toEqual({ kind: "placeholder", label: "needs a trim" });
    expect(tileFace({ ...video, posterUrl: undefined })).toEqual({
      kind: "placeholder",
      label: "no cover frame",
    });
  });
});

describe("durationLabel", () => {
  it("is the trimmed length, else the original's, and nothing for a photo", () => {
    expect(durationLabel(video)).toBe("0:09");
    expect(durationLabel({ ...video, durationSeconds: undefined })).toBe("0:22");
    expect(durationLabel(photo)).toBeNull();
  });
});

describe("originalLine", () => {
  const source: AssetView = { ...original, id: "media2az" };

  it("names the source by its description, or as a photo when it has none", () => {
    expect(originalLine(photo, [source, photo])).toBe(`original: ${source.alt?.text}`);
    expect(originalLine(photo, [{ ...source, alt: null }])).toBe("original: photo");
  });

  it("is nothing when the source has left the library", () => {
    expect(originalLine(photo, [photo])).toBeNull();
  });
});

describe("shortFileName", () => {
  it("leaves a name that fits alone", () => {
    expect(shortFileName("cat-1.jpg", 16)).toBe("cat-1.jpg");
    expect(shortFileName("PXL_20260622.jpg", 16)).toBe("PXL_20260622.jpg");
  });

  it("cuts the middle, keeping the head and the last three characters before the extension", () => {
    expect(shortFileName("PXL_20260622_022941724.jpg", 16)).toBe("PXL_2026\u2026724.jpg");
    expect(shortFileName("PXL_2026\u2026724.jpg", 16)).toHaveLength(16);
  });

  it("keeps only the extension when the budget is small, with no dot before it", () => {
    expect(shortFileName("PXL_20260622_022941724.mp4", 8)).toBe("PXL_\u2026mp4");
    expect(shortFileName("PXL_20260622_022941724.mp4", 9)).toBe("PXL_2\u2026mp4");
  });

  it("copes with a name that has no extension", () => {
    expect(shortFileName("a-very-long-name-with-no-extension", 12)).toBe("a-very-l\u2026ion");
  });
});

describe("onPageLine", () => {
  const doc: ProfileDocument = {
    schemaVersion: 1,
    id: "abcdefgh",
    name: "Charlotte",
    blocks: [
      { id: "heroaaaaaaaa", type: "hero", mediaId: "maaaaaaa" },
      { id: "galleryaaaaa", type: "gallery", mediaIds: ["maaaaaab", "maaaaaaa", "maaaaaac"] },
      {
        id: "dayaaaaaaaaa",
        type: "day",
        scenes: [
          { mediaId: null, caption: "" },
          { mediaId: "maaaaaab", caption: "" },
          { mediaId: null, caption: "" },
        ],
      },
      { id: "videoaaaaaaa", type: "video", mediaId: "maaaaaad" },
    ],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt: "2026-09-10T12:00:00.000Z",
  };

  it("names every slot holding the record, in page order (FR-013)", () => {
    expect(onPageLine(doc, "maaaaaaa")).toBe("On the page · hero · gallery, slot 2");
    expect(onPageLine(doc, "maaaaaab")).toBe("On the page · gallery, slot 1 · day, scene 2");
    expect(onPageLine(doc, "maaaaaad")).toBe("On the page · video");
  });

  it("says so when nothing on the page holds it", () => {
    expect(onPageLine(doc, "maaaaaaz")).toBe("Not on the page yet");
  });
});
