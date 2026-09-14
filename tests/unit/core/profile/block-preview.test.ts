import { describe, expect, it } from "vitest";
import { type MediaAsset } from "@/core/media/schema";
import { altOf, blockPreview, libraryOf } from "@/core/profile/block-preview";
import { photoAsset, videoAsset } from "../media/builders";
import { bio, day, gallery, hero, needs, photo, quote, video } from "./builders";

// F59: `blockPreview(block, assets)` is the one-line preview `read_outline` has always
// written (`reads.ts`'s old private `outlinePreview`), pulled into core so a `remove_block`
// card can strike the same line rather than a second copy that could drift from it.

const PHOTO = photoAsset({
  id: "media2aa",
  alt: { text: "Charlotte on a windowsill.", source: "model" },
});
const CLIP = videoAsset({
  id: "video2aa",
  alt: { text: "Charlotte batting at a raindrop.", source: "model" },
});
const ASSETS: MediaAsset[] = [PHOTO, CLIP];

describe("blockPreview", () => {
  it("reads a hero or a photo section by its own alt text, or 'No photo yet.' when empty", () => {
    expect(blockPreview(hero("media2aa"), ASSETS)).toBe("Charlotte on a windowsill.");
    expect(blockPreview(hero(null), ASSETS)).toBe("No photo yet.");
    expect(blockPreview(photo("media2aa"), ASSETS)).toBe("Charlotte on a windowsill.");
  });

  it("reads a photo section's own caption over the photo's alt text", () => {
    expect(blockPreview(photo("media2aa", "Asleep on the radiator."), ASSETS)).toBe(
      "Asleep on the radiator.",
    );
  });

  it("names a photo the library no longer has", () => {
    expect(blockPreview(hero("media2ab"), ASSETS)).toBe("no longer in the library");
  });

  it("reads the bio's first line, or 'Empty.' with none", () => {
    expect(blockPreview(bio("She purrs at the kettle.\nMore."), ASSETS)).toBe(
      "She purrs at the kettle.",
    );
    expect(blockPreview(bio(""), ASSETS)).toBe("Empty.");
  });

  it("counts a gallery's photos and a needs section's cards", () => {
    expect(blockPreview(gallery(["media2aa"]), ASSETS)).toBe("1 photo.");
    expect(blockPreview(gallery(["media2aa", "media2ab"]), ASSETS)).toBe("2 photos.");
    expect(blockPreview(needs([{ title: "Quiet", text: "No dogs." }]), ASSETS)).toBe("1 card.");
  });

  it("reads a video by its clip's alt text, or 'No clip yet.' when empty", () => {
    expect(blockPreview(video("video2aa"), ASSETS)).toBe("Charlotte batting at a raindrop.");
    expect(blockPreview(video(null), ASSETS)).toBe("No clip yet.");
  });

  it("counts a day section's scenes", () => {
    expect(blockPreview(day(), ASSETS)).toBe("3 scenes.");
  });

  it("reads a quote's own text, or 'Empty.' with none", () => {
    expect(blockPreview(quote("media2aa", "She purrs at the kettle."), ASSETS)).toBe(
      "She purrs at the kettle.",
    );
    expect(blockPreview(quote("media2aa", ""), ASSETS)).toBe("Empty.");
  });

  it("cuts a long first line at 80 characters with an ellipsis", () => {
    const long = "x".repeat(90);
    expect(blockPreview(bio(long), ASSETS)).toBe(`${"x".repeat(79)}…`);
  });

  // Review round 1, N1: `reads.ts` imports these rather than keeping its own copies, and
  // `readOutline` builds one `library` and hands it to every block's own call, rather
  // than `blockPreview` rebuilding the map once per block.
  it("reads the same answer with a caller's own prebuilt library as it does building one itself", () => {
    const library = libraryOf(ASSETS);
    expect(blockPreview(hero("media2aa"), ASSETS, library)).toBe(
      blockPreview(hero("media2aa"), ASSETS),
    );
  });
});

describe("altOf", () => {
  it("names a record's own description, or the two words for a missing or undescribed one", () => {
    expect(altOf(PHOTO)).toBe("Charlotte on a windowsill.");
    expect(altOf(undefined)).toBe("no longer in the library");
    expect(altOf(photoAsset({ id: "media2ac", alt: null }))).toBe("no description yet");
  });
});

describe("libraryOf", () => {
  it("keys every asset by its own id", () => {
    expect(libraryOf(ASSETS)).toEqual(
      new Map([
        [PHOTO.id, PHOTO],
        [CLIP.id, CLIP],
      ]),
    );
  });
});
