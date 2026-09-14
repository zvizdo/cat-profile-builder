import { describe, expect, it } from "vitest";
import {
  AddBlockOperationSchema,
  applyOperation,
  EditOperationSchema,
  RemoveBlockOperationSchema,
  ReorderBlocksOperationSchema,
  ReplaceImageOperationSchema,
  SetFieldOperationSchema,
  SetThemeOperationSchema,
  type EditOperation,
} from "@/core/profile/operations";
import { err, ok } from "@/core/result";
import { BIO_ID, bio, document, gallery, GALLERY_ID, hero, HERO_ID } from "./builders";
import { applied, ctx, PHOTO_A, PHOTO_B, rejected, UNOWNED, VIDEO_A } from "./operations.helpers";

const ONE_OF_EACH: EditOperation[] = [
  { op: "set_field", target: { kind: "profile" }, path: "name", value: "Charlotte" },
  { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } },
  { op: "remove_block", blockId: BIO_ID },
  // The hero stays first (F1); with only a hero and a bio, that permutation is the identity.
  { op: "reorder_blocks", order: [HERO_ID, BIO_ID] },
  { op: "set_theme", preset: "sand" },
  { op: "replace_image", blockId: HERO_ID, mediaId: PHOTO_B },
];

const BLOCK_PATHS = [
  "content",
  "caption",
  "mediaIds",
  "text",
  "attribution",
  "cards",
  "scenes.0.caption",
  "scenes.1.caption",
  "scenes.2.caption",
  "cards.0.title",
  "cards.0.text",
  "cards.1.title",
  "cards.1.text",
  "cards.2.title",
  "cards.2.text",
];

function setField(path: string, value: unknown = "x"): Record<string, unknown> {
  return { op: "set_field", target: { kind: "block", blockId: BIO_ID }, path, value };
}

describe("Result", () => {
  it("builds the two shapes of the one ok/error union", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("no")).toEqual({ ok: false, error: "no" });
  });
});

describe("EditOperationSchema", () => {
  it.each(ONE_OF_EACH)("accepts a well-formed $op unchanged", (op) => {
    expect(EditOperationSchema.parse(op)).toEqual(op);
  });

  it("rejects an op outside the six", () => {
    expect(EditOperationSchema.safeParse({ op: "publish" }).success).toBe(false);
    expect(EditOperationSchema.safeParse({ op: "set_document", doc: {} }).success).toBe(false);
  });

  it("exports each member on its own, and each accepts only its own op", () => {
    const members = [
      SetFieldOperationSchema,
      AddBlockOperationSchema,
      RemoveBlockOperationSchema,
      ReorderBlocksOperationSchema,
      SetThemeOperationSchema,
      ReplaceImageOperationSchema,
    ];
    members.forEach((member, index) => {
      ONE_OF_EACH.forEach((op, opIndex) => {
        expect(member.safeParse(op).success).toBe(index === opIndex);
      });
    });
  });

  it("rejects an unknown key on every member (strict objects)", () => {
    for (const op of ONE_OF_EACH) {
      expect(EditOperationSchema.safeParse({ ...op, extra: true }).success).toBe(false);
    }
  });
});

