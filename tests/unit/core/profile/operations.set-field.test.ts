import { describe, expect, it } from "vitest";
import {
  describeOperation,
  type EditOperation,
  type SetFieldTarget,
} from "@/core/profile/operations";
import { type RichText } from "@/core/profile/rich-text";
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
  PHOTO_A,
  UNOWNED,
  PHOTO_B,
  PHOTO_C,
  PHOTO_D,
  rejected,
  VIDEO_A,
} from "./operations.helpers";

type Target = SetFieldTarget;
type Path = Extract<EditOperation, { op: "set_field" }>["path"];
type Value = Extract<EditOperation, { op: "set_field" }>["value"];

function set(target: Target, path: Path, value: Value): EditOperation {
  return { op: "set_field", target, path, value };
}

const PROFILE: Target = { kind: "profile" };
const onBlock = (blockId: string): Target => ({ kind: "block", blockId });

// A hero is always first (F1: mandatory, fixed at `blocks[0]`); the block under test
// follows it, so `applyOperation`'s post-change schema check never trips on its absence.
function docWith(...blocks: Block[]): ProfileDocument {
  return document({ blocks: [hero(), ...blocks] });
}

const SCENES = [
  { mediaId: PHOTO_A, caption: "Morning sunbeam." },
  { mediaId: PHOTO_B, caption: "" },
  { mediaId: null, caption: "" },
];

const HELLO: RichText = { paragraphs: [{ runs: [{ text: "Hello there." }] }] };
const HI: RichText = { paragraphs: [{ runs: [{ text: "Hi." }] }] };

function describeIt(doc: ProfileDocument, op: EditOperation) {
  return describeOperation(doc, op, ASSETS);
}

describe("set_field on the profile", () => {
  it.each([
    ["name", "Mabel"],
    ["age", "3 years"],
    ["sex", "female"],
    ["tagline", "Loves sunbeams."],
  ] satisfies Array<[Path, string]>)("sets %s", (path, value) => {
    const next = applied(document(), set(PROFILE, path, value));
    expect(next).toEqual({ ...document(), [path]: value });
  });

  it("is invalid when the value does not fit the field", () => {
    expect(rejected(document(), set(PROFILE, "sex", "other")).code).toBe("invalid");
    expect(rejected(document(), set(PROFILE, "name", "n".repeat(61))).code).toBe("invalid");
    expect(rejected(document(), set(PROFILE, "name", HELLO)).code).toBe("invalid");
  });

  it("is invalid for a block path on the profile", () => {
    const error = rejected(document(), set(PROFILE, "content", HELLO));
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("content");
  });

  it("clears the sex back to not set with a null value (F10), and is a no-op already unset", () => {
    const withSex = document({ sex: "female" });
    expect(applied(withSex, set(PROFILE, "sex", null))).toEqual({ ...withSex, sex: undefined });
    expect(applied(document(), set(PROFILE, "sex", null)).sex).toBeUndefined();
  });

  it.each(["name", "age", "tagline"] satisfies Path[])(
    "refuses a null value for %s — only sex can be cleared",
    (path) => expect(rejected(document(), set(PROFILE, path, null)).code).toBe("invalid"),
  );

  it("refuses a null value on a block path — only the profile's sex can be cleared", () => {
    expect(rejected(docWith(bio()), set(onBlock(BIO_ID), "content", null)).code).toBe("invalid");
  });

  it("describes clearing the sex in the shelter's voice, not as a text loss", () => {
    expect(describeIt(document({ sex: "female" }), set(PROFILE, "sex", null))).toEqual({
      summary: "Clear the sex.",
      destructive: false,
      detail: "",
    });
  });

  it("describes filling an empty field as not destructive", () => {
    const doc = document({ name: "" });
    expect(describeIt(doc, set(PROFILE, "name", "Mabel"))).toEqual({
      summary: "Set the name.",
      destructive: false,
      detail: "",
    });
    expect(describeIt(doc, set(PROFILE, "age", "3 years"))).toEqual({
      summary: "Set the age.",
      destructive: false,
      detail: "",
    });
  });

  it("describes replacing text the volunteer wrote as destructive", () => {
    expect(describeIt(document(), set(PROFILE, "name", "Mabel"))).toEqual({
      summary: "Change the name. Changing the name replaces your text.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "Charlotte", after: "Mabel" },
    });
  });
});

