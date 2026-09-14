import { describe, expect, it } from "vitest";
import { type MediaAsset } from "@/core/media/schema";
import type { EditOperation } from "@/core/profile/operations";
import { mediaChange, removalPreview } from "@/core/profile/media-change";
import { photoAsset, videoAsset } from "../media/builders";
import {
  bio,
  day,
  DAY_ID,
  document,
  gallery,
  GALLERY_ID,
  hero,
  HERO_ID,
  needs,
  photo,
  PHOTO_ID,
  quote,
  QUOTE_ID,
  video,
  VIDEO_ID,
} from "./builders";

// F59: the image half of F58's `textChange` — `mediaChange(doc, assets, op)` is the
// before → after `replace_image` proposes and the dropped/kept ids a gallery's
// `set_field mediaIds` proposes; `removalPreview(doc, assets, op)` is the struck line
// and face a `remove_block` card draws, reusing `blockPreview` so the two texts can
// never disagree. Both `null` for every operation neither draws (F58's text fields, an
// add, a reorder, a theme change).

const PHOTO_A = photoAsset({
  id: "media2aa",
  alt: { text: "On the windowsill.", source: "model" },
});
const PHOTO_B = photoAsset({ id: "media2ab", alt: { text: "Napping.", source: "model" } });
const PHOTO_C = photoAsset({ id: "media2ac", alt: { text: "In the sun.", source: "model" } });
const CLIP = videoAsset({
  id: "video2aa",
  alt: { text: "Batting at a raindrop.", source: "model" },
});
const CLIP_B = videoAsset({
  id: "video2ab",
  alt: { text: "Chasing the red dot.", source: "model" },
});
const ASSETS: MediaAsset[] = [PHOTO_A, PHOTO_B, PHOTO_C, CLIP, CLIP_B];

const DOC = document({
  blocks: [
    hero("media2aa"),
    bio("She purrs at the kettle."),
    photo("media2ab", "Asleep on the radiator."),
    gallery(["media2aa", "media2ab", "media2ac"]),
    video("video2aa"),
    day(),
    needs([{ title: "Quiet", text: "No dogs." }]),
    quote("media2ac", "She purrs at the kettle."),
  ],
});

function replaceImage(blockId: string, mediaId: string, slot?: number): EditOperation {
  return slot === undefined
    ? { op: "replace_image", blockId, mediaId }
    : { op: "replace_image", blockId, mediaId, slot };
}

function setMediaIds(blockId: string, value: unknown): EditOperation {
  return {
    op: "set_field",
    target: { kind: "block", blockId },
    path: "mediaIds",
    value,
  } as EditOperation;
}

function removeBlock(blockId: string): EditOperation {
  return { op: "remove_block", blockId };
}

