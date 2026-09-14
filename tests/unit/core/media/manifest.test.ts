import { describe, expect, it } from "vitest";
import { ProfileInvalidError, RefusedError } from "@/core/errors";
import { resolveManifest } from "@/core/media/manifest";
import { derivedName, publicUrl } from "@/core/media/paths";
import { MediaAssetSchema, type MediaAsset } from "@/core/media/schema";
import type { MediaStore } from "@/core/ports";
import { PublishedDocumentSchema, type ProfileDocument } from "@/core/profile/schema";
import { bio, document, hero } from "../profile/builders";
import { photoAsset, videoAsset, without } from "./builders";

const PUBLIC_BASE = "https://storage.googleapis.com/cats-public";
const PID = "kx3f7q2m";

/** A store's `publicUrl` over `base`, the way the bucket and filesystem stores build it. */
function urlsUnder(base: string): Pick<MediaStore, "publicUrl"> {
  return { publicUrl: (pid, mid, kind, rev) => publicUrl(base, derivedName(pid, mid, kind, rev)) };
}

const BASE = urlsUnder(PUBLIC_BASE);

/** A draft referencing one photo (hero and gallery) and one video, plus a bio. */
function draft(overrides: Partial<ProfileDocument> = {}): ProfileDocument {
  return document({
    id: PID,
    blocks: [
      hero("media2aa"),
      bio(),
      { id: "blockaaaaaac", type: "gallery", mediaIds: ["media2aa", "media2ac"] },
      { id: "blockaaaaaad", type: "video", mediaId: "media2ab" },
    ],
    ...overrides,
  });
}

const photo = photoAsset({ id: "media2aa" });
const gallery = photoAsset({
  id: "media2ac",
  fileName: "porch.jpg",
  revisions: { clean: "ffffffffff" },
});
const video = videoAsset({ id: "media2ab" });

function assets(...list: MediaAsset[]): MediaAsset[] {
  return list.length === 0 ? [photo, gallery, video] : list;
}

describe("resolveManifest — coverage", () => {
  it("covers exactly the ids the document references and nothing else", () => {
    const unreferenced = photoAsset({ id: "media2az" });
    const manifest = resolveManifest(draft(), [...assets(), unreferenced], BASE);
    expect(Object.keys(manifest).sort()).toEqual(["media2aa", "media2ab", "media2ac"]);
  });

  it("is empty for a document that references no media", () => {
    expect(resolveManifest(draft({ blocks: [bio()] }), assets(), BASE)).toEqual({});
  });

  it("merges into a document that PublishedDocumentSchema accepts", () => {
    const doc = draft();
    const media = resolveManifest(doc, assets(), BASE);
    const published = { ...doc, publishedAt: "2026-09-11T09:00:00.000Z", slug: "charlotte", media };
    expect(PublishedDocumentSchema.safeParse(published).success).toBe(true);
  });
});

describe("resolveManifest — entries", () => {
  it("resolves a photo to its clean revision", () => {
    const manifest = resolveManifest(draft(), assets(), BASE);
    expect(manifest.media2aa).toEqual({
      kind: "photo",
      src: `${PUBLIC_BASE}/profiles/${PID}/media/media2aa/clean.a1b2c3d4e5.jpg`,
      alt: "Charlotte on a windowsill.",
      focal: { x: 50, y: 50 },
      width: 2560,
      height: 1920,
    });
    expect(manifest.media2ac?.src).toBe(
      `${PUBLIC_BASE}/profiles/${PID}/media/media2ac/clean.ffffffffff.jpg`,
    );
  });

  it("resolves a trimmed video with web, poster and durationSeconds", () => {
    const manifest = resolveManifest(draft(), assets(), BASE);
    expect(manifest.media2ab).toEqual({
      kind: "video",
      src: `${PUBLIC_BASE}/profiles/${PID}/media/media2ab/web.e5f6a7b8c9.mp4`,
      poster: `${PUBLIC_BASE}/profiles/${PID}/media/media2ab/poster.0123456789.jpg`,
      alt: "Charlotte batting at a raindrop.",
      focal: { x: 50, y: 50 },
      width: 1080,
      height: 1920,
      durationSeconds: 9,
    });
  });
});