describe("set_field on a bio", () => {
  it("sets the content", () => {
    const next = applied(docWith(bio()), set(onBlock(BIO_ID), "content", HELLO));
    expect(next.blocks).toEqual([hero(), { ...bio(), content: HELLO }]);
  });

  it("is invalid for rich text the schema does not know", () => {
    const value = { paragraphs: [{ runs: [{ text: "x", underline: true }] }] };
    const op: EditOperation = { op: "set_field", target: onBlock(BIO_ID), path: "content", value };
    const error = rejected(docWith(bio()), op);
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("value");
  });

  it("is invalid for a string where rich text belongs", () => {
    expect(rejected(docWith(bio()), set(onBlock(BIO_ID), "content", "plain")).code).toBe("invalid");
  });

  it("describes writing an empty bio as not destructive", () => {
    expect(describeIt(docWith(bio()), set(onBlock(BIO_ID), "content", HELLO))).toEqual({
      summary: "Write the bio.",
      destructive: false,
      detail: "",
    });
  });

  // T038 review, finding 2: the bio is the one case CONTENT.md and the hi-fi give verbatim
  // consequence text for ("You wrote that paragraph. …") — every other destructive branch
  // (operations.blocks.test.ts's remove_block, for one) keeps the generic reassurance alone.
  it("describes shortening a written bio with the sentence and detail from CONTENT.md", () => {
    expect(describeIt(docWith(bio("Hello there.")), set(onBlock(BIO_ID), "content", HI))).toEqual({
      summary: "Shorten the bio. Shortening the bio replaces your text.",
      destructive: true,
      detail: "You wrote that paragraph. The original is recoverable with one undo, and only one.",
      readout: { before: "2", after: "1", unit: "words" },
    });
  });

  it("describes rewriting a written bio as destructive, with the same CONTENT.md detail", () => {
    expect(describeIt(docWith(bio("Hi.")), set(onBlock(BIO_ID), "content", HELLO))).toEqual({
      summary: "Rewrite the bio. Rewriting the bio replaces your text.",
      destructive: true,
      detail: "You wrote that paragraph. The original is recoverable with one undo, and only one.",
      readout: { before: "1", after: "2", unit: "words" },
    });
  });
});

describe("set_field on a photo and a quote", () => {
  it("sets a caption, and bounds it", () => {
    const next = applied(docWith(photo()), set(onBlock(PHOTO_ID), "caption", "Sun."));
    expect(next.blocks).toEqual([hero(), photo(PHOTO_B, "Sun.")]);
    const long = rejected(docWith(photo()), set(onBlock(PHOTO_ID), "caption", "c".repeat(201)));
    expect(long.code).toBe("invalid");
    expect(long.reason).toContain("caption");
  });

  it("sets a quote's text and attribution", () => {
    const withText = applied(docWith(quote()), set(onBlock(QUOTE_ID), "text", "Purrs."));
    expect(withText.blocks).toEqual([hero(), quote(PHOTO_C, "Purrs.")]);
    const withBy = applied(docWith(quote()), set(onBlock(QUOTE_ID), "attribution", "Dana"));
    expect(withBy.blocks).toEqual([hero(), quote(PHOTO_C, "She purrs at the kettle.", "Dana")]);
  });

  it("describes an empty caption as set, a written one as changed", () => {
    expect(describeIt(docWith(photo()), set(onBlock(PHOTO_ID), "caption", "Sun."))).toEqual({
      summary: "Set the caption.",
      destructive: false,
      detail: "",
    });
    const captioned = docWith(photo(PHOTO_B, "Rain."));
    expect(describeIt(captioned, set(onBlock(PHOTO_ID), "caption", "Sun."))).toEqual({
      summary: "Change the caption. Changing the caption replaces your text.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "Rain.", after: "Sun." },
    });
  });

  it("describes the quote's fields by name", () => {
    expect(describeIt(docWith(quote()), set(onBlock(QUOTE_ID), "text", "Purrs."))).toEqual({
      summary: "Change the quote. Changing the quote replaces your text.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "She purrs at the kettle.", after: "Purrs." },
    });
    expect(describeIt(docWith(quote()), set(onBlock(QUOTE_ID), "attribution", "Dana"))).toEqual({
      summary: "Set the attribution.",
      destructive: false,
      detail: "",
    });
  });
});

