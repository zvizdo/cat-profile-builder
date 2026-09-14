import { describe, expect, it } from "vitest";
import { BlockInputSchema } from "@/core/profile/operations";
import {
  BLOCK_TYPES,
  emptyBlock,
  frameLabel,
  pickerLabel,
  tileName,
} from "@/ui/builder/block-content";

// What the rail and the frames say about each section type (CONTENT.md → Rail, Block
// labels): the seven addable types (F1: the hero is never one of them — every profile
// already has one, mandatory and fixed at the top), the empty block each `Add section`
// tile adds, the tile's word and the frame's mono label.

describe("BLOCK_TYPES", () => {
  it("names the seven addable canvas block types in rail order, the hero excluded", () => {
    expect(BLOCK_TYPES).toEqual(["bio", "photo", "gallery", "video", "day", "needs", "quote"]);
  });
});

describe("emptyBlock", () => {
  it("is a legal block input for every type", () => {
    for (const type of BLOCK_TYPES) {
      const input = emptyBlock(type);
      expect(input.type).toBe(type);
      expect(BlockInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it("gives a day section its three empty scenes and a needs section one empty card", () => {
    expect(emptyBlock("day")).toEqual({
      type: "day",
      scenes: [
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
      ],
    });
    expect(emptyBlock("needs")).toEqual({ type: "needs", cards: [{ title: "", text: "" }] });
    expect(emptyBlock("gallery")).toEqual({ type: "gallery", mediaIds: [] });
    expect(emptyBlock("bio")).toEqual({ type: "bio", content: { paragraphs: [] } });
  });
});

describe("tileName", () => {
  it("is the rail's word for each type", () => {
    expect(tileName("hero")).toBe("Hero");
    expect(tileName("day")).toBe("Day");
    expect(tileName("needs")).toBe("Needs");
  });
});

describe("frameLabel", () => {
  it("is CONTENT.md's mono label for the fixed types", () => {
    expect(frameLabel({ id: "blockaaaaaaa", type: "hero", mediaId: null })).toBe(
      "HERO · full-bleed photo + name",
    );
    expect(frameLabel({ id: "blockaaaaaaa", type: "bio", content: { paragraphs: [] } })).toBe(
      "BIO · paragraphs, bold, italic, links",
    );
    expect(frameLabel({ id: "blockaaaaaaa", type: "video", mediaId: null })).toBe(
      "VIDEO · one clip, trimmed",
    );
  });

  it("counts the gallery's photos", () => {
    expect(frameLabel({ id: "blockaaaaaaa", type: "gallery", mediaIds: [] })).toBe(
      "GALLERY · 0 of up to 12",
    );
    expect(
      frameLabel({
        id: "blockaaaaaaa",
        type: "gallery",
        mediaIds: ["media2aa", "media2ab", "media2ac"],
      }),
    ).toBe("GALLERY · 3 of up to 12");
  });
});

describe("pickerLabel", () => {
  it("is the same mono label a fixed type's frame shows once it exists", () => {
    expect(pickerLabel("bio")).toBe("BIO · paragraphs, bold, italic, links");
    expect(pickerLabel("video")).toBe("VIDEO · one clip, trimmed");
  });

  it("names the gallery's cap rather than a count it doesn't have yet", () => {
    expect(pickerLabel("gallery")).toBe("GALLERY · up to 12 photos");
  });
});