describe("SetFieldOperationSchema path grammar", () => {
  it.each(["name", "age", "sex", "tagline"])("accepts the profile path %s", (path) => {
    const op = { op: "set_field", target: { kind: "profile" }, path, value: "x" };
    expect(SetFieldOperationSchema.safeParse(op).success).toBe(true);
  });

  it.each(BLOCK_PATHS)("accepts the block path %s", (path) => {
    expect(SetFieldOperationSchema.safeParse(setField(path)).success).toBe(true);
  });

  it.each(["scenes.5.caption", "foo", "cards.3.title", "scenes.0.mediaId", "mediaId", "id"])(
    "rejects the path %s as malformed",
    (path) => {
      expect(SetFieldOperationSchema.safeParse(setField(path)).success).toBe(false);
    },
  );

  it("requires a target with a kind, and a well-formed block id", () => {
    expect(SetFieldOperationSchema.safeParse({ ...setField("content"), target: {} }).success).toBe(
      false,
    );
    const badId = { op: "set_field", target: { kind: "block", blockId: "x" }, path: "content" };
    expect(SetFieldOperationSchema.safeParse({ ...badId, value: "x" }).success).toBe(false);
  });

  it("accepts the five value shapes and rejects anything else", () => {
    expect(SetFieldOperationSchema.safeParse(setField("caption", "hi")).success).toBe(true);
    expect(SetFieldOperationSchema.safeParse(setField("content", { paragraphs: [] })).success).toBe(
      true,
    );
    expect(SetFieldOperationSchema.safeParse(setField("mediaIds", [PHOTO_A])).success).toBe(true);
    const cards = [{ title: "Quiet", text: "No dogs." }];
    expect(SetFieldOperationSchema.safeParse(setField("cards", cards)).success).toBe(true);
    expect(SetFieldOperationSchema.safeParse(setField("caption", null)).success).toBe(true);
    expect(SetFieldOperationSchema.safeParse(setField("caption", 3)).success).toBe(false);
    expect(SetFieldOperationSchema.safeParse(setField("caption", { html: "<b>" })).success).toBe(
      false,
    );
  });

  it("accepts a null value on any path — it is only a shape check; whether null actually clears the field is applyOperation's call (F10: only sex takes it)", () => {
    const sexOp = { op: "set_field", target: { kind: "profile" }, path: "sex", value: null };
    expect(SetFieldOperationSchema.safeParse(sexOp).success).toBe(true);
    const nameOp = { op: "set_field", target: { kind: "profile" }, path: "name", value: null };
    expect(SetFieldOperationSchema.safeParse(nameOp).success).toBe(true);
  });
});

describe("the other member schemas", () => {
  it("add_block takes a block without an id and an optional non-negative integer index", () => {
    const block = { type: "hero", mediaId: null };
    expect(AddBlockOperationSchema.safeParse({ op: "add_block", block }).success).toBe(true);
    expect(AddBlockOperationSchema.safeParse({ op: "add_block", block, index: 2 }).success).toBe(
      true,
    );
    const withId = { op: "add_block", block: { id: "blockaaaaaaz", ...block } };
    expect(AddBlockOperationSchema.safeParse(withId).success).toBe(false);
    expect(AddBlockOperationSchema.safeParse({ op: "add_block", block, index: -1 }).success).toBe(
      false,
    );
    expect(AddBlockOperationSchema.safeParse({ op: "add_block", block, index: 1.5 }).success).toBe(
      false,
    );
  });

  it("add_block accepts a block input of every type, nested items carrying no ids", () => {
    const inputs = [
      { type: "hero", mediaId: PHOTO_A },
      { type: "bio", content: { paragraphs: [{ runs: [{ text: "Hi." }] }] } },
      { type: "photo", mediaId: PHOTO_A, caption: "Sun." },
      { type: "gallery", mediaIds: [PHOTO_A, PHOTO_B] },
      { type: "video", mediaId: VIDEO_A },
      {
        type: "day",
        scenes: [
          { mediaId: PHOTO_A, caption: "One." },
          { mediaId: null, caption: "" },
          { mediaId: null, caption: "" },
        ],
      },
      { type: "needs", cards: [{ title: "Quiet", text: "No dogs." }] },
      { type: "quote", mediaId: PHOTO_A, text: "Purrs.", attribution: "Dana" },
    ];
    for (const block of inputs) {
      expect(AddBlockOperationSchema.safeParse({ op: "add_block", block }).success).toBe(true);
    }
    const sceneWithId = {
      type: "day",
      scenes: [
        { id: "blockaaaaaaz", mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
        { mediaId: null, caption: "" },
      ],
    };
    expect(AddBlockOperationSchema.safeParse({ op: "add_block", block: sceneWithId }).success).toBe(
      false,
    );
  });
});

describe("the remaining member schemas", () => {
  it("reorder_blocks takes block ids only", () => {
    const op = { op: "reorder_blocks", order: [HERO_ID, "bad"] };
    expect(ReorderBlocksOperationSchema.safeParse(op).success).toBe(false);
  });

  it("set_theme needs at least one of preset, warmth, contrast, each within its bounds", () => {
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme" }).success).toBe(false);
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme", preset: "sand" }).success).toBe(
      true,
    );
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme", warmth: 0.2 }).success).toBe(true);
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme", contrast: 1 }).success).toBe(true);
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme", preset: "neon" }).success).toBe(
      false,
    );
    expect(SetThemeOperationSchema.safeParse({ op: "set_theme", warmth: 1.5 }).success).toBe(false);
  });

  it("replace_image takes a media id and an optional non-negative integer slot", () => {
    const base = { op: "replace_image", blockId: HERO_ID, mediaId: PHOTO_A };
    expect(ReplaceImageOperationSchema.safeParse(base).success).toBe(true);
    expect(ReplaceImageOperationSchema.safeParse({ ...base, slot: 0 }).success).toBe(true);
    expect(ReplaceImageOperationSchema.safeParse({ ...base, slot: -1 }).success).toBe(false);
    expect(ReplaceImageOperationSchema.safeParse({ ...base, mediaId: "x" }).success).toBe(false);
  });
});