describe("set_field on a gallery", () => {
  it("replaces the whole list with owned photos", () => {
    const next = applied(docWith(gallery()), set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_D]));
    expect(next.blocks).toEqual([hero(), gallery([PHOTO_D])]);
  });

  it("refuses a video id in the list", () => {
    const error = rejected(docWith(gallery()), set(onBlock(GALLERY_ID), "mediaIds", [VIDEO_A]));
    expect(error.code).toBe("refused");
    expect(error.reason).toContain(VIDEO_A);
  });

  it("checks only the ids new to the list, so a gallery holding a lost photo can still be reordered or trimmed", () => {
    const withLost = docWith(gallery([PHOTO_A, UNOWNED, PHOTO_B]));
    const reordered = applied(
      withLost,
      set(onBlock(GALLERY_ID), "mediaIds", [UNOWNED, PHOTO_B, PHOTO_A]),
    );
    expect(reordered.blocks).toEqual([hero(), gallery([UNOWNED, PHOTO_B, PHOTO_A])]);
    const trimmed = applied(withLost, set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_A, PHOTO_B]));
    expect(trimmed.blocks).toEqual([hero(), gallery([PHOTO_A, PHOTO_B])]);
    const grown = applied(
      withLost,
      set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_A, UNOWNED, PHOTO_B, PHOTO_C]),
    );
    expect(grown.blocks).toEqual([hero(), gallery([PHOTO_A, UNOWNED, PHOTO_B, PHOTO_C])]);
  });

  it("still refuses an id the library does not hold when it is new to the list", () => {
    const error = rejected(
      docWith(gallery()),
      set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_A, UNOWNED]),
    );
    expect(error.code).toBe("refused");
    expect(error.reason).toBe(`No photo or clip with id "${UNOWNED}" is in the library.`);
  });

  it("is invalid over twelve photos, named as the field that cannot take it", () => {
    const thirteen = Array.from({ length: 13 }, () => PHOTO_A);
    const error = rejected(docWith(gallery()), set(onBlock(GALLERY_ID), "mediaIds", thirteen));
    expect(error.code).toBe("invalid");
    expect(error.reason).toBe("That value doesn't fit the gallery photos.");
  });

  it("describes adding a photo while keeping the rest as not destructive", () => {
    const op = set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_A, PHOTO_B, PHOTO_C, PHOTO_D]);
    expect(describeIt(docWith(gallery()), op)).toEqual({
      summary: "Change the gallery photos.",
      destructive: false,
      detail: "",
      readout: { before: "3", after: "4", unit: "photos" },
    });
  });

  it("describes dropping ids with the count of photos that come off the page", () => {
    const dropOne = set(onBlock(GALLERY_ID), "mediaIds", [PHOTO_A, PHOTO_B]);
    expect(describeIt(docWith(gallery()), dropOne)).toEqual({
      summary:
        "Change the gallery photos. Changing the gallery takes one photo off Charlotte's page.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "3", after: "2", unit: "photos" },
    });
    const dropAll = set(onBlock(GALLERY_ID), "mediaIds", []);
    expect(describeIt(docWith(gallery()), dropAll).summary).toBe(
      "Change the gallery photos. Changing the gallery takes three photos off Charlotte's page.",
    );
  });
});

