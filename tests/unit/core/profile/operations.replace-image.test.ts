import { describe, expect, it } from "vitest";
import { describeOperation, type EditOperation, type MediaRef } from "@/core/profile/operations";
import { type Block, type ProfileDocument } from "@/core/profile/schema";
import {
  bio,
  BIO_ID,
  day,
  DAY_ID,
  document,
  gallery,
  GALLERY_ID,
  hero,
  HERO_ID,
  needs,
  NEEDS_ID,
  photo,
  PHOTO_ID,
  quote,
  QUOTE_ID,
  video,
  VIDEO_ID,
} from "./builders";
import {
  applied,
  ASSETS,
  ENHANCED_A,
  PHOTO_A,
  PHOTO_B,
  PHOTO_C,
  PHOTO_D,
  rejected,
  UNOWNED,
  VIDEO_A,
} from "./operations.helpers";

// A hero is always first (F1: mandatory, fixed at `blocks[0]`). A caller testing the hero
// itself passes one as `blocks[0]` already; otherwise one is prepended, so the resulting
// document is never rejected by `applyOperation`'s post-change schema check.
function docWith(...blocks: Block[]): ProfileDocument {
  return document({ blocks: blocks[0]?.type === "hero" ? blocks : [hero(), ...blocks] });
}

function replace(blockId: string, mediaId: string, slot?: number): EditOperation {
  return slot === undefined
    ? { op: "replace_image", blockId, mediaId }
    : { op: "replace_image", blockId, mediaId, slot };
}

function describeIt(doc: ProfileDocument, op: EditOperation, assets: MediaRef[] = ASSETS) {
  return describeOperation(doc, op, assets);
}

const SCENES = [
  { mediaId: PHOTO_A, caption: "Morning sunbeam." },
  { mediaId: null, caption: "" },
  { mediaId: PHOTO_B, caption: "" },
];

describe("replace_image on a single-photo section", () => {
  it.each([
    ["hero", hero(), HERO_ID, PHOTO_B],
    ["photo", photo(), PHOTO_ID, PHOTO_C],
    ["quote", quote(), QUOTE_ID, PHOTO_A],
    ["video", video(null), VIDEO_ID, VIDEO_A],
  ] satisfies Array<[string, Block, string, string]>)(
    "fills the %s slot",
    (type, block, id, mediaId) => {
      const next = applied(docWith(block), replace(id, mediaId));
      const changed = { ...block, mediaId };
      expect(next.blocks).toEqual(type === "hero" ? [changed] : [hero(), changed]);
    },
  );

  it("is invalid with a slot, since there is only one photo (or one clip)", () => {
    const error = rejected(docWith(hero()), replace(HERO_ID, PHOTO_B, 0));
    expect(error.code).toBe("invalid");
    expect(error.reason).toBe('The hero has one photo, so "slot" doesn\'t apply.');
    const clip = rejected(docWith(video()), replace(VIDEO_ID, VIDEO_A, 0));
    expect(clip.reason).toBe('The video section has one clip, so "slot" doesn\'t apply.');
  });

  it("is invalid on a section with no photo at all", () => {
    expect(rejected(docWith(bio()), replace(BIO_ID, PHOTO_B)).code).toBe("invalid");
    expect(rejected(docWith(needs()), replace(NEEDS_ID, PHOTO_B)).code).toBe("invalid");
  });

  it("refuses the wrong kind of media for the slot", () => {
    const clipInHero = rejected(docWith(hero()), replace(HERO_ID, VIDEO_A));
    expect(clipInHero.code).toBe("refused");
    expect(clipInHero.reason).toContain("clip");
    const photoInVideo = rejected(docWith(video()), replace(VIDEO_ID, PHOTO_A));
    expect(photoInVideo.code).toBe("refused");
    expect(photoInVideo.reason).toContain("clip");
  });
});

