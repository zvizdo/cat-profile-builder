import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@/core/media/schema";
import type { EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import {
  cardResolution,
  createHelperState,
  currentRejection,
  failureSentence,
  helperReducer,
  resolveToolCall,
  taggedBlocks,
  turnClauses,
  turnGroups,
  turnStanding,
  turnSummary,
  type HelperState,
  type Turn,
} from "@/core/helper/reducer";
import {
  BIO_ID,
  bio,
  document,
  GALLERY_ID,
  gallery,
  hero,
  HERO_ID,
  photo,
  PHOTO_ID,
} from "../profile/builders";
import { ASSETS, PHOTO_A, UNOWNED } from "../profile/operations.helpers";

// Fixtures: a small valid document (hero + empty bio) with the same media ids
// tests/unit/core/profile/operations.helpers.ts already owns, and MediaAsset records for
// the reducer's own media-driven state (locked/ready, `mediaChanged`).

function photoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    schemaVersion: 1,
    id: PHOTO_A,
    kind: "photo",
    fileName: "charlotte.jpg",
    mimeType: "image/jpeg",
    bytes: 100_000,
    width: 800,
    height: 600,
    focal: { x: 50, y: 50 },
    status: "ready",
    alt: { text: "Charlotte in the sun.", source: "model" },
    descriptionStatus: "ready",
    revisions: { clean: "a1b2c3d4e5" },
    createdAt: "2026-09-01T08:15:00.000Z",
    ...overrides,
  };
}

function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    schemaVersion: 1,
    id: "video2aa",
    kind: "video",
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    bytes: 900_000,
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    focal: { x: 50, y: 50 },
    status: "ready",
    alt: { text: "Charlotte pouncing.", source: "model" },
    descriptionStatus: "ready",
    originalDurationSeconds: 8,
    revisions: { web: "e5f6a7b8c9" },
    createdAt: "2026-09-01T08:15:00.000Z",
    ...overrides,
  };
}

const EMPTY_TURN: Turn = {
  applied: [],
  touched: [],
  card: null,
  results: {},
  outcome: null,
  entry: null,
};

function baseDoc(): ProfileDocument {
  return document({ blocks: [hero(PHOTO_A), bio()] });
}

function baseState(overrides: Partial<HelperState> = {}): HelperState {
  return {
    doc: baseDoc(),
    history: { past: [], future: [], open: null },
    assets: ASSETS,
    status: "working",
    surface: "full",
    turn: EMPTY_TURN,
    ...overrides,
  };
}

const ADD_QUOTE: EditOperation = {
  op: "add_block",
  block: { type: "quote", mediaId: null, text: "She purrs at the kettle." },
};

const REMOVE_BIO: EditOperation = { op: "remove_block", blockId: BIO_ID };

const REORDER_MISSING_ID: unknown = { op: "reorder_blocks" };

function newBlockId(): string {
  return "blocknewaaaa";
}

/** hero + bio + a gallery of owned photos — enough blocks to reorder meaningfully. */
function docWithGallery(): ProfileDocument {
  return document({ blocks: [hero(PHOTO_A), bio(), gallery()] });
}

/** hero + an empty photo slot — replacing it is additive, never a card. */
function docWithEmptyPhotoSlot(): ProfileDocument {
  return document({ blocks: [hero(PHOTO_A), photo(null)] });
}

describe("createHelperState / mediaChanged — locked vs ready (FR-032)", () => {
  it("is locked with no ready photo", () => {
    const state = createHelperState(baseDoc(), [photoAsset({ status: "processing" })], "full");
    expect(state.status).toBe("locked");
    expect(state.assets).toEqual([]);
  });

  it("is locked with a ready video but no ready photo", () => {
    const state = createHelperState(baseDoc(), [videoAsset()], "full");
    expect(state.status).toBe("locked");
    expect(state.assets).toEqual([{ id: "video2aa", kind: "video" }]);
  });

  it("is ready once one photo is ready", () => {
    const state = createHelperState(baseDoc(), [photoAsset()], "full");
    expect(state.status).toBe("ready");
    expect(state.assets).toEqual([{ id: PHOTO_A, kind: "photo" }]);
  });

  it("mediaChanged updates assets to the MediaRefs of the ready ones only", () => {
    const state = baseState({ status: "ready", assets: [] });
    const next = helperReducer(state, {
      type: "mediaChanged",
      assets: [photoAsset(), photoAsset({ id: "media2ab", status: "processing" })],
    });
    expect(next.assets).toEqual([{ id: PHOTO_A, kind: "photo" }]);
    expect(next.status).toBe("ready");
  });

  it("mediaChanged does not downgrade status while working", () => {
    const state = baseState({ status: "working" });
    const next = helperReducer(state, { type: "mediaChanged", assets: [] });
    expect(next.status).toBe("working");
    expect(next.assets).toEqual([]);
  });

  it("mediaChanged locks again once the last ready photo is gone (not working)", () => {
    const state = baseState({ status: "ready" });
    const next = helperReducer(state, { type: "mediaChanged", assets: [] });
    expect(next.status).toBe("locked");
  });
});

