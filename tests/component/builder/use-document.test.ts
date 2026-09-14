import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import {
  createDocumentState,
  reduce,
  type DocumentAction,
  type DocumentState,
} from "@/ui/builder/use-document";
import { sequentialIds } from "../../fakes/id-source";

// The builder's client reducer (T024; data-model.md → Builder session). Every manual edit
// is an `EditOperation` through `applyOperation` then `record` — one history entry per
// edit — and undo restores the exact prior document (constitution VIII). A refused edit
// leaves the document alone and surfaces the reason. Save state follows the autosave.

/** Every document has a hero, mandatory and fixed at `blocks[0]` (F1). */
const HERO_ID = "heroaaaaaaaa";

const DOC: ProfileDocument = {
  schemaVersion: 1,
  id: "abcdefgh",
  name: "Charlotte",
  blocks: [{ id: HERO_ID, type: "hero", mediaId: null }],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
};

function start(doc: ProfileDocument = DOC): DocumentState {
  return createDocumentState(doc, []);
}

function run(state: DocumentState, ...actions: DocumentAction[]): DocumentState {
  return actions.reduce(reduce, state);
}

/** One sequence for the whole file, so no two adds ever draw the same block id. */
const ids = sequentialIds();

function apply(op: EditOperation, label = "edit"): DocumentAction {
  return { type: "apply", op, label, newBlockId: ids.blockId };
}

function addBio(label = "Add a bio."): DocumentAction {
  return apply({ op: "add_block", block: { type: "bio", content: { paragraphs: [] } } }, label);
}

describe("reduce: apply", () => {
  it("applies the operation and records exactly one history entry, marked dirty", () => {
    const next = reduce(start(), addBio());
    expect(next.doc.blocks).toHaveLength(2);
    expect(next.doc.blocks[0]?.type).toBe("hero");
    expect(next.doc.blocks[1]?.type).toBe("bio");
    expect(next.history.past).toHaveLength(1);
    expect(next.history.past[0]?.label).toBe("Add a bio.");
    expect(next.history.past[0]?.before).toBe(DOC);
    expect(next.save).toEqual({ status: "dirty" });
    expect(next.notice).toBeNull();
  });

  it("leaves the document and history alone when the operation is refused, and says why (F1: one hero always exists)", () => {
    const next = reduce(
      start(),
      apply({ op: "add_block", block: { type: "hero", mediaId: null } }, "Add a hero."),
    );
    expect(next.doc).toBe(DOC);
    expect(next.history.past).toHaveLength(0);
    expect(next.notice).toBe("There is already a hero.");
  });

  it("clears a notice", () => {
    const refused = reduce(
      start(),
      apply({ op: "add_block", block: { type: "hero", mediaId: null } }, "Add a hero."),
    );
    expect(reduce(refused, { type: "clearNotice" }).notice).toBeNull();
  });
});

describe("reduce: undo and redo", () => {
  it("walks back five edits to the five exact prior documents, then replays them", () => {
    const states: ProfileDocument[] = [DOC];
    let state = start();
    for (let i = 0; i < 5; i += 1) {
      state = reduce(state, addBio(`edit ${i}`));
      states.push(state.doc);
    }
    expect(state.doc.blocks).toHaveLength(6);
    for (let i = 5; i > 0; i -= 1) {
      state = reduce(state, { type: "undo" });
      expect(state.doc).toBe(states[i - 1]);
    }
    expect(state.history.past).toHaveLength(0);
    expect(state.save).toEqual({ status: "dirty" });
    for (let i = 1; i <= 5; i += 1) {
      state = reduce(state, { type: "redo" });
      expect(state.doc).toBe(states[i]);
    }
    expect(state.history.future).toHaveLength(0);
  });

  it("is a no-op with nothing to undo or redo", () => {
    const state = start();
    expect(reduce(state, { type: "undo" })).toBe(state);
    expect(reduce(state, { type: "redo" })).toBe(state);
  });
});

describe("reduce: offer, restore, discard", () => {
  const mirrored: ProfileDocument = { ...DOC, name: "Charlotte, restored" };

  it("restore puts the offered document in place as one history entry, marked dirty", () => {
    const one = reduce(start(), addBio());
    const offered = reduce(one, { type: "offer", doc: mirrored });
    expect(offered.offer).toBe(mirrored);
    expect(offered.doc).toBe(one.doc);
    const next = reduce(offered, { type: "restore" });
    expect(next.doc).toBe(mirrored);
    expect(next.offer).toBeNull();
    expect(next.history.past).toHaveLength(2);
    expect(next.history.past[1]?.label).toBe("Restore unsaved changes.");
    expect(next.history.past[1]?.before).toBe(one.doc);
    expect(next.save).toEqual({ status: "dirty" });
    expect(reduce(next, { type: "undo" }).doc).toBe(one.doc);
  });

  it("discard drops the offer and changes nothing else", () => {
    const offered = reduce(start(), { type: "offer", doc: mirrored });
    const next = reduce(offered, { type: "discard" });
    expect(next.offer).toBeNull();
    expect(next.doc).toBe(DOC);
    expect(next.history.past).toHaveLength(0);
  });

  it("restore with nothing offered is a no-op", () => {
    const state = start();
    expect(reduce(state, { type: "restore" })).toBe(state);
  });
});

