import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { enhanceActionFor, enhancedCopyOf, replaceIn } from "@/ui/builder/enhance-state";

// What a placement offers about enhancement (T045; FR-052, FR-053), and which existing
// record a second Enhance of the same original reuses (FR-051: the recipe is
// deterministic, so the copy the library holds is the answer the server would give).

function fixture(name: string): AssetView {
  return JSON.parse(
    readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
  ) as AssetView;
}

/** The maximal photo is an enhanced copy of `media2az`; `original` is that source. */
const copy: AssetView = { ...fixture("maximal-asset-photo.json"), cleanUrl: "/copy.jpg" };
const original: AssetView = {
  ...copy,
  id: "media2az",
  enhancement: undefined,
  cleanUrl: "/original.jpg",
};
const clip: AssetView = { ...fixture("maximal-asset-video.json"), posterUrl: "/poster.jpg" };

describe("enhanceActionFor", () => {
  it("offers enhance on a ready original, revert on a copy whose source is here, nothing otherwise", () => {
    expect(enhanceActionFor(original.id, [original, copy])).toEqual({
      kind: "enhance",
      original,
    });
    expect(enhanceActionFor(copy.id, [original, copy])).toEqual({
      kind: "revert",
      sourceMediaId: original.id,
    });
    expect(enhanceActionFor(copy.id, [copy])).toBeNull();
    expect(enhanceActionFor(null, [original])).toBeNull();
    expect(enhanceActionFor("gone2aaa", [original])).toBeNull();
    expect(enhanceActionFor(clip.id, [clip])).toBeNull();
    expect(enhanceActionFor(original.id, [{ ...original, cleanUrl: undefined }])).toBeNull();
  });
});

describe("enhancedCopyOf", () => {
  it("finds the library's auto-v1 copy of an original, and nothing for an original with none", () => {
    expect(enhancedCopyOf(original.id, [original, copy])).toBe(copy);
    expect(enhancedCopyOf(original.id, [original])).toBeUndefined();
    expect(enhancedCopyOf(copy.id, [original, copy])).toBeUndefined();
  });
});

describe("replaceIn", () => {
  it("carries the slot only where the placement has one", () => {
    expect(replaceIn({ blockId: "b" }, "m")).toEqual({
      op: "replace_image",
      blockId: "b",
      mediaId: "m",
    });
    expect(replaceIn({ blockId: "b", slot: 2 }, "m")).toEqual({
      op: "replace_image",
      blockId: "b",
      mediaId: "m",
      slot: 2,
    });
  });
});
