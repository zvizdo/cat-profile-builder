import { describe, expect, it } from "vitest";
import { MediaAssetSchema, RevSchema, type MediaAsset } from "@/core/media/schema";
import { photoAsset, videoAsset, without } from "./builders";

/** The dotted paths of every issue a failed parse reports, joined with " | ". */
function issuePaths(input: unknown): string {
  const result = MediaAssetSchema.safeParse(input);
  if (result.success) throw new Error("expected the record to be rejected");
  return result.error.issues.map((issue) => issue.path.join(".")).join(" | ");
}

/** The message of the single issue a failed parse reports. */
function issueMessage(input: unknown): string {
  const result = MediaAssetSchema.safeParse(input);
  if (result.success) throw new Error("expected the record to be rejected");
  expect(result.error.issues).toHaveLength(1);
  return result.error.issues[0]?.message ?? "";
}

describe("MediaAssetSchema top level", () => {
  it("accepts a photo record unchanged", () => {
    const asset = photoAsset();
    expect(MediaAssetSchema.parse(asset)).toEqual(asset);
  });

  it("accepts a video record unchanged", () => {
    const asset = videoAsset();
    expect(MediaAssetSchema.parse(asset)).toEqual(asset);
  });

  it("defaults focal to the centre when absent", () => {
    const parsed = MediaAssetSchema.parse(without(photoAsset(), "focal"));
    expect(parsed.focal).toEqual({ x: 50, y: 50 });
  });

  it("requires schemaVersion 1 (a missing version is never coerced)", () => {
    expect(issuePaths(without(photoAsset(), "schemaVersion"))).toBe("schemaVersion");
    expect(issuePaths({ ...photoAsset(), schemaVersion: 2 })).toBe("schemaVersion");
    expect(issuePaths({ ...photoAsset(), schemaVersion: "1" })).toBe("schemaVersion");
  });

  it("requires id to be 8 chars of [a-z2-7]", () => {
    expect(issuePaths(photoAsset({ id: "media2a" }))).toBe("id");
    expect(issuePaths(photoAsset({ id: "media2axx" }))).toBe("id");
    expect(issuePaths(photoAsset({ id: "media1ax" }))).toBe("id");
    expect(issuePaths(photoAsset({ id: "../etc/x" }))).toBe("id");
  });

  it("rejects an unknown kind", () => {
    expect(issuePaths({ ...photoAsset(), kind: "audio" })).toBe("kind");
  });

  it("bounds fileName at 200 characters", () => {
    expect(MediaAssetSchema.safeParse(photoAsset({ fileName: "f".repeat(200) })).success).toBe(
      true,
    );
    expect(issuePaths(photoAsset({ fileName: "f".repeat(201) }))).toBe("fileName");
  });

  it("requires mimeType to be a string", () => {
    expect(issuePaths({ ...photoAsset(), mimeType: 7 })).toBe("mimeType");
  });

  it("requires bytes, width and height to be positive integers", () => {
    expect(issuePaths(photoAsset({ bytes: 0 }))).toBe("bytes");
    expect(issuePaths(photoAsset({ bytes: 1.5 }))).toBe("bytes");
    expect(issuePaths(photoAsset({ width: 0 }))).toBe("width");
    expect(issuePaths(photoAsset({ height: -1 }))).toBe("height");
  });
});

describe("MediaAssetSchema top level — enums, dates and unknown keys", () => {
  it("bounds focal to 0..100 on each axis", () => {
    expect(issuePaths(photoAsset({ focal: { x: 101, y: 50 } }))).toBe("focal.x");
    expect(issuePaths(photoAsset({ focal: { x: 50, y: -1 } }))).toBe("focal.y");
  });

  it("rejects an unknown status or descriptionStatus", () => {
    expect(issuePaths({ ...photoAsset(), status: "uploading" })).toBe("status");
    expect(issuePaths({ ...photoAsset(), descriptionStatus: "done" })).toBe("descriptionStatus");
  });

  it("requires createdAt to be an ISO datetime", () => {
    expect(issuePaths(photoAsset({ createdAt: "yesterday" }))).toBe("createdAt");
  });

  it("rejects an unknown top-level key", () => {
    expect(issuePaths({ ...photoAsset(), url: "https://x.example/a.jpg" })).toBe("");
  });
});