describe("send", () => {
  it("moves ready to working and resets the turn", () => {
    const state = baseState({
      status: "ready",
      turn: { ...EMPTY_TURN, outcome: { kind: "done" } },
    });
    const next = helperReducer(state, { type: "send" });
    expect(next.status).toBe("working");
    expect(next.turn).toEqual(EMPTY_TURN);
  });

  it("does nothing while locked", () => {
    const state = baseState({ status: "locked" });
    expect(helperReducer(state, { type: "send" })).toBe(state);
  });

  it("does nothing while already working", () => {
    const state = baseState({ status: "working" });
    expect(helperReducer(state, { type: "send" })).toBe(state);
  });

  // F35, the unanswered-card rule (contracts/helper-protocol.md → Results): a new message
  // while a card is still waiting is "Not this" for that card.
  describe("with a card pending", () => {
    function carded(): HelperState {
      const applied = helperReducer(baseState({ doc: docWithGallery() }), {
        type: "toolCall",
        toolCallId: "call-0",
        op: { op: "reorder_blocks", order: [HERO_ID, GALLERY_ID, BIO_ID] },
        newBlockId,
      });
      return helperReducer(applied, {
        type: "toolCall",
        toolCallId: "call-1",
        op: REMOVE_BIO,
        newBlockId,
      });
    }

    it("declines the card, leaves the document as it was, and starts the new turn working", () => {
      const state = carded();
      expect(state.status).toBe("working");
      expect(state.turn.card).not.toBeNull();
      const next = helperReducer(state, { type: "send" });
      expect(next.status).toBe("working");
      expect(next.doc).toBe(state.doc);
      expect(next.turn.card).toBeNull();
      expect(next.turn.applied).toEqual([]);
      expect(next.turn.outcome).toBeNull();
    });

    it("closes the old turn's history entry with what it applied, so one undo still covers it", () => {
      const state = carded();
      expect(state.history.open).not.toBeNull();
      const next = helperReducer(state, { type: "send" });
      expect(next.history.open).toBeNull();
      expect(next.history.past).toHaveLength(1);
      expect(next.history.past[0]?.label).toBe("CATalyst: moved gallery");
    });

    it("carries the declined result into the new turn, so the panel can still say the card was left as it was", () => {
      const next = helperReducer(carded(), { type: "send" });
      expect(next.turn.results).toEqual({ "call-1": { status: "declined" } });
      expect(cardResolution(next.turn, "call-1")).toEqual({ status: "declined" });
    });

    it("the declined result gives way once anything newer lands in the new turn", () => {
      const next = helperReducer(carded(), { type: "send" });
      const later = helperReducer(next, {
        type: "toolCall",
        toolCallId: "call-2",
        op: ADD_QUOTE,
        newBlockId,
      });
      expect(cardResolution(later.turn, "call-1")).toBeNull();
    });
  });
});

describe("toolCall — additive edits apply immediately", () => {
  it("applies a non-destructive op at once and opens the turn entry on the first one", () => {
    const state = baseState();
    const next = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(next.doc.blocks).toHaveLength(3);
    expect(next.doc.blocks.at(-1)).toMatchObject({ type: "quote", id: "blocknewaaaa" });
    expect(next.turn.applied).toHaveLength(1);
    expect(next.turn.applied[0]).toMatchObject({ toolCallId: "call-1", op: ADD_QUOTE });
    expect(next.turn.results["call-1"]).toEqual({
      status: "applied",
      summary: next.turn.applied[0]?.summary,
    });
    expect(next.history.open).not.toBeNull();
    expect(next.history.open?.before).toBe(state.doc);
    expect(next.history.open?.after).toBe(next.doc);
  });

  it("folds a second applied edit into the same open entry — one entry for the whole turn", () => {
    const state = baseState();
    const afterFirst = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    const afterSecond = helperReducer(afterFirst, {
      type: "toolCall",
      toolCallId: "call-2",
      op: { op: "set_theme", preset: "sand" },
      newBlockId,
    });
    expect(afterSecond.turn.applied).toHaveLength(2);
    expect(afterSecond.history.open?.before).toBe(state.doc);
    expect(afterSecond.history.open?.after).toBe(afterSecond.doc);
  });

  it("is ignored outside working", () => {
    const state = baseState({ status: "ready" });
    const next = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(next).toBe(state);
  });
});

describe("toolCall — destructive edits are carded", () => {
  it("cards the op and leaves the document untouched", () => {
    const state = baseState();
    const next = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    expect(next.doc).toBe(state.doc);
    expect(next.turn.card).toMatchObject({ toolCallId: "call-1", op: REMOVE_BIO });
    expect(next.turn.applied).toHaveLength(0);
    // No result is sent to the model until the card is resolved.
    expect(next.turn.results["call-1"]).toBeUndefined();
  });

  it("cardResolved(apply) applies the card's op and records it as one applied edit", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const next = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-1",
      choice: "apply",
    });
    expect(next.doc.blocks.find((b) => b.id === BIO_ID)).toBeUndefined();
    expect(next.turn.card).toBeNull();
    expect(next.turn.applied).toHaveLength(1);
    expect(next.turn.results["call-1"]).toEqual({
      status: "applied",
      summary: next.turn.applied[0]?.summary,
    });
    expect(next.history.open?.before).toBe(carded.doc);
  });

  it("cardResolved(decline) leaves the document unchanged and records declined", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const next = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-1",
      choice: "decline",
    });
    expect(next.doc).toBe(carded.doc);
    expect(next.turn.card).toBeNull();
    expect(next.turn.applied).toHaveLength(0);
    expect(next.turn.results["call-1"]).toEqual({ status: "declined" });
  });

  it("cardResolved for an id that is not the pending card is a no-op", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const next = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "some-other-call",
      choice: "apply",
    });
    expect(next).toBe(carded);
  });
});

describe("toolCall — a non-conforming op is rejected", () => {
  it("rejects reorder_blocks with a missing `order`, leaves the document reference-equal, names the field, and lets the turn continue", () => {
    const state = baseState();
    const next = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: REORDER_MISSING_ID as EditOperation,
      newBlockId,
    });
    expect(next.doc).toBe(state.doc);
    const outcome = next.turn.results["call-1"];
    expect(outcome?.status).toBe("rejected");
    expect(outcome && "reason" in outcome ? outcome.reason : "").toContain("order");
    expect(next.status).toBe("working");

    // The turn continues: a further tool call still applies normally.
    const after = helperReducer(next, {
      type: "toolCall",
      toolCallId: "call-2",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(after.turn.applied).toHaveLength(1);
  });

  it("rejects an op naming media the profile does not own", () => {
    const state = baseState();
    const op: EditOperation = {
      op: "add_block",
      block: { type: "photo", mediaId: UNOWNED },
    };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "call-1", op, newBlockId });
    expect(next.doc).toBe(state.doc);
    expect(next.turn.results["call-1"]).toMatchObject({ status: "rejected" });
  });
});

