import { describe, expect, it } from "vitest";
import { cardTarget, helperReducer, type HelperState, type Turn } from "@/core/helper/reducer";
import type { EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { BIO_ID, HERO_ID, bio, document, hero } from "../profile/builders";
import { ASSETS, PHOTO_A } from "../profile/operations.helpers";

// F42 — the build never stalls on a carded edit (build-stall-investigation.md): the exact
// step the deployed app stalled on, replayed against the reducer. The invariant every case
// asserts is the one the AI SDK needs before it will send the next request: after a step,
// every tool call has either a `results` entry or is the one card the volunteer can see.
// Nothing is ever left with neither.

const FILLED: Pick<ProfileDocument, "name" | "age" | "sex"> = {
  name: "Stalltest2",
  age: "2 years",
  sex: "male",
};

function filledState(): HelperState {
  return {
    doc: document({ ...FILLED, blocks: [hero(PHOTO_A), bio("She naps in the sun.")] }),
    history: { past: [], future: [], open: null },
    assets: ASSETS,
    status: "working",
    surface: "full",
    turn: { applied: [], touched: [], card: null, results: {}, outcome: null, entry: null },
  };
}

function setProfile(path: "name" | "age" | "sex", value: string): EditOperation {
  return { op: "set_field", target: { kind: "profile" }, path, value };
}

const ADD_EMPTY_BIO: EditOperation = {
  op: "add_block",
  block: { type: "bio", content: { paragraphs: [] } },
};

const REMOVE_BIO: EditOperation = { op: "remove_block", blockId: BIO_ID };

const SHORTEN_BIO: EditOperation = {
  op: "set_field",
  target: { kind: "block", blockId: BIO_ID },
  path: "content",
  value: { paragraphs: [{ runs: [{ text: "Naps." }] }] },
};

function newBlockId(): string {
  return "blocknewaaaa";
}

/** Replays `calls` in order, each as its own `toolCall` action. */
function replay(state: HelperState, calls: readonly [string, EditOperation][]): HelperState {
  return calls.reduce(
    (current, [toolCallId, op]) =>
      helperReducer(current, { type: "toolCall", toolCallId, op, newBlockId }),
    state,
  );
}

/** The ids with neither a result nor the card: what the SDK would wait on for ever. */
function unanswered(state: HelperState, ids: readonly string[]): string[] {
  return ids.filter(
    (id) => state.turn.results[id] === undefined && state.turn.card?.toolCallId !== id,
  );
}

describe("F42: one card at a time, every call answered", () => {
  it("the captured step — three destructive set_fields then an add_block — leaves no call unanswered", () => {
    // Values that differ from the page's, so each set_field is genuinely destructive.
    const calls: [string, EditOperation][] = [
      ["c2", setProfile("name", "Vini")],
      ["c3", setProfile("age", "3 years")],
      ["c4", setProfile("sex", "female")],
      ["c5", ADD_EMPTY_BIO],
    ];
    const next = replay(filledState(), calls);
    expect(unanswered(next, ["c2", "c3", "c4", "c5"])).toEqual([]);
    // The first destructive call is the card the volunteer sees; the next two are refused.
    expect(next.turn.card?.toolCallId).toBe("c2");
    expect(next.turn.results.c3).toEqual({
      status: "rejected",
      reason:
        "A suggestion is already waiting for the volunteer's answer. Ask again once it is answered.",
    });
    expect(next.turn.results.c4).toMatchObject({ status: "rejected" });
    // The additive edit applied, and the document is otherwise untouched.
    expect(next.turn.results.c5).toMatchObject({ status: "applied" });
    expect(next.doc.name).toBe("Stalltest2");
    expect(next.doc.age).toBe("2 years");
    expect(next.doc.sex).toBe("male");
    expect(next.doc.blocks).toHaveLength(3);
  });

  it("an applied edit after a card leaves the card in place", () => {
    const next = replay(filledState(), [
      ["c1", REMOVE_BIO],
      ["c2", ADD_EMPTY_BIO],
    ]);
    expect(next.turn.card?.toolCallId).toBe("c1");
    expect(next.turn.results.c2).toMatchObject({ status: "applied" });
    expect(next.turn.applied).toHaveLength(1);
  });

  it("a second destructive call of a different kind is refused too, and the document is untouched", () => {
    const carded = replay(filledState(), [["c1", REMOVE_BIO]]);
    const next = replay(carded, [["c2", SHORTEN_BIO]]);
    expect(next.doc).toBe(carded.doc);
    expect(next.turn.card?.toolCallId).toBe("c1");
    expect(next.turn.results.c2).toMatchObject({ status: "rejected" });
  });

  it("once the card is answered, the next destructive call is carded again", () => {
    const carded = replay(filledState(), [["c1", REMOVE_BIO]]);
    const declined = helperReducer(carded, {
      type: "cardResolved",
      toolCallId: "c1",
      choice: "decline",
    });
    const next = replay(declined, [["c2", SHORTEN_BIO]]);
    expect(next.turn.card?.toolCallId).toBe("c2");
    expect(next.turn.results.c2).toBeUndefined();
  });

  it("Apply on the card, with an applied edit already recorded after it, clears the card and keeps both", () => {
    const state = replay(filledState(), [
      ["c1", REMOVE_BIO],
      ["c2", ADD_EMPTY_BIO],
    ]);
    const next = helperReducer(state, { type: "cardResolved", toolCallId: "c1", choice: "apply" });
    expect(next.turn.card).toBeNull();
    expect(next.turn.applied.map((edit) => edit.toolCallId)).toEqual(["c2", "c1"]);
    expect(next.doc.blocks.find((block) => block.id === BIO_ID)).toBeUndefined();
  });
});

describe("F42: a set_field to the value the page already holds is a no-op, not a card", () => {
  it("re-setting name, age and sex to their current values answers applied, cards nothing and changes nothing", () => {
    const state = filledState();
    const next = replay(state, [
      ["c2", setProfile("name", "Stalltest2")],
      ["c3", setProfile("age", "2 years")],
      ["c4", setProfile("sex", "male")],
    ]);
    expect(next.turn.card).toBeNull();
    expect(next.turn.results.c2).toEqual({
      status: "applied",
      summary: "The name is already Stalltest2.",
    });
    expect(next.turn.results.c3).toMatchObject({ status: "applied" });
    expect(next.turn.results.c4).toMatchObject({ status: "applied" });
    // Nothing to list, nothing to undo: the Applied line skips it and no entry opens.
    expect(next.turn.applied).toEqual([]);
    expect(next.history.open).toBeNull();
    expect(next.doc).toBe(state.doc);
  });

  it("the user's build step — same-value facts then an empty bio — applies the bio and cards nothing", () => {
    const next = replay(filledState(), [
      ["c2", setProfile("name", "Stalltest2")],
      ["c3", setProfile("age", "2 years")],
      ["c4", setProfile("sex", "male")],
      ["c5", ADD_EMPTY_BIO],
    ]);
    expect(unanswered(next, ["c2", "c3", "c4", "c5"])).toEqual([]);
    expect(next.turn.card).toBeNull();
    expect(next.turn.applied.map((edit) => edit.toolCallId)).toEqual(["c5"]);
    expect(next.doc.blocks).toHaveLength(3);
  });
});

// F60 (design 2026-09-13 §4): the canvas reveals the block a pending card names, so the
// volunteer sees *where* while the card says *what*. `cardTarget` is the reducer's own
// reader for it — the same pure `(doc, turn)` shape as `taggedBlocks` — so `use-follow.ts`
// needs no state of its own to ask "what block is this card about?".
describe("cardTarget (F60)", () => {
  const DOC = document({ blocks: [hero(PHOTO_A), bio("She naps in the sun.")] });

  function turnWithCard(card: Turn["card"]): Turn {
    return { applied: [], touched: [], card, results: {}, outcome: null, entry: null };
  }

  it("null with no card waiting", () => {
    expect(cardTarget(DOC, turnWithCard(null))).toBeNull();
  });

  it("a bio set_field cards the bio's own block", () => {
    const turn = turnWithCard({ toolCallId: "c1", op: SHORTEN_BIO, summary: "Shorten the bio." });
    expect(cardTarget(DOC, turn)).toBe(BIO_ID);
  });

  it("a replace_image cards the block whose photo it replaces", () => {
    const op: EditOperation = { op: "replace_image", blockId: HERO_ID, mediaId: "media2ac" };
    const turn = turnWithCard({ toolCallId: "c1", op, summary: "Replace the hero photo." });
    expect(cardTarget(DOC, turn)).toBe(HERO_ID);
  });

  it("a remove_block cards the block it would remove, even though it never applies (touchedBlockIds is [])", () => {
    const turn = turnWithCard({ toolCallId: "c1", op: REMOVE_BIO, summary: "Remove the bio." });
    expect(cardTarget(DOC, turn)).toBe(BIO_ID);
  });

  it("a profile field (no block of its own) reveals the hero — the tagline shows there", () => {
    const turn = turnWithCard({
      toolCallId: "c1",
      op: setProfile("name", "Marmalade"),
      summary: "Change the name.",
    });
    expect(cardTarget(DOC, turn)).toBe(HERO_ID);
  });

  it("an op with no block and no profile field is null — defensive only: describe.ts never cards a theme change", () => {
    const op: EditOperation = { op: "set_theme", preset: "sand" };
    const turn = turnWithCard({ toolCallId: "c1", op, summary: "Set theme Sand." });
    expect(cardTarget(DOC, turn)).toBeNull();
  });
});
