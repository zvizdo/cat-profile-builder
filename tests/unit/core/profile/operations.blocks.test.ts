import { describe, expect, it } from "vitest";
import { describeOperation, type BlockInput, type EditOperation } from "@/core/profile/operations";
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
  quote,
  video,
  VIDEO_ID,
} from "./builders";
import {
  applied,
  ASSETS,
  NEW_ID,
  PHOTO_A,
  PHOTO_B,
  PHOTO_C,
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

function describeIt(doc: ProfileDocument, op: EditOperation) {
  return describeOperation(doc, op, ASSETS);
}

const EMPTY_BIO: BlockInput = { type: "bio", content: { paragraphs: [] } };

describe("add_block", () => {
  it("appends when no index is given, with an id from the context", () => {
    const next = applied(document(), { op: "add_block", block: EMPTY_BIO });
    expect(next.blocks).toEqual([hero(), bio(), { id: NEW_ID, ...EMPTY_BIO }]);
  });

  it("inserts at the index (after the hero), and an index equal to the length appends", () => {
    const middle = applied(document(), { op: "add_block", block: EMPTY_BIO, index: 1 });
    expect(middle.blocks.map((block) => block.id)).toEqual([HERO_ID, NEW_ID, BIO_ID]);
    const last = applied(document(), { op: "add_block", block: EMPTY_BIO, index: 2 });
    expect(last.blocks.map((block) => block.id)).toEqual([HERO_ID, BIO_ID, NEW_ID]);
  });

  it("refuses an index of 0, which would displace the hero (F1)", () => {
    const error = rejected(document(), { op: "add_block", block: EMPTY_BIO, index: 0 });
    expect(error.code).toBe("refused");
    expect(error.reason).toBe("The hero stays at the top.");
  });

  it("is invalid for an index past the end", () => {
    const error = rejected(document(), { op: "add_block", block: EMPTY_BIO, index: 3 });
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("2");
  });

  it("refuses a second hero (FR-021: the hero cannot be duplicated)", () => {
    const error = rejected(document(), { op: "add_block", block: { type: "hero", mediaId: null } });
    expect(error.code).toBe("refused");
    expect(error.reason).toContain("hero");
  });

  it("always refuses adding a hero, since one always exists (F1)", () => {
    const error = rejected(docWith(bio()), {
      op: "add_block",
      block: { type: "hero", mediaId: PHOTO_A },
    });
    expect(error.code).toBe("refused");
    expect(error.reason).toBe("There is already a hero.");
  });
});

describe("add_block as duplicate (FR-021)", () => {
  it("duplicates a section as a copy with a fresh id at index + 1", () => {
    const doc = docWith(hero(), gallery(), bio());
    const copy: BlockInput = { type: "gallery", mediaIds: [PHOTO_A, PHOTO_B, PHOTO_C] };
    const next = applied(doc, { op: "add_block", block: copy, index: 2 });
    expect(next.blocks.map((block) => block.id)).toEqual([HERO_ID, GALLERY_ID, NEW_ID, BIO_ID]);
    expect(next.blocks[2]).toEqual({ ...gallery(), id: NEW_ID });
  });
});

describe("add_block and media", () => {
  it.each([
    ["photo", { type: "photo", mediaId: UNOWNED }],
    ["hero", { type: "hero", mediaId: VIDEO_A }],
    ["video", { type: "video", mediaId: PHOTO_A }],
    ["gallery", { type: "gallery", mediaIds: [PHOTO_A, VIDEO_A] }],
    ["quote", { type: "quote", mediaId: UNOWNED, text: "" }],
    [
      "day",
      {
        type: "day",
        scenes: [
          { mediaId: null, caption: "" },
          { mediaId: UNOWNED, caption: "" },
          { mediaId: null, caption: "" },
        ],
      },
    ],
  ] satisfies Array<[string, BlockInput]>)(
    "refuses a %s whose media is not owned or is the wrong kind",
    (_type, block) => {
      const error = rejected(docWith(bio()), { op: "add_block", block });
      expect(error.code).toBe("refused");
    },
  );

  it("adds a video that names a clip, and empty slots need no media", () => {
    const withClip = applied(docWith(bio()), {
      op: "add_block",
      block: { type: "video", mediaId: VIDEO_A },
    });
    expect(withClip.blocks[2]).toEqual({ id: NEW_ID, type: "video", mediaId: VIDEO_A });
    const empty = applied(docWith(bio()), {
      op: "add_block",
      block: { type: "photo", mediaId: null },
    });
    expect(empty.blocks[2]).toEqual({ id: NEW_ID, type: "photo", mediaId: null });
  });
});

describe("describeOperation for add_block", () => {
  it.each([
    [{ type: "hero", mediaId: null }, "Add a hero."],
    [EMPTY_BIO, "Add a bio."],
    [{ type: "photo", mediaId: null }, "Add a photo section."],
    [{ type: "gallery", mediaIds: [] }, "Add a gallery."],
    [{ type: "video", mediaId: null }, "Add a video section."],
    [
      {
        type: "day",
        scenes: [
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
        ],
      },
      // `docWith` never sets a sex (undefined), which reads as "they" — the same
      // fallback every other pronoun in the app falls back to; the sex-specific forms
      // are covered just below.
      'Add an "A day in their life" section.',
    ],
    [{ type: "needs", cards: [{ title: "", text: "" }] }, 'Add a "What they need" section.'],
    [{ type: "quote", mediaId: null, text: "" }, "Add a quote."],
  ] satisfies Array<[BlockInput, string]>)(
    "describes adding %o as never destructive",
    (block, summary) => {
      expect(describeIt(docWith(bio("Hi.")), { op: "add_block", block })).toEqual({
        summary,
        destructive: false,
        detail: "",
      });
    },
  );

  it("names the day and needs sections in the cat's recorded sex — F41", () => {
    const dayBlock: BlockInput = {
      type: "day",
      scenes: [
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
      ],
    };
    const needsBlock: BlockInput = { type: "needs", cards: [{ title: "", text: "" }] };
    const female = { ...docWith(bio("Hi.")), sex: "female" as const };
    const male = { ...docWith(bio("Hi.")), sex: "male" as const };
    expect(describeIt(female, { op: "add_block", block: dayBlock }).summary).toBe(
      'Add an "A day in her life" section.',
    );
    expect(describeIt(male, { op: "add_block", block: dayBlock }).summary).toBe(
      'Add an "A day in his life" section.',
    );
    expect(describeIt(female, { op: "add_block", block: needsBlock }).summary).toBe(
      'Add a "What she needs" section.',
    );
    expect(describeIt(male, { op: "add_block", block: needsBlock }).summary).toBe(
      'Add a "What he needs" section.',
    );
  });
});

describe("remove_block", () => {
  it("removes the named section and nothing else", () => {
    const next = applied(document(), { op: "remove_block", blockId: BIO_ID });
    expect(next.blocks).toEqual([hero()]);
  });

  it("refuses to remove the hero: it stays, mandatory and fixed at the top (F1)", () => {
    const error = rejected(document(), { op: "remove_block", blockId: HERO_ID });
    expect(error.code).toBe("refused");
    expect(error.reason).toBe("The hero stays; replace its photo instead.");
  });

  it.each([
    [gallery(), "gallery", "three photos"],
    [gallery([PHOTO_A, PHOTO_B]), "gallery", "two photos"],
    [hero(), "hero", "one photo"],
    [hero(null), "hero", "it"],
    [video(), "video section", "the clip"],
    [video(null), "video section", "it"],
    [bio("Hi."), "bio", "your text"],
    [bio(), "bio", "it"],
    [photo(PHOTO_B, "Rain."), "photo section", "one photo and your text"],
    [photo(null), "photo section", "it"],
    [quote(), "quote", "one photo and your text"],
    [quote(null, ""), "quote", "it"],
    // `docWith` never sets a sex (undefined), which reads as "they"; the sex-specific
    // forms for the day and needs sections are covered just below.
    [day(), '"A day in their life" section', "two photos and your text"],
    [needs(), '"What they need" section', "your text"],
    [needs([{ title: "", text: "" }]), '"What they need" section', "it"],
  ] satisfies Array<[Block, string, string]>)(
    // T038 review, finding 2: removing a block — including the bio block, here — is not the
    // bio-authored-text branch (`describeBio`, tested in operations.set-field.test.ts); it
    // keeps the generic reassurance alone, never "You wrote that paragraph."
    "describes removing %o as destructive, naming what comes off the page, with the generic detail",
    (block, label, loss) => {
      expect(describeIt(docWith(block), { op: "remove_block", blockId: block.id })).toEqual({
        summary: `Remove the ${label}. Removing the ${label} takes ${loss} off Charlotte's page.`,
        destructive: true,
        detail: "The original is recoverable with one undo, and only one.",
      });
    },
  );

  it("names the removed day and needs sections in the cat's recorded sex — F41", () => {
    const female = { ...docWith(day()), sex: "female" as const };
    const male = { ...docWith(needs()), sex: "male" as const };
    expect(describeIt(female, { op: "remove_block", blockId: DAY_ID }).summary).toBe(
      'Remove the "A day in her life" section. Removing the "A day in her life" section takes two photos and your text off Charlotte\'s page.',
    );
    expect(describeIt(male, { op: "remove_block", blockId: NEEDS_ID }).summary).toBe(
      'Remove the "What he needs" section. Removing the "What he needs" section takes your text off Charlotte\'s page.',
    );
  });

  it("says 'the page' when the cat has no name yet", () => {
    const doc = document({ name: "", blocks: [gallery()] });
    expect(describeIt(doc, { op: "remove_block", blockId: GALLERY_ID }).summary).toBe(
      "Remove the gallery. Removing the gallery takes three photos off the page.",
    );
  });

  it("names a section that is no longer on the page", () => {
    expect(describeIt(document(), { op: "remove_block", blockId: "blockmissing" })).toEqual({
      summary: "Change a section that is no longer on the page.",
      destructive: false,
      detail: "",
    });
  });
});

describe("reorder_blocks", () => {
  const doc = docWith(hero(), gallery(), video());

  it("puts the sections in the given order, the hero staying first", () => {
    const next = applied(doc, { op: "reorder_blocks", order: [HERO_ID, VIDEO_ID, GALLERY_ID] });
    expect(next.blocks).toEqual([hero(), video(), gallery()]);
  });

  it("refuses an order that moves the hero off the top (F1)", () => {
    const error = rejected(doc, { op: "reorder_blocks", order: [VIDEO_ID, HERO_ID, GALLERY_ID] });
    expect(error.code).toBe("refused");
    expect(error.reason).toBe("The hero stays at the top.");
  });

  it.each([
    ["a missing id", [HERO_ID, GALLERY_ID]],
    ["a duplicate id", [HERO_ID, HERO_ID, VIDEO_ID]],
    ["an id not on the page", [HERO_ID, GALLERY_ID, "blockmissing"]],
    ["an extra id", [HERO_ID, GALLERY_ID, VIDEO_ID, BIO_ID]],
  ])("refuses an order with %s (not a permutation)", (_what, order) => {
    const error = rejected(doc, { op: "reorder_blocks", order });
    expect(error.code).toBe("refused");
    expect(doc.blocks).toHaveLength(3);
  });

  it("describes the move by the section that goes up and what it goes above", () => {
    expect(
      describeIt(doc, { op: "reorder_blocks", order: [HERO_ID, VIDEO_ID, GALLERY_ID] }),
    ).toEqual({
      summary: "Move the video section above the gallery.",
      destructive: false,
      detail: "",
      readout: { before: "3", after: "2" },
    });
  });

  it("describes an unchanged order, and one it cannot read", () => {
    const same = {
      op: "reorder_blocks",
      order: [HERO_ID, GALLERY_ID, VIDEO_ID],
    } satisfies EditOperation;
    expect(describeIt(doc, same).summary).toBe("Keep the sections in their order.");
    const unknown = {
      op: "reorder_blocks",
      order: [HERO_ID, "blockmissing", VIDEO_ID],
    } satisfies EditOperation;
    expect(describeIt(doc, unknown)).toEqual({
      summary: "Reorder the sections.",
      destructive: false,
      detail: "",
    });
  });
});

describe("set_theme", () => {
  it("changes only the fields it names", () => {
    expect(applied(document(), { op: "set_theme", preset: "sand" }).theme).toEqual({
      preset: "sand",
      warmth: 0.5,
      contrast: 0.5,
    });
    expect(applied(document(), { op: "set_theme", warmth: 0.8 }).theme).toEqual({
      preset: "paper",
      warmth: 0.8,
      contrast: 0.5,
    });
    expect(applied(document(), { op: "set_theme", contrast: 0.2 }).theme).toEqual({
      preset: "paper",
      warmth: 0.5,
      contrast: 0.2,
    });
    expect(
      applied(document(), { op: "set_theme", preset: "night", warmth: 0, contrast: 1 }).theme,
    ).toEqual({ preset: "night", warmth: 0, contrast: 1 });
  });

  it("is invalid outside the bounds, or when it names nothing", () => {
    expect(rejected(document(), { op: "set_theme", warmth: 2 }).code).toBe("invalid");
    const nothing = rejected(document(), { op: "set_theme" });
    expect(nothing.code).toBe("invalid");
    expect(nothing.reason).toBe("That edit isn't well formed.");
  });
});

describe("describeOperation for set_theme", () => {
  it("describes a preset by name and a slider by what it adjusts, never destructive", () => {
    const doc = docWith(hero(), bio("Hi."));
    expect(describeIt(doc, { op: "set_theme", preset: "sand" })).toEqual({
      summary: "Set the theme to Sand.",
      destructive: false,
      detail: "",
      readout: {
        before: "Paper",
        after: "Sand",
        themes: {
          before: { preset: "paper", warmth: 0.5, contrast: 0.5 },
          after: { preset: "sand", warmth: 0.5, contrast: 0.5 },
        },
      },
    });
    expect(describeIt(doc, { op: "set_theme", warmth: 0.1 }).summary).toBe(
      "Adjust the theme's warmth.",
    );
    expect(describeIt(doc, { op: "set_theme", contrast: 0.1 }).summary).toBe(
      "Adjust the theme's contrast.",
    );
    expect(describeIt(doc, { op: "set_theme", warmth: 0.1, contrast: 0.1 }).summary).toBe(
      "Adjust the theme's warmth and contrast.",
    );
  });

  it("names every field when a preset and a slider change together (FR-042)", () => {
    const doc = docWith(hero(), bio("Hi."));
    expect(describeIt(doc, { op: "set_theme", preset: "night", warmth: 0.1 }).summary).toBe(
      "Set the theme to Night and adjust its warmth.",
    );
    expect(describeIt(doc, { op: "set_theme", preset: "sand", contrast: 0.9 }).summary).toBe(
      "Set the theme to Sand and adjust its contrast.",
    );
    expect(
      describeIt(doc, { op: "set_theme", preset: "card", warmth: 0.2, contrast: 0.8 }).summary,
    ).toBe("Set the theme to Card and adjust its warmth and contrast.");
  });

  it("leaves the rest of the document alone", () => {
    const doc = docWith(hero(), bio("Hi."));
    const next = applied(doc, { op: "set_theme", preset: "card" });
    expect(next.blocks).toEqual(doc.blocks);
  });
});