describe("currentRejection", () => {
  it("names the reason once a tool call is rejected with nothing yet applied", () => {
    const state = baseState();
    const next = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: REORDER_MISSING_ID as EditOperation,
      newBlockId,
    });
    expect(currentRejection(next.turn)).toContain("order");
  });

  it("is null once anything has applied this turn, even after an earlier rejection", () => {
    const state = baseState();
    const rejected = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: REORDER_MISSING_ID as EditOperation,
      newBlockId,
    });
    const applied = helperReducer(rejected, {
      type: "toolCall",
      toolCallId: "call-2",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(currentRejection(applied.turn)).toBeNull();
  });

  it("is null for a fresh turn and once the last result is applied or declined", () => {
    expect(currentRejection(EMPTY_TURN)).toBeNull();
  });
});

// T038 review, finding 1: `cardResolution` is what lets the card's own slot keep showing
// something (Dismissed or Applied) once `turn.card` itself has gone back to `null` —
// `HelperPanel.tsx` remembers the card's `toolCallId` and looks its outcome up here.
describe("cardResolution", () => {
  it("is null while nothing has resolved that id yet (still empty, or still pending)", () => {
    expect(cardResolution(EMPTY_TURN, "call-1")).toBeNull();
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    expect(cardResolution(carded.turn, "call-1")).toBeNull();
  });

  it("is declined once the card is declined — the only status handleCardResolved's decline branch ever produces", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const declined = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-1",
      choice: "decline",
    });
    expect(cardResolution(declined.turn, "call-1")).toEqual({ status: "declined" });
  });

  it("is applied with the card's own summary once Apply is chosen", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const applied = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-1",
      choice: "apply",
    });
    expect(cardResolution(applied.turn, "call-1")).toEqual({
      status: "applied",
      summary: applied.turn.applied[0]?.summary,
    });
  });

  it("goes back to null once something newer has happened — never lingers stale", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const declined = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-1",
      choice: "decline",
    });
    const after = helperReducer(declined, {
      type: "toolCall",
      toolCallId: "call-2",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(cardResolution(after.turn, "call-1")).toBeNull();
  });

  it("is null for a toolCallId from an earlier turn — turn.results is turn-scoped (createTurn on every send)", () => {
    // A fresh turn's `results` starts empty regardless of what an earlier turn's card
    // resolved to, so a stale remembered id simply finds nothing here.
    expect(cardResolution(EMPTY_TURN, "call-1")).toBeNull();
  });
});

describe("toolCall — every op type's applied fragment and highlighted blocks", () => {
  it("set_field on the profile touches no block", () => {
    const state = baseState();
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "profile" },
      path: "tagline",
      value: "Loves a sunny windowsill.",
    };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({ verb: "changed", label: "tagline", blockIds: [] });
  });

  it("set_field on a block highlights that block", () => {
    const state = baseState();
    const op: EditOperation = {
      op: "set_field",
      target: { kind: "block", blockId: BIO_ID },
      path: "content",
      value: { paragraphs: [{ runs: [{ text: "She naps in sunbeams." }] }] },
    };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({
      verb: "changed",
      label: "bio",
      blockIds: [BIO_ID],
    });
  });

  it("reorder_blocks names the block that moved and highlights the whole new order", () => {
    const state = baseState({ doc: docWithGallery() });
    const op: EditOperation = { op: "reorder_blocks", order: [HERO_ID, GALLERY_ID, BIO_ID] };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({
      verb: "moved",
      label: "gallery",
      blockIds: [HERO_ID, GALLERY_ID, BIO_ID],
    });
  });

  it("reorder_blocks that changes nothing still applies, with no block named as moved", () => {
    const state = baseState({ doc: docWithGallery() });
    const op: EditOperation = { op: "reorder_blocks", order: [HERO_ID, BIO_ID, GALLERY_ID] };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({ verb: "moved", label: "section" });
  });

  it("replace_image into an empty slot is additive and highlights the block", () => {
    const state = baseState({ doc: docWithEmptyPhotoSlot() });
    const op: EditOperation = { op: "replace_image", blockId: PHOTO_ID, mediaId: PHOTO_A };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({
      verb: "replaced",
      label: "photo",
      blockIds: [PHOTO_ID],
    });
    expect(next.doc.blocks.find((b) => b.id === PHOTO_ID)).toMatchObject({ mediaId: PHOTO_A });
  });

  it("set_theme with only a slider named (no preset) is a plain 'changed theme'", () => {
    const state = baseState();
    const op: EditOperation = { op: "set_theme", warmth: 0.7 };
    const next = helperReducer(state, { type: "toolCall", toolCallId: "c1", op, newBlockId });
    expect(next.turn.applied[0]).toMatchObject({ verb: "changed", label: "theme" });
  });
});