describe("set_field on a day-in-her-life section", () => {
  it.each([
    ["scenes.0.caption", 0],
    ["scenes.1.caption", 1],
    ["scenes.2.caption", 2],
  ] satisfies Array<[Path, number]>)("sets the caption of scene %s", (path, index) => {
    const next = applied(docWith(day(SCENES)), set(onBlock(DAY_ID), path, "Nap."));
    expect(next.blocks).toEqual([
      hero(),
      day(SCENES.map((scene, i) => (i === index ? { ...scene, caption: "Nap." } : scene))),
    ]);
  });

  it("bounds a scene caption to 120 characters", () => {
    const error = rejected(
      docWith(day()),
      set(onBlock(DAY_ID), "scenes.0.caption", "c".repeat(121)),
    );
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("scene 1");
  });

  it("describes an empty scene caption as set, a written one as changed", () => {
    expect(describeIt(docWith(day()), set(onBlock(DAY_ID), "scenes.1.caption", "Nap."))).toEqual({
      summary: "Set the caption of scene 2.",
      destructive: false,
      detail: "",
    });
    expect(describeIt(docWith(day()), set(onBlock(DAY_ID), "scenes.0.caption", "Nap."))).toEqual({
      summary: "Change the caption of scene 1. Changing the caption of scene 1 replaces your text.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "Morning sunbeam.", after: "Nap." },
    });
  });
});

const twoCards = [
  { title: "Quiet", text: "No dogs." },
  { title: "", text: "" },
];

describe("set_field on a what-she-needs section", () => {
  it("replaces the whole list of cards, one to three", () => {
    const next = applied(docWith(needs()), set(onBlock(NEEDS_ID), "cards", twoCards));
    expect(next.blocks).toEqual([hero(), needs(twoCards)]);
    expect(rejected(docWith(needs()), set(onBlock(NEEDS_ID), "cards", [])).code).toBe("invalid");
  });

  it("sets one card's title or text", () => {
    const title = applied(docWith(needs()), set(onBlock(NEEDS_ID), "cards.0.title", "Calm"));
    expect(title.blocks).toEqual([hero(), needs([{ title: "Calm", text: "No dogs." }])]);
    const text = applied(docWith(needs()), set(onBlock(NEEDS_ID), "cards.0.text", "A lap."));
    expect(text.blocks).toEqual([hero(), needs([{ title: "Quiet", text: "A lap." }])]);
    const second = applied(
      docWith(needs(twoCards)),
      set(onBlock(NEEDS_ID), "cards.1.title", "Lap"),
    );
    expect(second.blocks).toEqual([hero(), needs([twoCards[0]!, { title: "Lap", text: "" }])]);
    const long = rejected(
      docWith(needs()),
      set(onBlock(NEEDS_ID), "cards.0.text", "t".repeat(241)),
    );
    expect(long.code).toBe("invalid");
    expect(long.reason).toContain("text of card 1");
  });

  it("refuses a card index the section does not have", () => {
    const error = rejected(docWith(needs()), set(onBlock(NEEDS_ID), "cards.1.title", "Calm"));
    expect(error.code).toBe("refused");
    expect(error.reason).toContain("card");
  });
});