describe("applyOperation, across operations", () => {
  it("re-validates the operation itself, so a typed but malformed one is invalid", () => {
    const error = rejected(document(), { op: "remove_block", blockId: "not-an-id" });
    expect(error.code).toBe("invalid");
    expect(error.reason).toContain("blockId");
  });

  it.each(ONE_OF_EACH)("never mutates the input document ($op)", (op) => {
    const doc = document({ blocks: [hero(), bio("Hello.")] });
    const snapshot = structuredClone(doc);
    const result = applyOperation(doc, op, ctx());
    expect(result.ok).toBe(true);
    expect(doc).toEqual(snapshot);
  });

  it("returns a document that shares nothing with the input", () => {
    const doc = document();
    const next = applied(doc, { op: "set_theme", preset: "sand" });
    expect(next.blocks).not.toBe(doc.blocks);
    expect(next.theme).not.toBe(doc.theme);
  });

  it("refuses a change whose result fails the document schema, naming the path", () => {
    const blocks = Array.from({ length: 30 }, (_, i) => ({
      ...bio(),
      id: `blockaaaaa${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`,
    }));
    const full = document({ blocks });
    const op: EditOperation = {
      op: "add_block",
      block: { type: "bio", content: { paragraphs: [] } },
    };
    const error = rejected(full, op);
    expect(error.code).toBe("refused");
    expect(error.reason).toContain("blocks");
  });

  it("refuses a block whose fresh id is not a block id", () => {
    const op: EditOperation = {
      op: "add_block",
      block: { type: "bio", content: { paragraphs: [] } },
    };
    const error = rejected(document(), op, ctx({ newBlockId: () => "bad" }));
    expect(error.code).toBe("refused");
  });
});

describe("applyOperation, refusals shared across operations", () => {
  it("refuses an operation naming a block that is not on the page", () => {
    const missing = "blockmissing";
    const ops: EditOperation[] = [
      { op: "set_field", target: { kind: "block", blockId: missing }, path: "caption", value: "x" },
      { op: "remove_block", blockId: missing },
      { op: "replace_image", blockId: missing, mediaId: PHOTO_A },
    ];
    for (const op of ops) {
      const error = rejected(document(), op);
      expect(error.code).toBe("refused");
      expect(error.reason).toContain(missing);
    }
  });

  it("refuses a media id the cat does not own, wherever it appears", () => {
    const doc = document({ blocks: [hero(), gallery()] });
    const ops: EditOperation[] = [
      { op: "replace_image", blockId: HERO_ID, mediaId: UNOWNED },
      { op: "add_block", block: { type: "photo", mediaId: UNOWNED } },
      {
        op: "set_field",
        target: { kind: "block", blockId: GALLERY_ID },
        path: "mediaIds",
        value: [UNOWNED],
      },
    ];
    for (const op of ops) {
      const error = rejected(doc, op);
      expect(error.code).toBe("refused");
      expect(error.reason).toContain(UNOWNED);
    }
  });
});