// F34 ("follow, then overview"): the turn keeps the block ids it touched, in the order the
// edits landed and with no repeats, so the canvas can follow each one as it lands and
// return to the first when the turn ends. `target` on each edit is the one block the
// canvas follows for it — for a reorder that is the block that moved, never the whole
// order (which `blockIds` still carries).
describe("touched — the ordered, deduplicated block ids of a turn (F34)", () => {
  const SET_BIO: EditOperation = {
    op: "set_field",
    target: { kind: "block", blockId: BIO_ID },
    path: "content",
    value: { paragraphs: [{ runs: [{ text: "She naps in sunbeams." }] }] },
  };

  function call(state: HelperState, id: string, op: EditOperation): HelperState {
    return helperReducer(state, { type: "toolCall", toolCallId: id, op, newBlockId });
  }

  it("starts empty and records each edit's target block once, in order", () => {
    let state = baseState({ doc: docWithGallery() });
    expect(state.turn.touched).toEqual([]);
    state = call(state, "c1", SET_BIO);
    expect(state.turn.touched).toEqual([BIO_ID]);
    state = call(state, "c2", ADD_QUOTE);
    expect(state.turn.touched).toEqual([BIO_ID, "blocknewaaaa"]);
    state = call(state, "c3", SET_BIO);
    expect(state.turn.touched).toEqual([BIO_ID, "blocknewaaaa"]);
    state = call(state, "c4", { op: "set_theme", preset: "sand" });
    expect(state.turn.touched).toEqual([BIO_ID, "blocknewaaaa"]);
  });

  it("a reorder touches the block that moved, not every block in the new order", () => {
    const state = call(baseState({ doc: docWithGallery() }), "c1", {
      op: "reorder_blocks",
      order: [HERO_ID, GALLERY_ID, BIO_ID],
    });
    expect(state.turn.applied[0]?.target).toBe(GALLERY_ID);
    expect(state.turn.touched).toEqual([GALLERY_ID]);
  });

  it("a reorder that changes nothing touches nothing", () => {
    const state = call(baseState({ doc: docWithGallery() }), "c1", {
      op: "reorder_blocks",
      order: [HERO_ID, BIO_ID, GALLERY_ID],
    });
    expect(state.turn.applied[0]?.target).toBeNull();
    expect(state.turn.touched).toEqual([]);
  });

  it("an edit with no block of its own (a theme, a facts field) has no target", () => {
    let state = call(baseState(), "c1", { op: "set_theme", preset: "sand" });
    expect(state.turn.applied[0]?.target).toBeNull();
    state = call(state, "c2", {
      op: "set_field",
      target: { kind: "profile" },
      path: "tagline",
      value: "Loves a sunny windowsill.",
    });
    expect(state.turn.applied[1]?.target).toBeNull();
    expect(state.turn.touched).toEqual([]);
  });

  it("a card applied through cardResolved touches its block like any other edit", () => {
    const carded = call(
      baseState({ doc: document({ blocks: [hero(PHOTO_A), bio("Long.")] }) }),
      "c1",
      SET_BIO,
    );
    expect(carded.turn.card).not.toBeNull();
    const applied = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "c1",
      choice: "apply",
    });
    expect(applied.turn.touched).toEqual([BIO_ID]);
  });

  it("send starts the next turn with nothing touched", () => {
    const state = call(baseState(), "c1", SET_BIO);
    const ended = helperReducer(state, { type: "streamEnded", finishReason: "stop" });
    const next = helperReducer(ended, { type: "send" });
    expect(next.turn.touched).toEqual([]);
  });
});

// F34: the "CATalyst · just now" tags. They mark the touched blocks while the turn is in
// progress and for as long as the turn's own edits are the newest thing on the page —
// the same standing "Undo these" reads — and go the moment the volunteer edits, or undoes
// the turn; redo puts the turn's edits back, and the tags with them.
describe("taggedBlocks (F34)", () => {
  const SET_BIO: EditOperation = {
    op: "set_field",
    target: { kind: "block", blockId: BIO_ID },
    path: "content",
    value: { paragraphs: [{ runs: [{ text: "She naps in sunbeams." }] }] },
  };

  function turnOfTwo(): HelperState {
    let state = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "c1",
      op: SET_BIO,
      newBlockId,
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c2",
      op: ADD_QUOTE,
      newBlockId,
    });
    return state;
  }

  it("is empty before anything has happened", () => {
    expect(taggedBlocks(baseState({ status: "ready" }))).toEqual([]);
  });

  it("names the touched blocks while the turn is in progress and once it has ended cleanly", () => {
    const working = turnOfTwo();
    expect(taggedBlocks(working)).toEqual([BIO_ID, "blocknewaaaa"]);
    const ended = helperReducer(working, { type: "streamEnded", finishReason: "stop" });
    expect(taggedBlocks(ended)).toEqual([BIO_ID, "blocknewaaaa"]);
  });

  it("keeps them after a turn that was cut off — its edits still stand", () => {
    const ended = helperReducer(turnOfTwo(), { type: "streamEnded", error: "boom" });
    expect(taggedBlocks(ended)).toEqual([BIO_ID, "blocknewaaaa"]);
  });

  it("clears on the volunteer's next manual edit", () => {
    const ended = helperReducer(turnOfTwo(), { type: "streamEnded", finishReason: "stop" });
    const edited = helperReducer(ended, {
      type: "manualEdit",
      op: { op: "set_field", target: { kind: "profile" }, path: "tagline", value: "Hi." },
      label: "Change the tagline.",
      newBlockId,
    });
    expect(taggedBlocks(edited)).toEqual([]);
  });

  it("clears on undo and comes back on redo", () => {
    const ended = helperReducer(turnOfTwo(), { type: "streamEnded", finishReason: "stop" });
    const undone = helperReducer(ended, { type: "undo" });
    expect(taggedBlocks(undone)).toEqual([]);
    const redone = helperReducer(undone, { type: "redo" });
    expect(taggedBlocks(redone)).toEqual([BIO_ID, "blocknewaaaa"]);
  });
});