describe("MediaAssetSchema alt", () => {
  it("accepts null (not yet described)", () => {
    expect(MediaAssetSchema.parse(photoAsset({ alt: null })).alt).toBeNull();
  });

  it("bounds the text at 1..300 characters", () => {
    expect(issuePaths(photoAsset({ alt: { text: "", source: "model" } }))).toBe("alt.text");
    expect(issuePaths(photoAsset({ alt: { text: "t".repeat(301), source: "model" } }))).toBe(
      "alt.text",
    );
  });

  it("requires the source to be model or volunteer", () => {
    expect(issuePaths({ ...photoAsset(), alt: { text: "A cat.", source: "guess" } })).toBe(
      "alt.source",
    );
  });

  it("rejects an unknown key inside alt", () => {
    expect(
      issuePaths({ ...photoAsset(), alt: { text: "A cat.", source: "model", lang: "en" } }),
    ).toBe("alt");
  });
});

describe("MediaAssetSchema revisions", () => {
  it("accepts any subset of clean, web and poster", () => {
    expect(MediaAssetSchema.safeParse(photoAsset({ revisions: {} })).success).toBe(true);
  });

  it("requires each rev to be 10 lowercase hex characters", () => {
    expect(issuePaths(photoAsset({ revisions: { clean: "a1b2c3d4e" } }))).toBe("revisions.clean");
    expect(issuePaths(photoAsset({ revisions: { clean: "a1b2c3d4e5f" } }))).toBe("revisions.clean");
    expect(issuePaths(photoAsset({ revisions: { clean: "A1B2C3D4E5" } }))).toBe("revisions.clean");
    expect(issuePaths(videoAsset({ revisions: { web: "e5f6g7h8i9" } }))).toBe("revisions.web");
    expect(issuePaths(videoAsset({ revisions: { poster: "../../x.jpg" } }))).toBe(
      "revisions.poster",
    );
  });

  it("rejects an unknown revision kind", () => {
    expect(issuePaths({ ...photoAsset(), revisions: { thumb: "a1b2c3d4e5" } })).toBe("revisions");
  });
});

describe("MediaAssetSchema photo rules", () => {
  it("rejects video-only fields on a photo, each at its own path", () => {
    expect(issuePaths(photoAsset({ durationSeconds: 8 }))).toBe("durationSeconds");
    expect(issuePaths(photoAsset({ originalDurationSeconds: 8 }))).toBe("originalDurationSeconds");
    expect(issuePaths(photoAsset({ trim: { start: 0, end: 5 } }))).toBe("trim");
  });

  it("rejects needs-trim on a photo", () => {
    expect(issuePaths(photoAsset({ status: "needs-trim" }))).toBe("status");
  });

  it("accepts an enhanced photo and validates its source id and recipe", () => {
    const enhanced = photoAsset({ enhancement: { sourceMediaId: "media2az", recipe: "auto-v1" } });
    expect(MediaAssetSchema.parse(enhanced)).toEqual(enhanced);
    expect(
      issuePaths({ ...photoAsset(), enhancement: { sourceMediaId: "nope", recipe: "auto-v1" } }),
    ).toBe("enhancement.sourceMediaId");
    expect(
      issuePaths({
        ...photoAsset(),
        enhancement: { sourceMediaId: "media2az", recipe: "auto-v2" },
      }),
    ).toBe("enhancement.recipe");
  });
});