describe("reduce: duplicate", () => {
  it("adds a copy of the block right after it with a fresh id, as one add_block entry", () => {
    const one = reduce(start(), addBio());
    const bioId = one.doc.blocks[1]?.id ?? "";
    const next = reduce(one, {
      type: "duplicate",
      blockId: bioId,
      newBlockId: () => "fresh2fresh2",
    });
    expect(next.doc.blocks.map((block) => block.id)).toEqual([HERO_ID, bioId, "fresh2fresh2"]);
    expect(next.doc.blocks[2]).toEqual({ ...one.doc.blocks[1], id: "fresh2fresh2" });
    expect(next.history.past).toHaveLength(2);
    expect(next.history.past[1]?.label).toBe("Duplicate the bio.");
  });

  it("names a duplicated day or needs section in the cat's recorded sex — F41", () => {
    const withNeeds: ProfileDocument = {
      ...DOC,
      sex: "male",
      blocks: [
        ...DOC.blocks,
        { id: "needsaaaaaaa", type: "needs", cards: [{ title: "", text: "" }] },
      ],
    };
    const male = reduce(start(withNeeds), {
      type: "duplicate",
      blockId: "needsaaaaaaa",
      newBlockId: () => "fresh3fresh3",
    });
    expect(male.history.past[0]?.label).toBe('Duplicate the "What he needs" section.');

    const withDay: ProfileDocument = {
      ...DOC,
      sex: undefined,
      blocks: [
        ...DOC.blocks,
        {
          id: "dayaaaaaaaaa",
          type: "day",
          scenes: [
            { mediaId: null, caption: "" },
            { mediaId: null, caption: "" },
            { mediaId: null, caption: "" },
          ],
        },
      ],
    };
    const unset = reduce(start(withDay), {
      type: "duplicate",
      blockId: "dayaaaaaaaaa",
      newBlockId: () => "fresh4fresh4",
    });
    expect(unset.history.past[0]?.label).toBe('Duplicate the "A day in their life" section.');
  });

  it("never duplicates the hero (FR-021)", () => {
    const next = reduce(start(), { type: "duplicate", blockId: HERO_ID, newBlockId: () => "x" });
    expect(next.doc).toBe(DOC);
    expect(next.history.past).toHaveLength(0);
  });

  it("ignores a block that is no longer on the page", () => {
    const state = start();
    expect(reduce(state, { type: "duplicate", blockId: "gone", newBlockId: () => "x" })).toBe(
      state,
    );
  });
});

describe("reduce: reorder", () => {
  it("is one reorder_blocks entry for the whole permutation, the hero staying first (F1)", () => {
    const two = run(start(), addBio("one"), addBio("two"));
    const [, a, b] = two.doc.blocks.map((block) => block.id);
    const next = reduce(
      two,
      apply({ op: "reorder_blocks", order: [HERO_ID, b ?? "", a ?? ""] }, "Move"),
    );
    expect(next.doc.blocks.map((block) => block.id)).toEqual([HERO_ID, b, a]);
    expect(next.history.past).toHaveLength(3);
    expect(reduce(next, { type: "undo" }).doc).toBe(two.doc);
  });
});

describe("reduce: save state", () => {
  it("goes saving → saved with the server's stamp, keeping the document", () => {
    const dirty = reduce(start(), addBio());
    const saving = reduce(dirty, { type: "saving" });
    expect(saving.save).toEqual({ status: "saving" });
    const saved = reduce(saving, {
      type: "saved",
      updatedAt: "2026-09-11T10:00:00.000Z",
      doc: dirty.doc,
    });
    expect(saved.save).toEqual({ status: "saved", savedAt: "2026-09-11T10:00:00.000Z" });
    expect(saved.doc).toBe(dirty.doc);
    expect(saved.basedOn).toBe("2026-09-11T10:00:00.000Z");
  });

  it("a save that landed for a document no longer current moves basedOn and nothing else", () => {
    const first = reduce(start(), addBio());
    const saving = reduce(first, { type: "saving" });
    const second = reduce(saving, addBio());
    expect(second.save).toEqual({ status: "dirty" });
    const landed = reduce(second, {
      type: "saved",
      updatedAt: "2026-09-11T10:00:00.000Z",
      doc: first.doc,
    });
    expect(landed.save).toEqual({ status: "dirty" });
    expect(landed.doc).toBe(second.doc);
    expect(landed.basedOn).toBe("2026-09-11T10:00:00.000Z");
  });

  it("starts based on the document's own stamp", () => {
    expect(start().basedOn).toBe(DOC.updatedAt);
  });

  it("keeps the local copy and reports the sentence when a save fails (FR-027)", () => {
    const dirty = reduce(start(), addBio());
    const failed = reduce(dirty, { type: "saveFailed", message: "The name is too long." });
    expect(failed.save).toEqual({ status: "error", message: "The name is too long." });
    expect(failed.doc).toBe(dirty.doc);
    expect(failed.history).toBe(dirty.history);
  });

  it("starts saved at the document's own stamp", () => {
    expect(start().save).toEqual({ status: "saved", savedAt: DOC.updatedAt });
  });
});

describe("reduce: assets", () => {
  it("takes the library's live list, so an upload made this session can be placed", () => {
    const photo = { id: "maaaaaaa", kind: "photo" as const };
    const place: EditOperation = { op: "replace_image", blockId: HERO_ID, mediaId: photo.id };
    const refused = reduce(start(), apply(place));
    expect(refused.notice).toBe(`No photo or clip with id "${photo.id}" is in the library.`);
    const synced = reduce(start(), { type: "assets", assets: [photo] });
    expect(synced.assets).toEqual([photo]);
    expect(synced.doc).toBe(DOC);
    const placed = reduce(synced, apply(place));
    expect(placed.notice).toBeNull();
    expect(placed.doc.blocks[0]).toMatchObject({ type: "hero", mediaId: photo.id });
  });
});