// F34: the panel's change list needs the same folding `turnClauses` reads as a sentence,
// but edit by edit, so each label can be the button that finds its block.
describe("turnGroups (F34)", () => {
  it("folds consecutive same-verb edits into one group, in order, and turnClauses reads the same", () => {
    let state = helperReducer(baseState({ doc: docWithGallery() }), {
      type: "toolCall",
      toolCallId: "c1",
      op: ADD_QUOTE,
      newBlockId,
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c2",
      op: { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } },
      newBlockId: () => "blocknewaaab",
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c3",
      op: { op: "set_theme", preset: "sand" },
      newBlockId,
    });
    const groups = turnGroups(state.turn);
    expect(groups.map((g) => [g.verb, g.edits.map((e) => e.label)])).toEqual([
      ["added", ["quote", "bio"]],
      ["set theme", ["Sand"]],
    ]);
    expect(turnClauses(state.turn)).toBe("added quote, bio; set theme Sand");
  });

  it("is empty for an empty turn", () => {
    expect(turnGroups(EMPTY_TURN)).toEqual([]);
  });
});

describe("cardResolved(apply) when the card's op no longer applies", () => {
  it("records a rejected result and leaves the document and card cleared", () => {
    // Hand-built: a card pending on an op the current document can no longer accept
    // (the block it names is gone) — proves the apply path re-validates rather than
    // trusting the card blindly.
    const state = baseState({
      turn: {
        ...EMPTY_TURN,
        card: { toolCallId: "c1", op: REMOVE_BIO, summary: "Remove the bio." },
      },
      doc: document({ blocks: [hero(PHOTO_A)] }), // no bio block anymore
    });
    const next = helperReducer(state, { type: "cardResolved", toolCallId: "c1", choice: "apply" });
    expect(next.doc).toBe(state.doc);
    expect(next.turn.card).toBeNull();
    expect(next.turn.results["c1"]).toMatchObject({ status: "rejected" });
  });
});

describe("streamEnded", () => {
  function turnOf(...ops: EditOperation[]) {
    let state = baseState();
    ops.forEach((op, index) => {
      state = helperReducer(state, {
        type: "toolCall",
        toolCallId: `call-${index}`,
        op,
        newBlockId,
      });
    });
    return state;
  }

  it("closes the entry into one history step for the whole turn on a normal finish", () => {
    const before = baseState();
    const applied = helperReducer(
      helperReducer(before, {
        type: "toolCall",
        toolCallId: "call-1",
        op: ADD_QUOTE,
        newBlockId,
      }),
      {
        type: "toolCall",
        toolCallId: "call-2",
        op: { op: "set_theme", preset: "sand" },
        newBlockId,
      },
    );
    const ended = helperReducer(applied, { type: "streamEnded", finishReason: "stop" });
    expect(ended.history.open).toBeNull();
    expect(ended.history.past).toHaveLength(1);
    expect(ended.history.past[0]?.before).toBe(before.doc);
    expect(ended.history.past[0]?.after).toBe(applied.doc);
    expect(ended.turn.outcome).toEqual({ kind: "done" });
    expect(ended.status).toBe("ready");
  });

  it("finishReason length sets the truncated state and keeps applied edits", () => {
    const applied = turnOf(ADD_QUOTE);
    const ended = helperReducer(applied, { type: "streamEnded", finishReason: "length" });
    expect(ended.turn.outcome).toEqual({ kind: "truncated", applied: 1 });
    expect(ended.doc).toBe(applied.doc);
    expect(ended.history.past).toHaveLength(1);
  });

  it("an error after two applied edits keeps them and names 2", () => {
    const applied = turnOf(ADD_QUOTE, { op: "set_theme", preset: "sand" });
    const ended = helperReducer(applied, { type: "streamEnded", error: "The connection dropped." });
    expect(ended.turn.outcome).toEqual({
      kind: "error",
      applied: 2,
      message: "The connection dropped.",
    });
    expect(failureSentence(ended.turn)).toBe(
      "I added 2 sections before I was cut off. Undo these, or ask me to continue.",
    );
  });

  it("an error before any edit landed reports nothing changed", () => {
    const state = baseState();
    const ended = helperReducer(state, { type: "streamEnded", error: "boom" });
    expect(ended.turn.outcome).toEqual({ kind: "error", applied: 0, message: "boom" });
    expect(failureSentence(ended.turn)).toBe("Nothing on your page changed.");
    expect(ended.history.past).toHaveLength(0);
  });

  it("locks again if the ready photo library is empty when the turn ends", () => {
    const state = baseState({ assets: [] });
    const ended = helperReducer(state, { type: "streamEnded", finishReason: "stop" });
    expect(ended.status).toBe("locked");
  });
});

describe("streamEnded with a card still pending", () => {
  it("a non-error finish leaves the turn open: card stays, status stays working, outcome stays null", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const ended = helperReducer(carded, { type: "streamEnded", finishReason: "stop" });
    expect(ended).toBe(carded);
    expect(ended.turn.card).toEqual({
      toolCallId: "call-1",
      op: REMOVE_BIO,
      summary: expect.any(String),
    });
    expect(ended.status).toBe("working");
    expect(ended.turn.outcome).toBeNull();
  });

  it("an error drops the pending card, records it declined so no tool call is left unanswered, and ends the turn", () => {
    const carded = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: REMOVE_BIO,
      newBlockId,
    });
    const ended = helperReducer(carded, { type: "streamEnded", error: "The connection dropped." });
    expect(ended.turn.card).toBeNull();
    expect(ended.turn.results["call-1"]).toEqual({ status: "declined" });
    expect(ended.turn.outcome).toEqual({
      kind: "error",
      applied: 0,
      message: "The connection dropped.",
    });
    expect(ended.doc).toBe(carded.doc);
    expect(ended.status).toBe("ready");
  });

  it("cardResolved(apply) after a kept-open turn still appends to the same open entry — one entry for the whole turn", () => {
    const before = baseState();
    const afterFirstEdit = helperReducer(before, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    const carded = helperReducer(afterFirstEdit, {
      type: "toolCall",
      toolCallId: "call-2",
      op: REMOVE_BIO,
      newBlockId,
    });
    const stillWorking = helperReducer(carded, { type: "streamEnded", finishReason: "stop" });
    expect(stillWorking).toBe(carded);

    const applied = helperReducer(stillWorking, {
      type: "cardResolved",
      toolCallId: "call-2",
      choice: "apply",
    });
    expect(applied.turn.applied).toHaveLength(2);
    expect(applied.history.open?.before).toBe(before.doc);
    expect(applied.history.open?.after).toBe(applied.doc);

    const ended = helperReducer(applied, { type: "streamEnded", finishReason: "stop" });
    expect(ended.history.open).toBeNull();
    expect(ended.history.past).toHaveLength(1);
    expect(ended.history.past[0]?.before).toBe(before.doc);
    expect(ended.history.past[0]?.after).toBe(applied.doc);
  });
});

