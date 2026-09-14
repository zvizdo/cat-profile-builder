import { describe, expect, it } from "vitest";
import { describeOperation, type BlockInput, type EditOperation } from "@/core/profile/operations";
import { type Block, type ProfileDocument } from "@/core/profile/schema";
import {
  bio,
  BIO_ID,
  DAY_ID,
  day,
  document,
  gallery,
  GALLERY_ID,
  hero,
  HERO_ID,
  NEEDS_ID,
  needs,
  photo,
  PHOTO_ID,
  quote,
  QUOTE_ID,
  VIDEO_ID,
} from "./builders";
import {
  ASSETS,
  ENHANCED_A,
  PHOTO_A,
  PHOTO_B,
  PHOTO_C,
  PHOTO_D,
  UNOWNED,
  VIDEO_A,
} from "./operations.helpers";

// F21: the helper never shows an id to the volunteer. `describeOperation`'s `summary` is
// exactly what the proposal card and the turn-summary line render verbatim (HelperPanel.tsx,
// TurnSummary.tsx), so it must never leak a block id, a media id, the document's own id, or
// a dotted field path such as "scenes.2.caption" — only a section's type/place ("the
// second gallery", "the bio") or a few words of its content.

function docWith(...blocks: Block[]): ProfileDocument {
  return document({ blocks: blocks[0]?.type === "hero" ? blocks : [hero(), ...blocks] });
}

/** Every id these fixtures could conceivably leak — block ids, media ids and the document's
 * own id — collected once so every case below checks against the same list. */
const ALL_IDS = [
  document().id,
  HERO_ID,
  BIO_ID,
  PHOTO_ID,
  GALLERY_ID,
  VIDEO_ID,
  DAY_ID,
  NEEDS_ID,
  QUOTE_ID,
  PHOTO_A,
  PHOTO_B,
  PHOTO_C,
  PHOTO_D,
  VIDEO_A,
  ENHANCED_A,
  UNOWNED,
];

/** A dotted field path such as `scenes.2.caption` or `cards.0.title` — a word, a number,
 * and a word joined by dots with no spaces. Ordinary sentences never take this shape. */
const DOTTED_PATH = /[a-zA-Z]+\.\d+\.[a-zA-Z]+/;

function expectNoIdsOrPaths(summary: string): void {
  for (const id of ALL_IDS) {
    expect(summary).not.toContain(id);
  }
  expect(summary).not.toMatch(DOTTED_PATH);
}

