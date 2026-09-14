import { describe, expect, it } from "vitest";
import {
  buildClip20sArgs,
  buildClip2sRotateRemuxArgs,
  buildClip2sTranscodeArgs,
  darkenOneStopLinear,
  renderChecksumsFile,
  resizePlan,
  sha256Hex,
  validateMaximalAssetShape,
  validateMaximalDocumentShape,
} from "../../../scripts/lib/fixtures";

describe("buildClip2sTranscodeArgs", () => {
  it("keeps pixels unrotated instead of baking the source rotation in", () => {
    const args = buildClip2sTranscodeArgs("in.mp4", "tmp.mp4");
    expect(args).toContain("-noautorotate");
    expect(args).not.toContain("transpose");
    expect(args.at(-1)).toBe("tmp.mp4");
  });

  it("keeps the audio track (the pipeline under test strips it, not the fixture)", () => {
    const args = buildClip2sTranscodeArgs("in.mp4", "tmp.mp4");
    expect(args).toContain("-c:a");
    expect(args).not.toContain("-an");
  });

  it("is deterministic: same inputs, same argv, every run", () => {
    expect(buildClip2sTranscodeArgs("a.mp4", "b.mp4")).toEqual(
      buildClip2sTranscodeArgs("a.mp4", "b.mp4"),
    );
  });
});