describe("MediaAssetSchema video rules", () => {
  it("rejects enhancement on a video", () => {
    expect(
      issuePaths(videoAsset({ enhancement: { sourceMediaId: "media2az", recipe: "auto-v1" } })),
    ).toBe("enhancement");
  });

  it("requires originalDurationSeconds on a video", () => {
    expect(issuePaths(without(videoAsset(), "originalDurationSeconds"))).toBe(
      "originalDurationSeconds",
    );
  });

  it("accepts a video with no trim and no durationSeconds yet", () => {
    const untrimmed = without(
      videoAsset({ status: "processing", originalDurationSeconds: 10 }),
      "trim",
      "durationSeconds",
    );
    expect(MediaAssetSchema.safeParse(untrimmed).success).toBe(true);
  });

  it("requires a trim on an original over 15 s unless the status is needs-trim", () => {
    const statuses: Array<MediaAsset["status"]> = ["ready", "processing"];
    for (const status of statuses) {
      const untrimmed = without(videoAsset({ status }), "trim");
      expect(issuePaths(untrimmed)).toBe("trim");
      expect(issueMessage(untrimmed)).toBe("A video over 15 seconds needs a trim first.");
    }
    const needsTrim = without(videoAsset({ status: "needs-trim", revisions: {} }), "trim");
    expect(MediaAssetSchema.safeParse(needsTrim).success).toBe(true);
  });

  it("allows needs-trim only for an original over 15 s with no trim", () => {
    const long = without(videoAsset({ status: "needs-trim", revisions: {} }), "trim");
    expect(MediaAssetSchema.safeParse(long).success).toBe(true);
    const short = without(
      videoAsset({ status: "needs-trim", originalDurationSeconds: 15, revisions: {} }),
      "trim",
    );
    expect(issuePaths(short)).toBe("status");
    expect(issuePaths(videoAsset({ status: "needs-trim" }))).toBe("status");
  });
});

describe("MediaAssetSchema trim rules (via checkTrim)", () => {
  it("rejects a trim shorter than 1 second, naming the number", () => {
    const broken = videoAsset({ trim: { start: 2, end: 2.5 } });
    expect(issuePaths(broken)).toBe("trim");
    expect(issueMessage(broken)).toContain("1 second");
  });

  it("rejects a trim longer than 15 seconds, naming the number", () => {
    const broken = videoAsset({ trim: { start: 2, end: 18 } });
    expect(issuePaths(broken)).toBe("trim");
    expect(issueMessage(broken)).toContain("15 seconds");
  });

  it("rejects a trim that leaves the original", () => {
    expect(issuePaths(videoAsset({ trim: { start: -1, end: 5 } }))).toBe("trim");
    expect(issuePaths(videoAsset({ trim: { start: 20, end: 23 } }))).toBe("trim");
  });

  it("accepts trims of exactly 1 and exactly 15 seconds", () => {
    expect(MediaAssetSchema.safeParse(videoAsset({ trim: { start: 0, end: 1 } })).success).toBe(
      true,
    );
    expect(
      MediaAssetSchema.safeParse(videoAsset({ trim: { start: 7.4, end: 22.4 } })).success,
    ).toBe(true);
  });

  it("accepts a decimal trim of exactly 15 seconds (millisecond comparison)", () => {
    const decimal = videoAsset({ originalDurationSeconds: 30, trim: { start: 8.03, end: 23.03 } });
    expect(MediaAssetSchema.parse(decimal)).toEqual(decimal);
  });

  it("rejects a trim with a missing or non-numeric bound", () => {
    expect(issuePaths({ ...videoAsset(), trim: { start: 0 } })).toBe("trim.end");
    expect(issuePaths({ ...videoAsset(), trim: { start: "0", end: 5 } })).toBe("trim.start");
  });
});

describe("RevSchema", () => {
  it("accepts exactly 10 lowercase hex characters", () => {
    expect(RevSchema.safeParse("0123456789").success).toBe(true);
    expect(RevSchema.safeParse("abcdef0123").success).toBe(true);
    expect(RevSchema.safeParse("abcdef012").success).toBe(false);
    expect(RevSchema.safeParse("abcdef01234").success).toBe(false);
    expect(RevSchema.safeParse("ABCDEF0123").success).toBe(false);
    expect(RevSchema.safeParse("abcdefg123").success).toBe(false);
  });
});