describe("describeOperation for needs cards", () => {
  it("describes keeping every written card as not destructive", () => {
    const grown = [
      { title: "Quiet", text: "No dogs." },
      { title: "Lap", text: "" },
    ];
    // `docWith` never sets a sex (undefined), which reads as "they" — the sex-specific
    // forms are covered just below.
    expect(describeIt(docWith(needs()), set(onBlock(NEEDS_ID), "cards", grown))).toEqual({
      summary: 'Change the "What they need" cards.',
      destructive: false,
      detail: "",
    });
  });

  it("describes dropping a written card as destructive, an empty one as not", () => {
    const replaced = set(onBlock(NEEDS_ID), "cards", [{ title: "Lap", text: "" }]);
    expect(describeIt(docWith(needs()), replaced)).toEqual({
      summary: 'Change the "What they need" cards. Changing the cards replaces your text.',
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
    });
    const onlyEmpty = docWith(needs([{ title: "", text: "" }]));
    expect(describeIt(onlyEmpty, replaced).destructive).toBe(false);
  });

  it("names the cards field in the cat's recorded sex — F41", () => {
    const female = { ...docWith(needs()), sex: "female" as const };
    const male = { ...docWith(needs()), sex: "male" as const };
    const grown = [
      { title: "Quiet", text: "No dogs." },
      { title: "Lap", text: "" },
    ];
    expect(describeIt(female, set(onBlock(NEEDS_ID), "cards", grown)).summary).toBe(
      'Change the "What she needs" cards.',
    );
    expect(describeIt(male, set(onBlock(NEEDS_ID), "cards", grown)).summary).toBe(
      'Change the "What he needs" cards.',
    );
  });

  it("counts a card as written when only its text is, and as dropped when its text changes", () => {
    const textOnly = { title: "", text: "Needs a lap." };
    const doc = docWith(needs([{ title: "Quiet", text: "No dogs." }, textOnly]));
    const dropText = set(onBlock(NEEDS_ID), "cards", [{ title: "Quiet", text: "No dogs." }]);
    expect(describeIt(doc, dropText).destructive).toBe(true);
    const sameTitle = set(onBlock(NEEDS_ID), "cards", [
      { title: "Quiet", text: "Cats." },
      textOnly,
    ]);
    expect(describeIt(doc, sameTitle).destructive).toBe(true);
    const reordered = set(onBlock(NEEDS_ID), "cards", [
      textOnly,
      { title: "Quiet", text: "No dogs." },
    ]);
    expect(describeIt(doc, reordered).destructive).toBe(false);
  });

  it("describes a card's title and text by number", () => {
    expect(
      describeIt(docWith(needs(twoCards)), set(onBlock(NEEDS_ID), "cards.1.title", "Lap")),
    ).toEqual({ summary: "Set the title of card 2.", destructive: false, detail: "" });
    expect(describeIt(docWith(needs()), set(onBlock(NEEDS_ID), "cards.0.text", "A lap."))).toEqual({
      summary: "Change the text of card 1. Changing the text of card 1 replaces your text.",
      destructive: true,
      detail: "The original is recoverable with one undo, and only one.",
      readout: { before: "No dogs.", after: "A lap." },
    });
  });
});

describe("set_field path grammar per block type", () => {
  it.each([
    ["hero", hero(), HERO_ID, "caption"],
    ["video", video(), VIDEO_ID, "caption"],
    ["bio", bio(), BIO_ID, "caption"],
    ["photo", photo(), PHOTO_ID, "content"],
    ["gallery", gallery(), GALLERY_ID, "scenes.0.caption"],
    ["day", day(), DAY_ID, "cards.0.title"],
    ["needs", needs(), NEEDS_ID, "text"],
    ["quote", quote(), QUOTE_ID, "mediaIds"],
    ["day", day(), DAY_ID, "caption"],
    ["needs", needs(), NEEDS_ID, "content"],
  ] satisfies Array<[string, Block, string, Path]>)(
    "is invalid for a path a %s section does not have (%s)",
    (_type, block, id, path) => {
      const error = rejected(docWith(block), set(onBlock(id), path, "x"));
      expect(error.code).toBe("invalid");
      expect(error.reason).toContain(path);
    },
  );

  it("is invalid for a profile path on a block", () => {
    expect(rejected(docWith(bio()), set(onBlock(BIO_ID), "name", "x")).code).toBe("invalid");
  });
});

describe("describeOperation for set_field it cannot apply", () => {
  it("names a section that is no longer on the page", () => {
    expect(describeIt(document(), set(onBlock("blockmissing"), "caption", "x"))).toEqual({
      summary: "Change a section that is no longer on the page.",
      destructive: false,
      detail: "",
    });
  });

  it("is plain and not destructive for a path the section does not have", () => {
    expect(describeIt(docWith(bio("Hi.")), set(onBlock(BIO_ID), "caption", "x"))).toEqual({
      summary: "Set the caption.",
      destructive: false,
      detail: "",
    });
  });

  it("is plain and not destructive for a value that does not fit", () => {
    expect(describeIt(docWith(bio("Hi.")), set(onBlock(BIO_ID), "content", "plain"))).toEqual({
      summary: "Set the bio.",
      destructive: false,
      detail: "",
    });
  });

  it("finds nothing destructive on an empty page", () => {
    const empty = document({ name: "", blocks: [] });
    expect(describeIt(empty, set(PROFILE, "name", "Mabel")).destructive).toBe(false);
    expect(describeIt(empty, set(PROFILE, "tagline", "Hi.")).destructive).toBe(false);
  });
});
