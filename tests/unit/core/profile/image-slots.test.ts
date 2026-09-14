import { describe, expect, it } from "vitest";
import { placementsOf } from "@/core/profile/image-slots";
import {
  day,
  DAY_ID,
  document,
  gallery,
  GALLERY_ID,
  hero,
  HERO_ID,
  needs,
  photo,
  video,
  VIDEO_ID,
} from "./builders";

// Where a photo sits on the page (T045; FR-053): every slot holding it, in document order,
// each addressed the way `replace_image` addresses it and named the way a sentence names
// it — so phone mode, which has no block editors, can still enhance or revert one
// placement at a time.

describe("placementsOf", () => {
  it("lists every slot holding the id, in document order, with its replace_image address", () => {
    const doc = document({
      sex: "female",
      blocks: [
        hero("media2aa"),
        needs(),
        gallery(["media2ab", "media2aa", "media2ac"]),
        photo("media2ab"),
        day([
          { mediaId: null, caption: "" },
          { mediaId: "media2aa", caption: "" },
          { mediaId: "media2ab", caption: "" },
        ]),
        video("video2aa"),
      ],
    });
    expect(placementsOf(doc, "media2aa")).toEqual([
      { blockId: HERO_ID, label: "the hero" },
      { blockId: GALLERY_ID, slot: 1, label: "slot 2 of the gallery" },
      { blockId: DAY_ID, slot: 1, label: 'scene 2 of the "A day in her life" section' },
    ]);
  });

  it("names a day scene's section in the cat's recorded sex — male, then unset as 'their'", () => {
    const scenes = [
      { mediaId: null, caption: "" },
      { mediaId: "media2aa", caption: "" },
      { mediaId: null, caption: "" },
    ];
    const male = document({ sex: "male", blocks: [hero(null), day(scenes)] });
    expect(placementsOf(male, "media2aa")).toEqual([
      { blockId: DAY_ID, slot: 1, label: 'scene 2 of the "A day in his life" section' },
    ]);
    const unset = document({ blocks: [hero(null), day(scenes)] });
    expect(placementsOf(unset, "media2aa")).toEqual([
      { blockId: DAY_ID, slot: 1, label: 'scene 2 of the "A day in their life" section' },
    ]);
  });

  it("is empty for an id nothing holds, and never names a bio or needs section", () => {
    const doc = document({ blocks: [hero(null), needs(), gallery([])] });
    expect(placementsOf(doc, "media2aa")).toEqual([]);
  });

  it("finds a clip in the video section", () => {
    const doc = document({ blocks: [hero(), video("video2aa")] });
    expect(placementsOf(doc, "video2aa")).toEqual([
      { blockId: VIDEO_ID, label: "the video section" },
    ]);
  });
});