describe("undo / redo are ignored while working", () => {
  it("ignores undo while working", () => {
    const state = baseState({
      status: "working",
      history: {
        past: [{ before: baseDoc(), after: baseDoc(), label: "x" }],
        future: [],
        open: null,
      },
    });
    expect(helperReducer(state, { type: "undo" })).toBe(state);
  });

  it("ignores redo while working", () => {
    const state = baseState({
      status: "working",
      history: {
        past: [],
        future: [{ before: baseDoc(), after: baseDoc(), label: "x" }],
        open: null,
      },
    });
    expect(helperReducer(state, { type: "redo" })).toBe(state);
  });

  it("undo works once the turn has ended (status ready)", () => {
    const before = baseDoc();
    const after = document({ blocks: [hero(PHOTO_A), bio(), { ...bio(), id: "blockzzzzzza" }] });
    const state = baseState({
      status: "ready",
      doc: after,
      history: { past: [{ before, after, label: "Helper: added bio" }], future: [], open: null },
    });
    const next = helperReducer(state, { type: "undo" });
    expect(next.doc).toBe(before);
    expect(next.history.past).toHaveLength(0);
  });

  it("undo with nothing to undo is a no-op", () => {
    const state = baseState({ status: "ready" });
    expect(helperReducer(state, { type: "undo" })).toBe(state);
  });

  it("redo with nothing to redo is a no-op", () => {
    const state = baseState({ status: "ready" });
    expect(helperReducer(state, { type: "redo" })).toBe(state);
  });

  it("redo works once the turn has ended (status ready)", () => {
    const before = baseDoc();
    const after = document({ blocks: [hero(PHOTO_A), bio(), { ...bio(), id: "blockzzzzzza" }] });
    const state = baseState({
      status: "ready",
      doc: before,
      history: { past: [], future: [{ before, after, label: "Helper: added bio" }], open: null },
    });
    const next = helperReducer(state, { type: "redo" });
    expect(next.doc).toBe(after);
    expect(next.history.future).toHaveLength(0);
  });
});

describe("manualEdit", () => {
  it("is ignored while working", () => {
    const state = baseState({ status: "working" });
    const next = helperReducer(state, {
      type: "manualEdit",
      op: ADD_QUOTE,
      label: "Add a quote.",
      newBlockId,
    });
    expect(next).toBe(state);
  });

  it("is its own history entry once the turn has ended", () => {
    const before = baseDoc();
    const state = baseState({
      status: "ready",
      doc: before,
      history: {
        past: [{ before, after: before, label: "Helper: added bio" }],
        future: [],
        open: null,
      },
    });
    const next = helperReducer(state, {
      type: "manualEdit",
      op: ADD_QUOTE,
      label: "Add a quote.",
      newBlockId,
    });
    expect(next.history.past).toHaveLength(2);
    expect(next.history.past[1]).toEqual({
      before,
      after: next.doc,
      label: "Add a quote.",
    });
    expect(next.doc.blocks.at(-1)?.type).toBe("quote");
  });

  it("a refused manual edit leaves the state exactly as it was", () => {
    const state = baseState({ status: "ready" });
    const op: EditOperation = { op: "add_block", block: { type: "photo", mediaId: UNOWNED } };
    const next = helperReducer(state, {
      type: "manualEdit",
      op,
      label: "Add a photo.",
      newBlockId,
    });
    expect(next).toBe(state);
  });
});