describe("resolveManifest — entry details", () => {
  it("carries the asset's focal point and a volunteer-edited alt", () => {
    const edited = photoAsset({
      id: "media2aa",
      focal: { x: 62, y: 40 },
      alt: { text: "Charlotte, asleep.", source: "volunteer" },
    });
    const manifest = resolveManifest(draft(), assets(edited, gallery, video), BASE);
    expect(manifest.media2aa?.focal).toEqual({ x: 62, y: 40 });
    expect(manifest.media2aa?.alt).toBe("Charlotte, asleep.");
  });

  it("leaves poster out when poster extraction failed (ADR-006), still publishable", () => {
    const noPoster = videoAsset({ id: "media2ab", revisions: { web: "e5f6a7b8c9" } });
    const manifest = resolveManifest(draft(), assets(photo, gallery, noPoster), BASE);
    expect(manifest.media2ab).not.toHaveProperty("poster");
    expect(manifest.media2ab?.src).toContain("web.e5f6a7b8c9.mp4");
  });

  it("leaves durationSeconds out when the record has none yet", () => {
    const unknownLength = MediaAssetSchema.parse(
      without(videoAsset({ id: "media2ab" }), "durationSeconds"),
    );
    const manifest = resolveManifest(draft(), assets(photo, gallery, unknownLength), BASE);
    expect(manifest.media2ab).not.toHaveProperty("durationSeconds");
    expect(manifest.media2ab?.kind).toBe("video");
  });

  it("joins the base without a double slash", () => {
    const manifest = resolveManifest(draft(), assets(), urlsUnder(`${PUBLIC_BASE}/`));
    expect(manifest.media2aa?.src).toBe(
      `${PUBLIC_BASE}/profiles/${PID}/media/media2aa/clean.a1b2c3d4e5.jpg`,
    );
  });
});

describe("resolveManifest — refusals (publish must not proceed)", () => {
  it("refuses when a referenced id has no asset", () => {
    expect(() => resolveManifest(draft(), assets(photo, video), BASE)).toThrow(RefusedError);
    expect(() => resolveManifest(draft(), assets(photo, video), BASE)).toThrow(
      "A photo or clip is missing from the library.",
    );
  });

  it("refuses an asset that is still processing, naming the file", () => {
    const processing = photoAsset({ id: "media2aa", status: "processing" });
    expect(() => resolveManifest(draft(), assets(processing, gallery, video), BASE)).toThrow(
      new RefusedError("charlotte-window.jpg is still processing."),
    );
  });

  it("refuses a video that still needs a trim, naming the file", () => {
    const needsTrim = MediaAssetSchema.parse(
      without(videoAsset({ id: "media2ab", status: "needs-trim", revisions: {} }), "trim"),
    );
    expect(() => resolveManifest(draft(), assets(photo, gallery, needsTrim), BASE)).toThrow(
      new RefusedError("Trim rain-day.mov to 15 seconds or less."),
    );
  });

  it("refuses an asset with no description, naming the file", () => {
    const undescribed = photoAsset({ id: "media2ac", fileName: "porch.jpg", alt: null });
    expect(() => resolveManifest(draft(), assets(photo, undescribed, video), BASE)).toThrow(
      new RefusedError("Write a description for porch.jpg."),
    );
  });

  it("refuses a photo with no clean revision and a video with no web revision", () => {
    const bare = photoAsset({ id: "media2aa", revisions: {} });
    expect(() => resolveManifest(draft(), assets(bare, gallery, video), BASE)).toThrow(
      new RefusedError("charlotte-window.jpg hasn't been processed yet."),
    );
    const noWeb = videoAsset({ id: "media2ab", revisions: { poster: "0123456789" } });
    expect(() => resolveManifest(draft(), assets(photo, gallery, noWeb), BASE)).toThrow(
      new RefusedError("rain-day.mov hasn't been processed yet."),
    );
  });

  it("accepts the root-relative /media path the filesystem store serves", () => {
    const manifest = resolveManifest(draft(), assets(), urlsUnder("/media"));
    expect(manifest.media2aa?.src).toBe(
      `/media/profiles/${PID}/media/media2aa/clean.a1b2c3d4e5.jpg`,
    );
  });

  it("fails loudly on a store whose URLs are plain http:", () => {
    expect(() =>
      resolveManifest(draft(), assets(), urlsUnder("http://storage.googleapis.com/x")),
    ).toThrow(ProfileInvalidError);
  });
});