describe("describeOperation never names an id or a dotted path", () => {
  it("set_field on the profile", () => {
    const doc = docWith(bio());
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "profile" },
      path: "name",
      value: "Whiskers",
    };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("set_field on a block (the bio's own text)", () => {
    const doc = docWith(bio("Already here."));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: { paragraphs: [{ runs: [{ text: "New bio." }] }] },
    };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("set_field on a dotted block path names the scene, not the path", () => {
    const doc = docWith(day());
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: DAY_ID },
      path: "scenes.2.caption",
      value: "New caption.",
    };
    const { summary } = describeOperation(doc, op, ASSETS);
    expectNoIdsOrPaths(summary);
    expect(summary).toContain("scene 3");
  });

  const ADD_BLOCK_INPUTS: BlockInput[] = [
    { type: "hero", mediaId: null },
    { type: "bio", content: { paragraphs: [] } },
    { type: "photo", mediaId: null },
    { type: "gallery", mediaIds: [] },
    { type: "video", mediaId: null },
    {
      type: "day",
      scenes: [
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
      ],
    },
    { type: "needs", cards: [{ title: "", text: "" }] },
    { type: "quote", mediaId: null, text: "" },
  ];

  it.each(ADD_BLOCK_INPUTS.map((block) => [block.type, block] as const))(
    "add_block for %s",
    (_type, block) => {
      const doc = docWith();
      const op: EditOperation = { op: "add_block", block };
      expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
    },
  );

  it("remove_block", () => {
    const doc = docWith(bio("Some text about her."));
    const op: EditOperation = { op: "remove_block", blockId: BIO_ID };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("reorder_blocks", () => {
    const doc = docWith(bio(), gallery());
    const op: EditOperation = { op: "reorder_blocks", order: [HERO_ID, GALLERY_ID, BIO_ID] };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("set_theme", () => {
    const doc = docWith(bio());
    const op: EditOperation = { op: "set_theme", preset: "sand", warmth: 0.7 };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("replace_image", () => {
    const doc = docWith(photo(PHOTO_A));
    const op: EditOperation = { op: "replace_image", blockId: PHOTO_ID, mediaId: PHOTO_B };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });

  it("replace_image on a slotted section (a gallery)", () => {
    const doc = docWith(gallery([PHOTO_A, PHOTO_B]));
    const op: EditOperation = {
      op: "replace_image",
      blockId: GALLERY_ID,
      mediaId: PHOTO_C,
      slot: 0,
    };
    expectNoIdsOrPaths(describeOperation(doc, op, ASSETS).summary);
  });
});

// F26: the proposal card's ledger shows a before → after readout next to the sentence
// where the operation has one (audit §3.5). `readout` is additive on `Description`: the
// bio's word counts, a moved section's positions, a theme's preset names with the two
// themes for the swatches, and a gallery's photo count. Operations without a measurable
// pair (an add, a removal) carry none.

const HI_BIO = { paragraphs: [{ runs: [{ text: "A calm, curious cat who loves a lap." }] }] };

describe("describeOperation readouts (F26)", () => {
  it("set_field on a written bio counts words before and after", () => {
    const doc = docWith(
      bio(
        "Charlotte is a calm, curious cat. She loves a lap and a window. Sunbeams are her thing.",
      ),
    );
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: HI_BIO,
    };
    expect(describeOperation(doc, op, ASSETS).readout).toEqual({
      before: "17",
      after: "8",
      unit: "words",
    });
  });

  it("set_field writing an empty bio has no readout — there is no before", () => {
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: HI_BIO,
    };
    expect(describeOperation(docWith(bio()), op, ASSETS).readout).toBeUndefined();
  });

  it("set_field on a short text field reads the two values themselves", () => {
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "profile" },
      path: "name",
      value: "Whiskers",
    };
    expect(describeOperation(docWith(bio()), op, ASSETS).readout).toEqual({
      before: "Charlotte",
      after: "Whiskers",
    });
  });

  it("set_field on a long text field falls back to word counts", () => {
    const doc = docWith(quote("media2ac", "She purrs at the kettle and sleeps on the post."));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: QUOTE_ID },
      path: "text",
      value: "She purrs at the kettle.",
    };
    expect(describeOperation(doc, op, ASSETS).readout).toEqual({
      before: "10",
      after: "5",
      unit: "words",
    });
  });

  it("reorder_blocks reads the moved section's position before and after, counting from the top", () => {
    const doc = docWith(bio(), gallery(), quote());
    const op: EditOperation = {
      op: "reorder_blocks",
      order: [HERO_ID, QUOTE_ID, BIO_ID, GALLERY_ID],
    };
    const { summary, readout } = describeOperation(doc, op, ASSETS);
    expect(summary).toBe("Move the quote above the bio.");
    expect(readout).toEqual({ before: "4", after: "2" });
  });

  it("reorder_blocks that changes nothing has no readout", () => {
    const doc = docWith(bio(), gallery());
    const op: EditOperation = { op: "reorder_blocks", order: [HERO_ID, BIO_ID, GALLERY_ID] };
    expect(describeOperation(doc, op, ASSETS).readout).toBeUndefined();
  });

  it("set_theme with a preset reads the two preset names and carries both themes for the swatches", () => {
    const doc = docWith(bio());
    const op: EditOperation = { op: "set_theme", preset: "sand", warmth: 0.7 };
    expect(describeOperation(doc, op, ASSETS).readout).toEqual({
      before: "Paper",
      after: "Sand",
      themes: {
        before: { preset: "paper", warmth: 0.5, contrast: 0.5 },
        after: { preset: "sand", warmth: 0.7, contrast: 0.5 },
      },
    });
  });

  it("set_theme moving one slider reads its value before and after", () => {
    const doc = docWith(bio());
    const op: EditOperation = { op: "set_theme", warmth: 0.62 };
    expect(describeOperation(doc, op, ASSETS).readout).toEqual({
      before: "0.50",
      after: "0.62",
      unit: "warmth",
      themes: {
        before: { preset: "paper", warmth: 0.5, contrast: 0.5 },
        after: { preset: "paper", warmth: 0.62, contrast: 0.5 },
      },
    });
  });

  it("set_theme moving both sliders without a preset keeps the sentence alone", () => {
    const doc = docWith(bio());
    const op: EditOperation = { op: "set_theme", warmth: 0.2, contrast: 0.8 };
    expect(describeOperation(doc, op, ASSETS).readout).toBeUndefined();
  });

  it("set_field on the gallery counts photos before and after", () => {
    const doc = docWith(gallery([PHOTO_A, PHOTO_B, PHOTO_C]));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: GALLERY_ID },
      path: "mediaIds",
      value: [PHOTO_A, PHOTO_C],
    };
    expect(describeOperation(doc, op, ASSETS).readout).toEqual({
      before: "3",
      after: "2",
      unit: "photos",
    });
  });

  it("an add and a removal carry no readout", () => {
    const doc = docWith(bio("Some text."));
    expect(
      describeOperation(doc, { op: "remove_block", blockId: BIO_ID }, ASSETS).readout,
    ).toBeUndefined();
    expect(
      describeOperation(
        doc,
        { op: "add_block", block: { type: "quote", mediaId: null, text: "" } },
        ASSETS,
      ).readout,
    ).toBeUndefined();
  });
});

