import { describe, expect, it } from "vitest";
import {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_VIDEO_TYPES,
  checkDeclaredSize,
  checkTrim,
  checkUpload,
  isSmallPhoto,
  LIMITS,
  CAROUSEL_CLIP_SECONDS,
  photoWarnings,
  UNSUPPORTED_MESSAGE,
} from "@/core/media/validation";

const MB = 1024 * 1024;
const UNSUPPORTED = UNSUPPORTED_MESSAGE;

/** A well-formed JPEG upload; tests override one field at a time. */
function jpeg(overrides: Partial<Parameters<typeof checkUpload>[0]> = {}) {
  return checkUpload({
    declaredType: "image/jpeg",
    sniffedType: "image/jpeg",
    byteSize: 2 * MB,
    width: 3072,
    height: 4080,
    ...overrides,
  });
}

/** A well-formed MP4 upload. */
function mp4(overrides: Partial<Parameters<typeof checkUpload>[0]> = {}) {
  return checkUpload({
    declaredType: "video/mp4",
    sniffedType: "video/mp4",
    byteSize: 30 * MB,
    width: 1920,
    height: 1080,
    durationSeconds: 10.5,
    ...overrides,
  });
}

describe("LIMITS and allowed types", () => {
  it("names the seconds of a clip the carousel shows, inside a profile's longest clip", () => {
    expect(CAROUSEL_CLIP_SECONDS).toBe(8);
    expect(CAROUSEL_CLIP_SECONDS).toBeLessThan(LIMITS.maxClipSeconds);
  });

  it("names the caps from FR-007, FR-008 and FR-078", () => {
    expect(LIMITS).toEqual({
      photoBytes: 25 * MB,
      videoBytes: 200 * MB,
      smallPhotoWidth: 1200,
      maxClipSeconds: 15,
      minClipSeconds: 1,
    });
  });

  it("accepts exactly JPEG, PNG and WebP photos and MP4 and MOV video", () => {
    expect(ALLOWED_PHOTO_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(ALLOWED_VIDEO_TYPES).toEqual(["video/mp4", "video/quicktime"]);
  });
});

describe("checkUpload — type", () => {
  it("accepts each allowed type with the kind the sniff decides", () => {
    expect(jpeg()).toEqual({ ok: true, kind: "photo", warnings: [] });
    expect(jpeg({ declaredType: "image/png", sniffedType: "image/png" })).toEqual({
      ok: true,
      kind: "photo",
      warnings: [],
    });
    expect(jpeg({ declaredType: "image/webp", sniffedType: "image/webp" })).toEqual({
      ok: true,
      kind: "photo",
      warnings: [],
    });
    expect(mp4()).toEqual({ ok: true, kind: "video", warnings: [] });
    expect(mp4({ declaredType: "video/quicktime", sniffedType: "video/quicktime" })).toEqual({
      ok: true,
      kind: "video",
      warnings: [],
    });
  });
});

describe("checkUpload — sniffed versus declared type", () => {
  it("refuses a PNG renamed .mp4 as unsupported — the sniffed type wins over the declared one", () => {
    expect(mp4({ sniffedType: "image/png" })).toEqual({
      ok: false,
      code: "unsupported",
      message: UNSUPPORTED,
    });
    expect(jpeg({ sniffedType: "video/mp4" })).toEqual({
      ok: false,
      code: "unsupported",
      message: UNSUPPORTED,
    });
  });

  it("takes the kind from the sniff when the declared type is the same kind or unknown", () => {
    expect(jpeg({ declaredType: "image/jpeg", sniffedType: "image/png" })).toEqual({
      ok: true,
      kind: "photo",
      warnings: [],
    });
    expect(jpeg({ declaredType: "" })).toEqual({ ok: true, kind: "photo", warnings: [] });
    expect(mp4({ declaredType: "application/octet-stream" })).toEqual({
      ok: true,
      kind: "video",
      warnings: [],
    });
  });

  it("refuses a file whose type could not be sniffed", () => {
    expect(jpeg({ sniffedType: undefined })).toEqual({
      ok: false,
      code: "unsupported",
      message: UNSUPPORTED,
    });
  });
});

describe("checkUpload — unsupported types", () => {
  it("refuses HEIC and HEIF with the accepted formats named", () => {
    for (const type of ["image/heic", "image/heif"]) {
      expect(jpeg({ declaredType: type, sniffedType: type })).toEqual({
        ok: false,
        code: "unsupported",
        message: UNSUPPORTED,
      });
    }
  });

  it("refuses any other type the same way", () => {
    expect(jpeg({ declaredType: "image/gif", sniffedType: "image/gif" }).ok).toBe(false);
    expect(mp4({ declaredType: "video/webm", sniffedType: "video/webm" }).ok).toBe(false);
    expect(jpeg({ declaredType: "application/pdf", sniffedType: "application/pdf" })).toEqual({
      ok: false,
      code: "unsupported",
      message: UNSUPPORTED,
    });
  });
});

describe("checkUpload — size", () => {
  it("accepts a photo of exactly 25 MB and refuses one byte more, naming the cap", () => {
    expect(jpeg({ byteSize: 25 * MB }).ok).toBe(true);
    expect(jpeg({ byteSize: 25 * MB + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That photo is over 25MB.",
    });
  });

  it("accepts a video of exactly 200 MB and refuses one byte more, naming the cap", () => {
    expect(mp4({ byteSize: 200 * MB }).ok).toBe(true);
    expect(mp4({ byteSize: 200 * MB + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That video is over 200MB.",
    });
  });

  it("applies the photo cap to a photo even when it was declared as video", () => {
    // A 30 MB JPEG declared as MP4: the sniff says photo, so it is refused before size is read.
    expect(mp4({ sniffedType: "image/jpeg", byteSize: 30 * MB })).toMatchObject({
      code: "unsupported",
    });
    expect(jpeg({ byteSize: 30 * MB })).toMatchObject({ code: "too_large" });
  });

  it("checks the type before the size", () => {
    expect(jpeg({ sniffedType: "image/heic", byteSize: 30 * MB })).toMatchObject({
      code: "unsupported",
    });
  });
});

describe("checkUpload — small photo warning", () => {
  it("warns, naming the width, when the long edge is under 1200 px", () => {
    expect(jpeg({ width: 640, height: 480 })).toEqual({
      ok: true,
      kind: "photo",
      warnings: ["That photo is 640px wide — too small for the hero."],
    });
  });

  it("uses the longer edge, so a tall photo is judged by its height", () => {
    expect(jpeg({ width: 480, height: 1300 })).toEqual({ ok: true, kind: "photo", warnings: [] });
    expect(jpeg({ width: 480, height: 1199 })).toEqual({
      ok: true,
      kind: "photo",
      warnings: ["That photo is 1199px wide — too small for the hero."],
    });
  });

  it("does not warn at exactly 1200 px", () => {
    expect(jpeg({ width: 1200, height: 800 })).toEqual({ ok: true, kind: "photo", warnings: [] });
  });

  it("does not warn when dimensions are not known yet, and never for a video", () => {
    expect(jpeg({ width: undefined, height: undefined })).toEqual({
      ok: true,
      kind: "photo",
      warnings: [],
    });
    expect(jpeg({ width: 640, height: undefined })).toEqual({
      ok: true,
      kind: "photo",
      warnings: [],
    });
    expect(mp4({ width: 640, height: 360 })).toEqual({ ok: true, kind: "video", warnings: [] });
  });
});

describe("checkDeclaredSize — the cap before any byte moves (FR-007)", () => {
  it("applies the photo cap to a declared image type", () => {
    expect(checkDeclaredSize({ declaredType: "image/jpeg", byteSize: 25 * MB })).toEqual({
      ok: true,
    });
    expect(checkDeclaredSize({ declaredType: "image/png", byteSize: 25 * MB + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That photo is over 25MB.",
    });
  });

  it("applies the video cap to a declared video type", () => {
    expect(checkDeclaredSize({ declaredType: "video/quicktime", byteSize: 200 * MB })).toEqual({
      ok: true,
    });
    expect(checkDeclaredSize({ declaredType: "video/mp4", byteSize: 200 * MB + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That video is over 200MB.",
    });
  });

  it("gives an unknown or empty declared type the video cap, since the sniff decides later", () => {
    expect(checkDeclaredSize({ declaredType: "", byteSize: 100 * MB })).toEqual({ ok: true });
    expect(
      checkDeclaredSize({ declaredType: "application/octet-stream", byteSize: 200 * MB + 1 }),
    ).toMatchObject({ code: "too_large", message: "That video is over 200MB." });
    // HEIC is a photo the sniff will refuse; at begin it is only a size question.
    expect(checkDeclaredSize({ declaredType: "image/heic", byteSize: 30 * MB })).toMatchObject({
      code: "too_large",
      message: "That photo is over 25MB.",
    });
  });
});

describe("photoWarnings", () => {
  it("is the one sentence for a small photo and nothing otherwise", () => {
    expect(photoWarnings(640, 850)).toEqual(["That photo is 850px wide — too small for the hero."]);
    expect(photoWarnings(1200, 800)).toEqual([]);
  });

  it("is what checkUpload's warnings are made of", () => {
    expect(jpeg({ width: 300, height: 200 })).toMatchObject({ warnings: photoWarnings(300, 200) });
  });
});

describe("isSmallPhoto", () => {
  it("is true under 1200 px and false from 1200 px", () => {
    expect(isSmallPhoto(1199)).toBe(true);
    expect(isSmallPhoto(1200)).toBe(false);
    expect(isSmallPhoto(640)).toBe(true);
    expect(isSmallPhoto(4080)).toBe(false);
  });
});

describe("checkTrim", () => {
  const original = 22.4;

  it("accepts clips of exactly 1 and exactly 15 seconds", () => {
    expect(checkTrim({ start: 0, end: 1, originalDurationSeconds: original })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 7.4, end: 22.4, originalDurationSeconds: original })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 2.5, end: 11.5, originalDurationSeconds: original })).toEqual({
      ok: true,
    });
  });

  it("judges the length on whole milliseconds, so decimal seconds do not drift", () => {
    expect(checkTrim({ start: 8.03, end: 23.03, originalDurationSeconds: 30 })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 3.35, end: 4.35, originalDurationSeconds: 30 })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 0, end: 15.0005, originalDurationSeconds: 30 })).toEqual({
      ok: false,
      message: "A clip can be at most 15 seconds.",
    });
    expect(checkTrim({ start: 0, end: 0.9994, originalDurationSeconds: 30 })).toEqual({
      ok: false,
      message: "A clip must be at least 1 second.",
    });
  });

  it("judges the bounds on whole milliseconds too", () => {
    expect(checkTrim({ start: 0.1, end: 10.1, originalDurationSeconds: 10.1 })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 0, end: 10.1004, originalDurationSeconds: 10.1 })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: -0.0004, end: 5, originalDurationSeconds: 10 })).toEqual({
      ok: true,
    });
    expect(checkTrim({ start: 0, end: 10.101, originalDurationSeconds: 10.1 })).toEqual({
      ok: false,
      message: "That range is outside the clip.",
    });
  });

  it("refuses half a second, naming 1 second", () => {
    expect(checkTrim({ start: 2, end: 2.5, originalDurationSeconds: original })).toEqual({
      ok: false,
      message: "A clip must be at least 1 second.",
    });
  });

  it("refuses an end before the start the same way", () => {
    expect(checkTrim({ start: 5, end: 4, originalDurationSeconds: original })).toEqual({
      ok: false,
      message: "A clip must be at least 1 second.",
    });
  });

  it("refuses 16 seconds, naming 15 seconds", () => {
    expect(checkTrim({ start: 2, end: 18, originalDurationSeconds: original })).toEqual({
      ok: false,
      message: "A clip can be at most 15 seconds.",
    });
  });

  it("refuses an end past the original or a start before zero", () => {
    expect(checkTrim({ start: 20, end: 23, originalDurationSeconds: original })).toEqual({
      ok: false,
      message: "That range is outside the clip.",
    });
    expect(checkTrim({ start: -1, end: 5, originalDurationSeconds: original })).toEqual({
      ok: false,
      message: "That range is outside the clip.",
    });
  });
});