describe("buildClip2sRotateRemuxArgs", () => {
  it("overrides the read rotation via -display_rotation and copies (no re-encode)", () => {
    const args = buildClip2sRotateRemuxArgs("tmp.mp4", "out.mp4");
    expect(args).toContain("-display_rotation");
    expect(args).toContain("-90");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("is deterministic: same inputs, same argv, every run", () => {
    expect(buildClip2sRotateRemuxArgs("a.mp4", "b.mp4")).toEqual(
      buildClip2sRotateRemuxArgs("a.mp4", "b.mp4"),
    );
  });
});

describe("buildClip20sArgs", () => {
  it("scales to 720p and caps quality for the size budget", () => {
    const args = buildClip20sArgs("in.mp4", "out.mp4");
    expect(args).toContain("scale=-2:720");
    expect(args).toContain("30");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("keeps the audio track", () => {
    expect(buildClip20sArgs("in.mp4", "out.mp4")).toContain("-c:a");
  });
});

describe("resizePlan", () => {
  it("constrains the longest edge without upscaling or cropping", () => {
    expect(resizePlan(1600)).toEqual({ width: 1600, fit: "inside", withoutEnlargement: true });
  });
});

describe("darkenOneStopLinear", () => {
  it("halves every sample with no offset (-1 EV)", () => {
    expect(darkenOneStopLinear()).toEqual([0.5, 0]);
  });
});

describe("sha256Hex", () => {
  it("matches a known sha256 vector", () => {
    // sha256("") — the canonical empty-input test vector.
    expect(sha256Hex(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is deterministic for the same bytes", () => {
    const data = Buffer.from("cat profile builder");
    expect(sha256Hex(data)).toBe(sha256Hex(Buffer.from(data)));
  });
});

describe("renderChecksumsFile", () => {
  it("sorts by path and uses the shasum -c line format", () => {
    const out = renderChecksumsFile([
      { relativePath: "b.jpg", hex: "bb" },
      { relativePath: "a.jpg", hex: "aa" },
    ]);
    expect(out).toBe("aa  a.jpg\nbb  b.jpg\n");
  });

  it("does not mutate its input", () => {
    const entries = [
      { relativePath: "b.jpg", hex: "bb" },
      { relativePath: "a.jpg", hex: "aa" },
    ];
    renderChecksumsFile(entries);
    expect(entries[0]?.relativePath).toBe("b.jpg");
  });
});

function baseDocument(overrides: Record<string, unknown> = {}): unknown {
  const blockTypes = ["hero", "bio", "photo", "gallery", "video", "day", "needs", "quote"];
  const blocks = blockTypes.map((type, index) => {
    const id = `block-${String(index).padStart(6, "0")}`;
    if (type === "gallery") {
      return { id, type, mediaIds: Array.from({ length: 12 }, (_, i) => `media${i}aa`) };
    }
    if (type === "day") {
      return { id, type, scenes: [{}, {}, {}] };
    }
    if (type === "needs") {
      return { id, type, cards: [{}, {}, {}] };
    }
    return { id, type };
  });
  // Pad to exactly 30 blocks with extra bio blocks.
  while (blocks.length < 30) {
    blocks.push({ id: `block-pad${blocks.length}`, type: "bio" });
  }
  return {
    schemaVersion: 1,
    id: "kx3f7q2m",
    blocks,
    theme: { preset: "night", warmth: 0.5, contrast: 0.5 },
    ...overrides,
  };
}

describe("validateMaximalDocumentShape", () => {
  it("accepts a document with every block type, a 12-photo gallery and a 3-scene day", () => {
    expect(() => validateMaximalDocumentShape(baseDocument())).not.toThrow();
  });

  it("rejects a document missing a block type", () => {
    const doc = baseDocument() as { blocks: Array<{ id: string; type: string }> };
    doc.blocks = doc.blocks.filter((b) => b.type !== "quote");
    while (doc.blocks.length < 30) doc.blocks.push({ type: "bio", id: `pad${doc.blocks.length}` });
    expect(() => validateMaximalDocumentShape(doc)).toThrow(/missing block type/);
  });

  it("rejects a gallery without exactly 12 ids", () => {
    const doc = baseDocument() as { blocks: Array<{ type: string; mediaIds?: string[] }> };
    const gallery = doc.blocks.find((b) => b.type === "gallery");
    if (gallery) gallery.mediaIds = ["only-one"];
    expect(() => validateMaximalDocumentShape(doc)).toThrow(/12 mediaIds/);
  });

  it("rejects a day block without exactly 3 scenes", () => {
    const doc = baseDocument() as { blocks: Array<{ type: string; scenes?: unknown[] }> };
    const day = doc.blocks.find((b) => b.type === "day");
    if (day) day.scenes = [{}];
    expect(() => validateMaximalDocumentShape(doc)).toThrow(/3 scenes/);
  });

  it("rejects something that isn't even the right shape", () => {
    expect(() => validateMaximalDocumentShape({ nope: true })).toThrow();
  });
});

/** Minimal maximal-asset fixtures, one per kind, for the shape check. */
const photo = {
  schemaVersion: 1,
  id: "media2ax",
  kind: "photo",
  alt: { text: "A cat.", source: "volunteer" },
  focal: { x: 50, y: 50 },
  status: "ready",
  revisions: { clean: "a1" },
  enhancement: { sourceMediaId: "media2az", recipe: "auto-v1" },
};
const video = {
  schemaVersion: 1,
  id: "media2ay",
  kind: "video",
  alt: { text: "A cat.", source: "model" },
  focal: { x: 50, y: 50 },
  status: "ready",
  revisions: { web: "b2", poster: "c3" },
  trim: { start: 0, end: 9 },
};

describe("validateMaximalAssetShape", () => {
  it("accepts a photo and a video with every optional field of their kind populated", () => {
    expect(() => validateMaximalAssetShape(photo, "photo")).not.toThrow();
    expect(() => validateMaximalAssetShape(video, "video")).not.toThrow();
  });

  it("rejects a fixture of the other kind", () => {
    expect(() => validateMaximalAssetShape(photo, "video")).toThrow(/kind "photo"/);
  });

  it("rejects a null alt on either kind", () => {
    expect(() => validateMaximalAssetShape({ ...photo, alt: null }, "photo")).toThrow(/alt/);
    expect(() => validateMaximalAssetShape({ ...video, alt: null }, "video")).toThrow(/alt/);
  });
});

describe("validateMaximalAssetShape — missing fields", () => {
  it("rejects a photo missing enhancement or its clean revision", () => {
    const rest: Record<string, unknown> = { ...photo };
    delete rest.enhancement;
    expect(() => validateMaximalAssetShape(rest, "photo")).toThrow(/enhancement/);
    expect(() => validateMaximalAssetShape({ ...photo, revisions: {} }, "photo")).toThrow(
      /revisions\.clean/,
    );
  });

  it("rejects a video missing trim, or its web or poster revision", () => {
    const rest: Record<string, unknown> = { ...video };
    delete rest.trim;
    expect(() => validateMaximalAssetShape(rest, "video")).toThrow(/trim/);
    expect(() =>
      validateMaximalAssetShape({ ...video, revisions: { poster: "c3" } }, "video"),
    ).toThrow(/revisions\.web/);
    expect(() =>
      validateMaximalAssetShape({ ...video, revisions: { web: "b2" } }, "video"),
    ).toThrow(/revisions\.poster/);
  });

  it("names every missing field at once", () => {
    expect(() =>
      validateMaximalAssetShape({ ...video, alt: null, revisions: {} }, "video"),
    ).toThrow("alt, revisions.web, revisions.poster");
  });
});