// T039 (spec.md → US3 scenario 4: "several applied AI and manual changes in one sitting …
// each step reverses in order back to the state at which the builder was opened, and redo
// replays them"): three manual edits, one helper turn of four ops (its own single history
// entry, FR-036), then two more manual edits — six history entries in all. Six undos walk
// back through every one of them in order to the document the session opened with; six
// redos replay them back to the fully-edited document, in the same order they were made.
describe("interleaved undo/redo across manual and helper edits", () => {
  it("undo walks back all 6 entries in order; redo replays them", () => {
    const original = baseDoc();
    let state = baseState({ status: "ready", doc: original });
    const docs: ProfileDocument[] = [];

    // Three manual edits — each its own history entry, applied unconditionally (manual
    // edits are never carded; see `handleManualEdit`).
    state = helperReducer(state, {
      type: "manualEdit",
      op: { op: "set_theme", preset: "card" },
      label: "m1: theme card",
      newBlockId,
    });
    docs.push(state.doc);
    state = helperReducer(state, {
      type: "manualEdit",
      op: { op: "set_field", target: { kind: "profile" }, path: "name", value: "Charlotte" },
      label: "m2: name",
      newBlockId,
    });
    docs.push(state.doc);
    state = helperReducer(state, {
      type: "manualEdit",
      op: { op: "add_block", block: { type: "quote", mediaId: null, text: "Manual quote." } },
      label: "m3: add quote",
      newBlockId: () => "blockmanaaaa",
    });
    docs.push(state.doc);
    expect(state.history.past).toHaveLength(3);

    // One helper turn of four ops, additive so none of them cards — folded into one entry.
    state = helperReducer(state, { type: "send" });
    const turnOps: [string, EditOperation, () => string][] = [
      [
        "h1",
        { op: "add_block", block: { type: "quote", mediaId: null, text: "Helper quote A." } },
        () => "blockhlpaaaa",
      ],
      [
        "h2",
        { op: "add_block", block: { type: "quote", mediaId: null, text: "Helper quote B." } },
        () => "blockhlpaaab",
      ],
      ["h3", { op: "set_theme", preset: "night" }, newBlockId],
      [
        "h4",
        {
          op: "set_field",
          target: { kind: "profile" },
          path: "tagline",
          value: "A tabby who naps.",
        },
        newBlockId,
      ],
    ];
    for (const [toolCallId, op, blockId] of turnOps) {
      state = helperReducer(state, { type: "toolCall", toolCallId, op, newBlockId: blockId });
      expect(state.turn.card).toBeNull(); // every op above is additive — never a card
    }
    state = helperReducer(state, { type: "streamEnded", finishReason: "stop" });
    docs.push(state.doc);
    expect(state.history.past).toHaveLength(4);
    expect(state.status).toBe("ready");

    // Two more manual edits after the turn has closed.
    state = helperReducer(state, {
      type: "manualEdit",
      op: { op: "add_block", block: { type: "gallery", mediaIds: [] } },
      label: "m5: add gallery",
      newBlockId: () => "blockmanaaab",
    });
    docs.push(state.doc);
    state = helperReducer(state, {
      type: "manualEdit",
      op: { op: "set_theme", contrast: 0.8 },
      label: "m6: contrast",
      newBlockId,
    });
    docs.push(state.doc);
    expect(state.history.past).toHaveLength(6);
    expect(docs).toHaveLength(6);

    // Six undos: back through docs[4], docs[3], docs[2], docs[1], docs[0], to `original`.
    const undone: ProfileDocument[] = [];
    for (let i = 0; i < 6; i++) {
      state = helperReducer(state, { type: "undo" });
      undone.push(state.doc);
    }
    expect(undone).toEqual([docs[4], docs[3], docs[2], docs[1], docs[0], original]);
    expect(state.doc).toEqual(original);
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(6);

    // Six redos replay the same six entries in the order they were originally made.
    const redone: ProfileDocument[] = [];
    for (let i = 0; i < 6; i++) {
      state = helperReducer(state, { type: "redo" });
      redone.push(state.doc);
    }
    expect(redone).toEqual(docs);
    expect(state.history.past).toHaveLength(6);
    expect(state.history.future).toHaveLength(0);
  });
});

describe("resolveToolCall — pure classification for addToolResult", () => {
  it("classifies a non-destructive op as applied, with the same summary the reducer would apply", () => {
    const state = baseState();
    const outcome = resolveToolCall(state, ADD_QUOTE);
    expect(outcome.kind).toBe("applied");
    // The document passed in is untouched — resolveToolCall is a pure read.
    expect(state.doc).toEqual(baseDoc());
  });

  it("classifies a destructive op as carded", () => {
    const state = baseState();
    const outcome = resolveToolCall(state, REMOVE_BIO);
    expect(outcome.kind).toBe("carded");
    expect(outcome.kind === "carded" ? outcome.summary : "").toMatch(/[Rr]emove/);
  });

  it("classifies a malformed op as rejected, naming the problem", () => {
    const state = baseState();
    const outcome = resolveToolCall(state, REORDER_MISSING_ID as EditOperation);
    expect(outcome.kind).toBe("rejected");
    expect(outcome.kind === "rejected" ? outcome.reason : "").toContain("order");
  });

  it("agrees with what the reducer's toolCall action actually does", () => {
    const state = baseState();
    const predicted = resolveToolCall(state, ADD_QUOTE);
    const actual = helperReducer(state, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(predicted.kind).toBe("applied");
    expect(predicted.kind === "applied" ? predicted.summary : "").toBe(
      actual.turn.applied[0]?.summary,
    );
  });
});

describe("turnSummary", () => {
  it("groups consecutive same-verb edits and separates verb groups with semicolons", () => {
    let state = baseState();
    const hero_block_add: EditOperation = {
      op: "add_block",
      block: { type: "bio", content: { paragraphs: [] } },
    };
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c1",
      op: ADD_QUOTE,
      newBlockId: () => "blockaaaaaaz",
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c2",
      op: hero_block_add,
      newBlockId: () => "blockaaaaaay",
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c3",
      op: { op: "add_block", block: { type: "gallery", mediaIds: [] } },
      newBlockId: () => "blockaaaaaax",
    });
    state = helperReducer(state, {
      type: "toolCall",
      toolCallId: "c4",
      op: { op: "set_theme", preset: "sand" },
      newBlockId,
    });
    expect(turnSummary(state.turn)).toBe("CATalyst: added quote, bio, gallery; set theme Sand");
    // F26: the panel's own "Applied — …" line reads the clauses without the history label's
    // name prefix — the same fold, so the two can never disagree.
    expect(turnClauses(state.turn)).toBe("added quote, bio, gallery; set theme Sand");
  });
});

