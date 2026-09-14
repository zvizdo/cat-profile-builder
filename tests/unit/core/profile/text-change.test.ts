import { describe, expect, it } from "vitest";
import type { EditOperation, SetFieldOperation } from "@/core/profile/operations";
import { drawsBlock, readsInline, textChange } from "@/core/profile/text-change";
import {
  bio,
  BIO_ID,
  DAY_ID,
  day,
  document,
  GALLERY_ID,
  gallery,
  hero,
  NEEDS_ID,
  needs,
  photo,
  PHOTO_ID,
  QUOTE_ID,
  quote,
} from "./builders";

// F58: `textChange(doc, op)` is what the proposal card reads its before → after from —
// the field's current value from the document, the proposed one from the operation —
// so the card never reaches into `fieldOf` itself. Only a `set_field` on a text, rich
// text or cards path has one; a gallery's ids, a photo swap and every other operation
// answer `null` (F59 draws those).

const DOC = document({
  tagline: "A negotiator, not a complainer.",
  blocks: [
    hero(),
    bio("Charlotte is a three-year-old tabby."),
    photo("media2ab", "Asleep on the radiator."),
    gallery(),
    day(),
    needs([{ title: "Quiet", text: "No dogs." }]),
    quote("media2ac", "She purrs at the kettle.", "A volunteer"),
  ],
});

function profileField(path: SetFieldOperation["path"], value: unknown): SetFieldOperation {
  return { op: "set_field", target: { kind: "profile" }, path, value } as SetFieldOperation;
}

function blockField(
  blockId: string,
  path: SetFieldOperation["path"],
  value: unknown,
): SetFieldOperation {
  return { op: "set_field", target: { kind: "block", blockId }, path, value } as SetFieldOperation;
}

describe("textChange", () => {
  it("answers the pair for every text path, labelled as fieldOf labels it", () => {
    const cases: Array<[SetFieldOperation, string, string]> = [
      [profileField("name", "Marmalade"), "name", "Charlotte"],
      [
        profileField("tagline", "Follows you room to room."),
        "tagline",
        "A negotiator, not a complainer.",
      ],
      [blockField(PHOTO_ID, "caption", "Warm."), "caption", "Asleep on the radiator."],
      [blockField(QUOTE_ID, "text", "Purrs."), "quote", "She purrs at the kettle."],
      [blockField(QUOTE_ID, "attribution", "Staff"), "attribution", "A volunteer"],
      [blockField(DAY_ID, "scenes.0.caption", "Dawn."), "caption of scene 1", "Morning sunbeam."],
      [blockField(NEEDS_ID, "cards.0.title", "Calm"), "title of card 1", "Quiet"],
      [blockField(NEEDS_ID, "cards.0.text", "No dogs, please."), "text of card 1", "No dogs."],
    ];
    for (const [op, label, before] of cases) {
      expect(textChange(DOC, op)).toEqual({ kind: "text", label, before, after: op.value });
    }
  });

  it("reads an unset text field as an empty before, and an optional field cleared as an empty after", () => {
    const unset = document({ blocks: [hero(), photo("media2ab")] });
    expect(textChange(unset, blockField(PHOTO_ID, "caption", "New."))).toEqual({
      kind: "text",
      label: "caption",
      before: "",
      after: "New.",
    });
    expect(textChange(DOC, blockField(PHOTO_ID, "caption", undefined))).toEqual({
      kind: "text",
      label: "caption",
      before: "Asleep on the radiator.",
      after: "",
    });
  });

  it("answers the bio's rich text pair with its word diff already computed", () => {
    const value = { paragraphs: [{ runs: [{ text: "Charlotte is a tabby." }] }] };
    const change = textChange(DOC, blockField(BIO_ID, "content", value));
    expect(change).toMatchObject({ kind: "richText", label: "bio", after: value });
    if (change?.kind !== "richText") throw new Error("expected a richText change");
    expect(change.before).toEqual({
      paragraphs: [{ runs: [{ text: "Charlotte is a three-year-old tabby." }] }],
    });
    expect(change.diff).toEqual([
      {
        parts: [
          { kind: "same", text: "Charlotte is a " },
          { kind: "del", text: "three-year-old " },
          { kind: "same", text: "tabby." },
        ],
      },
    ]);
  });

  it("answers the whole needs list, labelled in the cat's own pronoun", () => {
    const value = [
      { title: "Calm", text: "No dogs." },
      { title: "Sunlight", text: "A windowsill." },
    ];
    const he = { ...DOC, sex: "male" as const };
    expect(textChange(he, blockField(NEEDS_ID, "cards", value))).toEqual({
      kind: "cards",
      label: '"What he needs" cards',
      before: [{ title: "Quiet", text: "No dogs." }],
      after: value,
    });
  });

  it("is null for a gallery's ids, a value that does not fit the field, a missing section, and every other operation", () => {
    expect(textChange(DOC, blockField(GALLERY_ID, "mediaIds", ["media2aa"]))).toBeNull();
    expect(textChange(DOC, profileField("sex", null))).toBeNull();
    expect(textChange(DOC, profileField("tagline", { paragraphs: [] }))).toBeNull();
    expect(textChange(DOC, blockField(BIO_ID, "content", "not rich text"))).toBeNull();
    expect(textChange(DOC, blockField(NEEDS_ID, "cards", "not a list"))).toBeNull();
    expect(textChange(DOC, blockField("nosuchblock", "caption", "x"))).toBeNull();
    expect(textChange(DOC, blockField(BIO_ID, "caption", "x"))).toBeNull();
    const others: EditOperation[] = [
      { op: "remove_block", blockId: BIO_ID },
      { op: "reorder_blocks", order: [] },
      { op: "set_theme", preset: "sand" },
      { op: "replace_image", blockId: PHOTO_ID, slot: 0, mediaId: "media2aa" },
      { op: "add_block", block: { type: "photo", mediaId: null } },
    ];
    for (const op of others) expect(textChange(DOC, op)).toBeNull();
  });
});

describe("readsInline", () => {
  it("is true only for a text pair short enough to read on the ledger's own line", () => {
    expect(
      readsInline({ kind: "text", label: "name", before: "Charlotte", after: "Marmalade" }),
    ).toBe(true);
    expect(
      readsInline({
        kind: "text",
        label: "tagline",
        before: "A negotiator, not a complainer.",
        after: "Loud.",
      }),
    ).toBe(false);
    expect(readsInline({ kind: "text", label: "name", before: "", after: "Marmalade" })).toBe(true);
    expect(
      readsInline({
        kind: "richText",
        label: "bio",
        before: { paragraphs: [] },
        after: { paragraphs: [] },
        diff: [],
      }),
    ).toBe(false);
    expect(readsInline({ kind: "cards", label: "cards", before: [], after: [] })).toBe(false);
  });
});

describe("drawsBlock", () => {
  it("is false for no change and for the one-line pair, true for everything the card draws under the row", () => {
    expect(drawsBlock(null)).toBe(false);
    expect(
      drawsBlock({ kind: "text", label: "name", before: "Charlotte", after: "Marmalade" }),
    ).toBe(false);
    expect(
      drawsBlock({
        kind: "text",
        label: "tagline",
        before: "A negotiator, not a complainer.",
        after: "Loud.",
      }),
    ).toBe(true);
    expect(
      drawsBlock({
        kind: "richText",
        label: "bio",
        before: { paragraphs: [] },
        after: { paragraphs: [] },
        diff: [],
      }),
    ).toBe(true);
    expect(drawsBlock({ kind: "cards", label: "cards", before: [], after: [] })).toBe(true);
  });
});