describe("replace_image on a gallery", () => {
  it("needs a slot", () => {
    const error = rejected(docWith(gallery()), replace(GALLERY_ID, PHOTO_D));
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("slot");
  });

  it("replaces the photo at a slot below the length", () => {
    const next = applied(docWith(gallery()), replace(GALLERY_ID, PHOTO_D, 1));
    expect(next.blocks).toEqual([hero(), gallery([PHOTO_A, PHOTO_D, PHOTO_C])]);
  });

  it("appends at a slot equal to the length", () => {
    const next = applied(docWith(gallery()), replace(GALLERY_ID, PHOTO_D, 3));
    expect(next.blocks).toEqual([hero(), gallery([PHOTO_A, PHOTO_B, PHOTO_C, PHOTO_D])]);
  });

  it("refuses a slot past the length", () => {
    const error = rejected(docWith(gallery()), replace(GALLERY_ID, PHOTO_D, 4));
    expect(error.code).toBe("refused");
    expect(error.reason).toContain("3");
  });

  it("refuses appending to a full gallery, since the result would not validate", () => {
    const full = gallery(Array.from({ length: 12 }, () => PHOTO_A));
    expect(rejected(docWith(full), replace(GALLERY_ID, PHOTO_B, 12)).code).toBe("refused");
  });

  it("refuses an unowned id and a clip", () => {
    expect(rejected(docWith(gallery()), replace(GALLERY_ID, UNOWNED, 0)).code).toBe("refused");
    expect(rejected(docWith(gallery()), replace(GALLERY_ID, VIDEO_A, 0)).code).toBe("refused");
  });
});

describe("replace_image on a day-in-her-life section", () => {
  it("needs a slot, and one of the three scenes", () => {
    expect(rejected(docWith(day(SCENES)), replace(DAY_ID, PHOTO_C)).code).toBe("invalid");
    const past = rejected(docWith(day(SCENES)), replace(DAY_ID, PHOTO_C, 3));
    expect(past.code).toBe("refused");
    expect(past.reason).toContain("scene");
  });

  it("fills the scene at the slot", () => {
    const next = applied(docWith(day(SCENES)), replace(DAY_ID, PHOTO_C, 1));
    expect(next.blocks).toEqual([
      hero(),
      day([SCENES[0]!, { mediaId: PHOTO_C, caption: "" }, SCENES[2]!]),
    ]);
  });
});

describe("describeOperation for replace_image", () => {
  it("is destructive into an occupied slot, naming the photo that leaves", () => {
    expect(describeIt(docWith(hero()), replace(HERO_ID, PHOTO_B))).toEqual({
      summary: "Replace the photo in the hero. The photo in the hero leaves Charlotte's page.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
    });
    expect(describeIt(docWith(photo()), replace(PHOTO_ID, PHOTO_C)).summary).toBe(
      "Replace the photo in the photo section. The photo in the photo section leaves Charlotte's page.",
    );
    expect(describeIt(docWith(quote()), replace(QUOTE_ID, PHOTO_A)).summary).toBe(
      "Replace the photo in the quote. The photo in the quote leaves Charlotte's page.",
    );
  });

  it("is not destructive into an empty slot", () => {
    expect(describeIt(docWith(hero(null)), replace(HERO_ID, PHOTO_B))).toEqual({
      summary: "Add a photo to the hero.",
      destructive: false,
      detail: "",
    });
  });

  it("calls a clip a clip", () => {
    expect(describeIt(docWith(video()), replace(VIDEO_ID, VIDEO_A))).toEqual({
      summary:
        "Replace the clip in the video section. The clip in the video section leaves Charlotte's page.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
    });
    expect(describeIt(docWith(video(null)), replace(VIDEO_ID, VIDEO_A)).summary).toBe(
      "Add a clip to the video section.",
    );
  });
});