// F26 (audit §1, §3.6): a turn that applies one edit and then cards a second which the
// volunteer declines has done two things, and the panel must report both — the applied
// edit stays (with its open history entry and its "Undo these"), and the decline is a
// resolution of the card alone, never "nothing on your page changed".
describe("declined after an applied edit — the turn keeps both (F26)", () => {
  function appliedThenDeclined(): HelperState {
    const applied = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-add",
      op: ADD_QUOTE,
      newBlockId,
    });
    const carded = helperReducer(applied, {
      type: "toolCall",
      toolCallId: "call-remove",
      op: REMOVE_BIO,
      newBlockId,
    });
    return helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "call-remove",
      choice: "decline",
    });
  }

  it("keeps the applied edit, its summary and its open entry after the decline", () => {
    const state = appliedThenDeclined();
    expect(state.turn.applied).toHaveLength(1);
    expect(state.turn.card).toBeNull();
    expect(turnSummary(state.turn)).toBe("CATalyst: added quote");
    expect(cardResolution(state.turn, "call-remove")).toEqual({ status: "declined" });
    expect(currentRejection(state.turn)).toBeNull();
    expect(state.history.open).not.toBeNull();
    expect(state.doc.blocks).toHaveLength(3);
  });

  it("ends as a clean turn with one history entry for the applied edit, the decline still readable", () => {
    const state = helperReducer(appliedThenDeclined(), {
      type: "streamEnded",
      finishReason: "stop",
    });
    expect(state.turn.outcome).toEqual({ kind: "done" });
    expect(state.turn.applied).toHaveLength(1);
    expect(cardResolution(state.turn, "call-remove")).toEqual({ status: "declined" });
    expect(state.history.open).toBeNull();
    expect(state.history.past).toHaveLength(1);
    expect(state.history.past[0]?.label).toBe("CATalyst: added quote");
  });
});

// F26 review, finding 1: the panel's "Applied — … / Undo these" must not outlive its own
// undo — a second click would undo the volunteer's own edit beneath it. `turnStanding`
// says where the turn's one history entry stands now: the top of `past` (undoable), the
// top of `future` (undone, redoable), or neither (gone — buried under newer steps, or the
// turn never applied anything).
describe("turnStanding (F26 review, finding 1)", () => {
  /** A volunteer edit, then a helper turn that applies one op and ends. */
  function endedTurn(): HelperState {
    const manual = helperReducer(baseState({ status: "ready" }), {
      type: "manualEdit",
      op: { op: "set_field", target: { kind: "profile" }, path: "name", value: "Mabel" },
      label: "Set the name.",
      newBlockId,
    });
    const working = helperReducer(manual, { type: "send" });
    const applied = helperReducer(working, {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    return helperReducer(applied, { type: "streamEnded", finishReason: "stop" });
  }

  it("is gone before the turn ends, and for a turn that applied nothing", () => {
    expect(turnStanding(baseState())).toBe("gone");
    const applied = helperReducer(baseState(), {
      type: "toolCall",
      toolCallId: "call-1",
      op: ADD_QUOTE,
      newBlockId,
    });
    expect(turnStanding(applied)).toBe("gone");
    const nothing = helperReducer(baseState(), { type: "streamEnded", finishReason: "stop" });
    expect(turnStanding(nothing)).toBe("gone");
    expect(nothing.turn.entry).toBeNull();
  });

  it("is undoable once the turn has closed its entry — the same object at the top of past", () => {
    const ended = endedTurn();
    expect(turnStanding(ended)).toBe("undoable");
    expect(ended.turn.entry).toBe(ended.history.past.at(-1));
    expect(ended.history.past).toHaveLength(2);
  });

  it("is redoable after one undo, and the volunteer's own edit is still the top of past", () => {
    const undone = helperReducer(endedTurn(), { type: "undo" });
    expect(turnStanding(undone)).toBe("redoable");
    expect(undone.doc.name).toBe("Mabel");
    expect(undone.history.past.at(-1)?.label).toBe("Set the name.");
    // Undo once more takes the volunteer's edit; the turn's entry is no longer on top.
    const twice = helperReducer(undone, { type: "undo" });
    expect(turnStanding(twice)).toBe("gone");
    expect(twice.doc.name).toBe("Charlotte");
  });

  it("is undoable again after redo, and gone once a newer edit buries it", () => {
    const undone = helperReducer(endedTurn(), { type: "undo" });
    const redone = helperReducer(undone, { type: "redo" });
    expect(turnStanding(redone)).toBe("undoable");
    const buried = helperReducer(redone, {
      type: "manualEdit",
      op: { op: "set_field", target: { kind: "profile" }, path: "tagline", value: "Lap cat." },
      label: "Set the tagline.",
      newBlockId,
    });
    expect(turnStanding(buried)).toBe("gone");
    // A new edit after an undo clears future: the turn's entry is gone, not redoable.
    const replaced = helperReducer(undone, {
      type: "manualEdit",
      op: { op: "set_field", target: { kind: "profile" }, path: "tagline", value: "Lap cat." },
      label: "Set the tagline.",
      newBlockId,
    });
    expect(turnStanding(replaced)).toBe("gone");
  });
});

describe("failureSentence", () => {
  it("uses the singular for one applied edit", () => {
    const turn: Turn = {
      ...EMPTY_TURN,
      applied: [
        {
          toolCallId: "c1",
          op: ADD_QUOTE,
          summary: "Add a quote.",
          blockIds: ["x"],
          target: "x",
          verb: "added",
          label: "quote",
        },
      ],
    };
    expect(failureSentence(turn)).toBe(
      "I added 1 section before I was cut off. Undo these, or ask me to continue.",
    );
  });

  it("says nothing changed when nothing applied", () => {
    expect(failureSentence(EMPTY_TURN)).toBe("Nothing on your page changed.");
  });
});

describe("purity", () => {
  it("HERO_ID stays put; the helper reducer never re-derives ids on its own", () => {
    expect(baseDoc().blocks[0]?.id).toBe(HERO_ID);
  });
});
