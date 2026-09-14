import { describe, expect, it } from "vitest";
import { CAT, CLIP, FAILED, LONG, photo } from "../../component/builder/media-fixtures";
import { previewManifest } from "@/ui/profile/preview-manifest";

// The preview's manifest (FR-026): the draft's live media records turned into the same
// `Record<MediaId, ResolvedMedia>` shape the published page reads, so one renderer serves
// both. A record with nothing to show yet has no entry — the renderer then draws the
// striped placeholder, and the publish check (T029) is what tells the volunteer why.

describe("previewManifest", () => {
  it("resolves a ready photo to its clean URL, description and focal point", () => {
    expect(previewManifest([CAT])).toEqual({
      maaaaaaa: {
        kind: "photo",
        src: CAT.cleanUrl,
        alt: "A tabby cat on a windowsill.",
        focal: { x: 50, y: 50 },
        width: 3072,
        height: 4080,
      },
    });
  });

  it("resolves a finished clip to its web file, poster and length", () => {
    expect(previewManifest([CLIP])).toEqual({
      maaaaaab: {
        kind: "video",
        src: CLIP.webUrl,
        poster: CLIP.posterUrl,
        alt: "A tabby cat on a windowsill.",
        focal: { x: 50, y: 50 },
        width: 1080,
        height: 1920,
        durationSeconds: 10.5,
      },
    });
  });

  it("leaves out a clip with no poster's poster key, not the clip", () => {
    const entry = previewManifest([{ ...CLIP, posterUrl: undefined }])[CLIP.id];
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("poster");
  });

  it("gives an undescribed photo an empty alt so the preview still shows it", () => {
    expect(previewManifest([FAILED])[FAILED.id]?.alt).toBe("");
  });

  it("has no entry for a record that is still processing or needs a trim", () => {
    const processing = photo("maaaaaae", "new.jpg", {
      status: "processing",
      revisions: {},
      cleanUrl: undefined,
    });
    expect(previewManifest([LONG, processing])).toEqual({});
  });
});