describe("mediaChange", () => {
  it("answers the before → after of a replace_image on a single-photo slot, each face known", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(HERO_ID, "media2ab"))).toEqual({
      kind: "photo",
      label: "the hero",
      before: { mediaId: "media2aa", known: true },
      after: { mediaId: "media2ab", known: true },
    });
  });

  it("answers the before → after of a replace_image on a gallery slot", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(GALLERY_ID, "media2ac", 0))).toEqual({
      kind: "photo",
      label: "slot 1 of the gallery",
      before: { mediaId: "media2aa", known: true },
      after: { mediaId: "media2ac", known: true },
    });
  });

  it("answers the before → after of a replace_image on a video section", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(VIDEO_ID, "video2ab"))).toEqual({
      kind: "photo",
      label: "the video section",
      before: { mediaId: "video2aa", known: true },
      after: { mediaId: "video2ab", known: true },
    });
  });

  // Review round 1, N3: a photo section, a quote's photo and a day scene are the memo's
  // remaining `replace_image` targets — the path is shared through `imageSlotOf`, but
  // the day's own label (naming the scene) is worth its own assertion.
  it("answers the before → after of a replace_image on a photo section", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(PHOTO_ID, "media2ac"))).toEqual({
      kind: "photo",
      label: "the photo section",
      before: { mediaId: "media2ab", known: true },
      after: { mediaId: "media2ac", known: true },
    });
  });

  it("answers the before → after of a replace_image on a quote's photo", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(QUOTE_ID, "media2aa"))).toEqual({
      kind: "photo",
      label: "the quote",
      before: { mediaId: "media2ac", known: true },
      after: { mediaId: "media2aa", known: true },
    });
  });

  it("answers the before → after of a replace_image on a day scene, labelled by scene", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(DAY_ID, "media2ac", 1))).toEqual({
      kind: "photo",
      label: 'scene 2 of the "A day in their life" section',
      before: { mediaId: "media2ab", known: true },
      after: { mediaId: "media2ac", known: true },
    });
  });

  // Review round 1, N2: the same id twice says nothing — no pair to draw. The
  // root cause (`describe.ts` cards a same-id `replace_image` as destructive) is
  // pre-existing and out of scope here.
  it("answers null for a replace_image that names the slot's own current id", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(HERO_ID, "media2aa"))).toBeNull();
    expect(mediaChange(DOC, ASSETS, replaceImage(VIDEO_ID, "video2aa"))).toBeNull();
  });

  it("marks the proposed id unknown when the library has since lost it", () => {
    expect(mediaChange(DOC, ASSETS, replaceImage(HERO_ID, "media2ag"))).toEqual({
      kind: "photo",
      label: "the hero",
      before: { mediaId: "media2aa", known: true },
      after: { mediaId: "media2ag", known: false },
    });
  });

  it("answers null for a slot the document has nothing in yet", () => {
    const empty = document({ blocks: [hero(null)] });
    expect(mediaChange(empty, ASSETS, replaceImage(HERO_ID, "media2aa"))).toBeNull();
  });

  it("answers the dropped and kept ids of a gallery's set_field mediaIds", () => {
    expect(mediaChange(DOC, ASSETS, setMediaIds(GALLERY_ID, ["media2aa"]))).toEqual({
      kind: "gallery",
      label: "the gallery",
      dropped: [
        { mediaId: "media2ab", known: true },
        { mediaId: "media2ac", known: true },
      ],
      kept: [{ mediaId: "media2aa", known: true }],
    });
  });

  it("answers null for a set_field on a path that is not the gallery's photos", () => {
    expect(mediaChange(DOC, ASSETS, setMediaIds(DAY_ID, ["media2aa"]))).toBeNull();
  });

  it("answers null for every operation with no image change", () => {
    const ops: EditOperation[] = [
      { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } },
      { op: "reorder_blocks", order: DOC.blocks.map((b) => b.id) },
      { op: "set_theme", preset: "sand" },
      { op: "remove_block", blockId: HERO_ID },
      {
        op: "set_field",
        target: { kind: "profile" },
        path: "name",
        value: "Marmalade",
      } as EditOperation,
    ];
    for (const op of ops) expect(mediaChange(DOC, ASSETS, op)).toBeNull();
  });
});

describe("removalPreview", () => {
  it("answers the block's own line and its single photo for a hero, a photo section, a video and a quote", () => {
    expect(removalPreview(DOC, ASSETS, removeBlock(HERO_ID))).toEqual({
      label: "hero",
      text: "On the windowsill.",
      face: { mediaId: "media2aa", known: true },
    });
    expect(removalPreview(DOC, ASSETS, removeBlock(PHOTO_ID))).toEqual({
      label: "photo section",
      text: "Asleep on the radiator.",
      face: { mediaId: "media2ab", known: true },
    });
    expect(removalPreview(DOC, ASSETS, removeBlock(VIDEO_ID))).toEqual({
      label: "video section",
      text: "Batting at a raindrop.",
      face: { mediaId: "video2aa", known: true },
    });
    expect(removalPreview(DOC, ASSETS, removeBlock(QUOTE_ID))).toEqual({
      label: "quote",
      text: "She purrs at the kettle.",
      face: { mediaId: "media2ac", known: true },
    });
  });

  it("answers no face for a section with none, several, or a written list", () => {
    expect(removalPreview(DOC, ASSETS, removeBlock("blockaaaaaab"))).toEqual({
      label: "bio",
      text: "She purrs at the kettle.",
      face: null,
    });
    expect(removalPreview(DOC, ASSETS, removeBlock(GALLERY_ID))).toEqual({
      label: "gallery",
      text: "3 photos.",
      face: null,
    });
    expect(removalPreview(DOC, ASSETS, removeBlock(DAY_ID))).toEqual({
      label: '"A day in their life" section',
      text: "3 scenes.",
      face: null,
    });
    expect(removalPreview(DOC, ASSETS, removeBlock("blockaaaaaag"))).toEqual({
      label: '"What they need" section',
      text: "1 card.",
      face: null,
    });
  });

  it("marks the face unknown when the library has since lost the photo", () => {
    const gone = document({ blocks: [hero("media2ag")] });
    expect(removalPreview(gone, ASSETS, removeBlock(HERO_ID))).toEqual({
      label: "hero",
      text: "no longer in the library",
      face: { mediaId: "media2ag", known: false },
    });
  });

  it("answers null for a block the document no longer has, and for every other operation", () => {
    expect(removalPreview(DOC, ASSETS, removeBlock("blockzzzzzzz"))).toBeNull();
    expect(removalPreview(DOC, ASSETS, replaceImage(HERO_ID, "media2ab"))).toBeNull();
  });
});