// F42 (build-stall-investigation.md): the model re-set the name, age and sex the volunteer
// had already typed, and each same-value `set_field` was called destructive — three cards
// in one step. A value equal to the field's current one loses nothing: it is neutral, and
// the sentence says so, so the reducer can answer it at once and list it nowhere.
describe("describeOperation — a set_field to the value already held is not destructive (F42)", () => {
  it("the same name", () => {
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "profile" },
      path: "name",
      value: "Charlotte",
    };
    const description = describeOperation(docWith(bio()), op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("The name is already Charlotte.");
    expect(description.detail).toBe("");
    expect(description.readout).toBeUndefined();
  });

  it("the same sex (an enum field, read as text)", () => {
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "profile" },
      path: "sex",
      value: "female",
    };
    const description = describeOperation(document({ sex: "female" }), op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("The sex is already female.");
  });

  it("a long text field says unchanged rather than repeating it", () => {
    const text = "She purrs at the kettle and sleeps on the post, every single day.";
    const doc = docWith(quote("media2ac", text));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: QUOTE_ID },
      path: "text",
      value: text,
    };
    const description = describeOperation(doc, op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("The quote is unchanged.");
  });

  it("identical bio paragraphs", () => {
    const doc = docWith(bio("Charlotte is a calm, curious cat."));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: { paragraphs: [{ runs: [{ text: "Charlotte is a calm, curious cat." }] }] },
    };
    const description = describeOperation(doc, op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("The bio is unchanged.");
    expect(description.readout).toBeUndefined();
  });

  it("a bio with the same words but different marks is still a change (structural, not plain-text, equality)", () => {
    const doc = docWith(bio("Charlotte is a calm, curious cat."));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: {
        paragraphs: [{ runs: [{ text: "Charlotte is a calm, curious cat.", bold: true }] }],
      },
    };
    expect(describeOperation(doc, op, ASSETS).destructive).toBe(true);
  });

  it("the same gallery ids in the same order", () => {
    const doc = docWith(gallery([PHOTO_A, PHOTO_B, PHOTO_C]));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: GALLERY_ID },
      path: "mediaIds",
      value: [PHOTO_A, PHOTO_B, PHOTO_C],
    };
    const description = describeOperation(doc, op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("The gallery photos are unchanged.");
  });

  it("the same gallery ids in another order is a change (neutral, as before)", () => {
    const doc = docWith(gallery([PHOTO_A, PHOTO_B, PHOTO_C]));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: GALLERY_ID },
      path: "mediaIds",
      value: [PHOTO_C, PHOTO_B, PHOTO_A],
    };
    const description = describeOperation(doc, op, ASSETS);
    expect(description.destructive).toBe(false);
    expect(description.summary).toBe("Change the gallery photos.");
  });

  it("the same needs cards", () => {
    const doc = docWith(needs([{ title: "Quiet", text: "No dogs." }]));
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: NEEDS_ID },
      path: "cards",
      value: [{ title: "Quiet", text: "No dogs." }],
    };
    const description = describeOperation(doc, op, ASSETS);
    expect(description.destructive).toBe(false);
    // `docWith`'s document never records a sex (F41), so the cards read with the
    // neutral pronoun, same as every other unset-sex sentence in this file.
    expect(description.summary).toBe('The "What they need" cards are unchanged.');
  });
});
