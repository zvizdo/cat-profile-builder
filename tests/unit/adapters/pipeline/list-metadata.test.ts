import { describe, expect, it } from "vitest";
import { listMetadata } from "@/adapters/pipeline/list-metadata";
import { photoAsset, videoAsset } from "../../core/media/builders";
import { bio, document, gallery, hero, photo, video } from "../../core/profile/builders";

// The list metadata every draft save stamps (ADR-015 → Draft saves; design audit P1 #4):
// the name, the display line and one thumbnail — the hero's photo when it is ready and
// cleaned, else the first ready photo the page references, else none. The thumbnail is the
// photo's id and revision, never a URL (F30): resolving one is the list reader's job.

const HERO = photoAsset({ id: "media2aa", revisions: { clean: "aaaaaaaaaa" } });
const OTHER = photoAsset({ id: "media2ab", revisions: { clean: "bbbbbbbbbb" } });
const CLIP = videoAsset({ id: "video2aa" });

describe("listMetadata", () => {
  it("takes the hero's clean photo, the name and the display line", () => {
    const doc = document({
      name: "Charlotte",
      tagline: "A negotiator, not a complainer.",
      blocks: [photo("media2ab"), hero("media2aa")],
    });
    expect(listMetadata(doc, [OTHER, HERO])).toEqual({
      name: "Charlotte",
      line: "A negotiator, not a complainer.",
      thumbnail: { mid: "media2aa", rev: "aaaaaaaaaa" },
    });
  });

  it("falls back to the first ready photo the page references, in document order", () => {
    const processing = { ...HERO, status: "processing" as const, revisions: {} };
    const doc = document({
      blocks: [hero("media2aa"), video("video2aa"), gallery(["media2ab"])],
    });
    expect(listMetadata(doc, [processing, CLIP, OTHER]).thumbnail).toEqual({
      mid: "media2ab",
      rev: "bbbbbbbbbb",
    });
    const noHero = document({ blocks: [bio("She purrs."), photo("media2ab")] });
    expect(listMetadata(noHero, [OTHER])).toEqual({
      name: "Charlotte",
      line: "She purrs.",
      thumbnail: { mid: "media2ab", rev: "bbbbbbbbbb" },
    });
  });

  it("has no thumbnail when no referenced photo is ready, and ignores unreferenced ones", () => {
    const doc = document({ name: "", blocks: [hero(null), video("video2aa")] });
    expect(listMetadata(doc, [HERO, OTHER, CLIP])).toEqual({
      name: "",
      line: "",
      thumbnail: null,
    });
    const missing = document({ blocks: [hero("media2az")] });
    expect(listMetadata(missing, [HERO]).thumbnail).toBeNull();
  });
});