describe("describeOperation for replace_image over an enhanced copy", () => {
  it("is not destructive when accepting the enhanced copy of the photo in the slot", () => {
    expect(describeIt(docWith(hero(PHOTO_A)), replace(HERO_ID, ENHANCED_A))).toEqual({
      summary: "Use the enhanced photo in the hero.",
      destructive: false,
      detail: "",
    });
  });

  it("is not destructive when reverting to the original the slot's photo was enhanced from", () => {
    expect(describeIt(docWith(hero(ENHANCED_A)), replace(HERO_ID, PHOTO_A))).toEqual({
      summary: "Go back to the original photo in the hero.",
      destructive: false,
      detail: "",
    });
  });

  it("is destructive when neither photo is known to be the other's enhancement", () => {
    const enhancedFromB: MediaRef[] = [
      ...ASSETS,
      { id: "enhan2ab", kind: "photo", enhancement: { sourceMediaId: PHOTO_B, recipe: "auto-v1" } },
    ];
    expect(
      describeIt(docWith(hero(PHOTO_A)), replace(HERO_ID, "enhan2ab"), enhancedFromB).destructive,
    ).toBe(true);
    expect(describeIt(docWith(hero(PHOTO_A)), replace(HERO_ID, UNOWNED)).destructive).toBe(true);
    expect(describeIt(docWith(hero(UNOWNED)), replace(HERO_ID, PHOTO_A)).destructive).toBe(true);
  });
});

describe("describeOperation for replace_image in galleries and scenes", () => {
  it("names a gallery slot by number, and an append as adding", () => {
    expect(describeIt(docWith(gallery()), replace(GALLERY_ID, PHOTO_D, 1))).toEqual({
      summary:
        "Replace the photo in slot 2 of the gallery. The photo in slot 2 of the gallery leaves Charlotte's page.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
    });
    expect(describeIt(docWith(gallery()), replace(GALLERY_ID, PHOTO_D, 3))).toEqual({
      summary: "Add a photo to the gallery.",
      destructive: false,
      detail: "",
    });
  });

  it("names a day scene by number, in the cat's recorded sex", () => {
    const female = { ...docWith(day(SCENES)), sex: "female" as const };
    expect(describeIt(female, replace(DAY_ID, PHOTO_C, 2))).toEqual({
      summary:
        'Replace the photo in scene 3 of the "A day in her life" section. The photo in scene 3 of the "A day in her life" section leaves Charlotte\'s page.',
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
    });
    expect(describeIt(female, replace(DAY_ID, PHOTO_C, 1))).toEqual({
      summary: 'Add a photo to scene 2 of the "A day in her life" section.',
      destructive: false,
      detail: "",
    });
    const male = { ...docWith(day(SCENES)), sex: "male" as const };
    expect(describeIt(male, replace(DAY_ID, PHOTO_C, 2)).summary).toContain(
      '"A day in his life" section',
    );
    // No sex recorded (`docWith` sets none) falls to "their".
    expect(describeIt(docWith(day(SCENES)), replace(DAY_ID, PHOTO_C, 2)).summary).toContain(
      '"A day in their life" section',
    );
  });

  it("is plain and not destructive for a slot it cannot read", () => {
    expect(describeIt(docWith(hero()), replace(HERO_ID, PHOTO_B, 0))).toEqual({
      summary: "Replace a photo.",
      destructive: false,
      detail: "",
    });
    expect(describeIt(docWith(gallery()), replace(GALLERY_ID, PHOTO_B, 9))).toEqual({
      summary: "Replace a photo.",
      destructive: false,
      detail: "",
    });
    expect(describeIt(document(), replace("blockmissing", PHOTO_B))).toEqual({
      summary: "Change a section that is no longer on the page.",
      destructive: false,
      detail: "",
    });
  });

  it("finds nothing destructive on an empty page", () => {
    const empty = document({ name: "", blocks: [{ ...hero(null) }] });
    expect(describeIt(empty, replace(HERO_ID, PHOTO_A)).destructive).toBe(false);
  });
});
