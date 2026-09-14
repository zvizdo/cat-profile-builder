import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingCard, Turn } from "@/core/helper/reducer";
import type { EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { useFollowHelper, type FollowState } from "@/ui/builder/use-follow";
import { bio, document as doc, gallery, hero, quote } from "../../unit/core/profile/builders";

// F34 ("follow, then overview"): as each helper edit lands the canvas scrolls the touched
// block into view, centred, and blinks it; when the turn ends it scrolls back to the
// first block it touched; the "just now" tags are the reducer's `taggedBlocks`; and the
// panel's change list asks for the same scroll-and-blink by block id (`reveal`). F60 adds
// a card's own reveal: raising a card scrolls to and blinks the block it names, once, the
// same way — see the "card follow (F60)" describe block below. jsdom has neither
// `scrollIntoView` nor `matchMedia`, so both are stubbed and asserted on.

const HERO = "blockaaaaaaa";
const A = "blockaaaaaab"; // the bio
const B = "blockaaaaaad"; // the gallery
const C = "blockaaaaaah"; // the quote

const scrollSpy = vi.fn();
let reduced = false;

function turn(overrides: Partial<Turn>): Turn {
  return {
    applied: [],
    touched: [],
    card: null,
    results: {},
    outcome: null,
    entry: null,
    ...overrides,
  };
}

function state(document: ProfileDocument, t: Partial<Turn>): FollowState {
  return {
    doc: document,
    history: { past: [], future: [], open: null },
    helper: { assets: [], status: "working", surface: "full", turn: turn(t) },
  };
}

const DOC = doc({ blocks: [hero(), bio(), gallery(), quote()] });

/** The canvas's frames, by the ids `blockElementId` gives them. */
function frames(...ids: string[]): void {
  document.body.innerHTML = `<main>${ids.map((id) => `<section id="block-${id}"></section>`).join("")}</main>`;
}

/** Which element the last `scrollIntoView` ran on, and with what. */
function lastScroll(): { id: string; options: ScrollIntoViewOptions } {
  const call = scrollSpy.mock.lastCall;
  const target = scrollSpy.mock.contexts.at(-1) as Element;
  return { id: target.id, options: call?.[0] as ScrollIntoViewOptions };
}

beforeEach(() => {
  vi.useFakeTimers();
  scrollSpy.mockReset();
  reduced = false;
  Element.prototype.scrollIntoView = scrollSpy;
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useFollowHelper (F34)", () => {
  it("scrolls each newly touched block into view, centred and smoothly, and blinks it for 1.6s", () => {
    frames(A, B);
    const { result, rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(result.current.pulsing.size).toBe(0);

    rerender(state(DOC, { touched: [A] }));
    expect(lastScroll()).toEqual({
      id: `block-${A}`,
      options: { block: "center", behavior: "smooth" },
    });
    expect(result.current.pulsing.has(A)).toBe(true);

    rerender(state(DOC, { touched: [A, B] }));
    expect(lastScroll().id).toBe(`block-${B}`);
    expect(scrollSpy).toHaveBeenCalledTimes(2);
    expect(result.current.pulsing.has(B)).toBe(true);

    act(() => vi.advanceTimersByTime(1599));
    expect(result.current.pulsing.has(A)).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.pulsing.has(A)).toBe(false);
    expect(result.current.pulsing.has(B)).toBe(false);
  });

  it("scrolls back to the first touched block once the turn ends and the last blink has finished", () => {
    frames(A, B);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { touched: [A] }),
    });
    rerender(state(DOC, { touched: [A, B] }));
    expect(lastScroll().id).toBe(`block-${B}`);
    act(() => vi.advanceTimersByTime(400));

    rerender(state(DOC, { touched: [A, B], outcome: { kind: "done" } }));
    // Not yet: B's own blink still has 1.2s to run.
    expect(lastScroll().id).toBe(`block-${B}`);
    act(() => vi.advanceTimersByTime(1200));
    expect(lastScroll()).toEqual({
      id: `block-${A}`,
      options: { block: "center", behavior: "smooth" },
    });
    expect(scrollSpy).toHaveBeenCalledTimes(3);
  });

  it("a turn that touched nothing ends without moving the canvas", () => {
    frames(A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    rerender(state(DOC, { outcome: { kind: "done" } }));
    act(() => vi.advanceTimersByTime(2000));
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("under reduced motion the scroll is immediate — the same place, no glide", () => {
    reduced = true;
    frames(A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    rerender(state(DOC, { touched: [A] }));
    expect(lastScroll().options).toEqual({ block: "center", behavior: "auto" });
  });

  it("reveal(blockId) scrolls to and blinks that block again, with a fresh count each time", () => {
    frames(A, B);
    const { result } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { touched: [A, B], outcome: { kind: "done" } }),
    });
    act(() => vi.advanceTimersByTime(2000));
    scrollSpy.mockReset();

    act(() => result.current.reveal(B));
    expect(lastScroll()).toEqual({
      id: `block-${B}`,
      options: { block: "center", behavior: "smooth" },
    });
    const first = result.current.pulsing.get(B);
    expect(first).toBeDefined();
    act(() => result.current.reveal(B));
    expect(result.current.pulsing.get(B)).not.toBe(first);
  });

  it("a new turn (touched back to []) drops every blink left over from the last one", () => {
    frames(A, B);
    const { result, rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { touched: [A] }),
    });
    expect(result.current.pulsing.has(A)).toBe(true);
    rerender(state(DOC, {}));
    expect(result.current.pulsing.size).toBe(0);
    rerender(state(DOC, { touched: [B] }));
    expect(result.current.pulsing.has(B)).toBe(true);
    expect(result.current.pulsing.has(A)).toBe(false);
  });

  it("`tagged` is the reducer's own taggedBlocks: the touched blocks while the turn is open", () => {
    const { result, rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { touched: [A, C] }),
    });
    expect([...result.current.tagged]).toEqual([A, C]);
    // Ended, and its entry no longer the top of the past — buried by the volunteer's edit.
    const entry = { before: DOC, after: DOC, label: "CATalyst: added bio" };
    const next = state(DOC, { touched: [A, C], outcome: { kind: "done" }, entry });
    next.history = {
      past: [entry, { before: DOC, after: DOC, label: "Edit." }],
      future: [],
      open: null,
    };
    rerender(next);
    expect(result.current.tagged.size).toBe(0);
  });

  it("a touched block with nothing on the page to show (removed again, or unknown) is skipped", () => {
    frames(A);
    const { result, rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    rerender(state(DOC, { touched: ["blockgoneaaa"] }));
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(result.current.pulsing.size).toBe(0);
  });
});

// F60 (design 2026-09-13 §4): a pending card names one block, and the canvas reveals it —
// the same scroll-and-blink `reveal` already does for a landed edit — so the volunteer
// sees where on the page while the card says what. `turn.touched` never grows for this:
// the "just now" tags and the turn-end overview are the F34 tests above, untouched.

const SHORTEN_BIO_OP: EditOperation = {
  op: "set_field",
  target: { kind: "block", blockId: A },
  path: "content",
  value: { paragraphs: [{ runs: [{ text: "Naps a lot." }] }] },
};

const REPLACE_HERO_PHOTO_OP: EditOperation = {
  op: "replace_image",
  blockId: HERO,
  mediaId: "media2ac",
};

const RENAME_OP: EditOperation = {
  op: "set_field",
  target: { kind: "profile" },
  path: "name",
  value: "Marmalade",
};

function pendingCard(op: EditOperation, toolCallId = "c1"): PendingCard {
  return { toolCallId, op, summary: "Change something." };
}

describe("card follow (F60)", () => {
  it("raising a card scrolls to and blinks the block it names, once", () => {
    frames(HERO, A);
    const { result, rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    expect(scrollSpy).not.toHaveBeenCalled();

    rerender(state(DOC, { card: pendingCard(SHORTEN_BIO_OP) }));
    expect(lastScroll()).toEqual({
      id: `block-${A}`,
      options: { block: "center", behavior: "smooth" },
    });
    expect(result.current.pulsing.has(A)).toBe(true);
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // A second render with the very same card (nothing about it changed) does not repeat.
    rerender(state(DOC, { card: pendingCard(SHORTEN_BIO_OP) }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("Apply or Not this — the card clearing — reveals nothing on its own", () => {
    frames(HERO, A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { card: pendingCard(SHORTEN_BIO_OP) }),
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    scrollSpy.mockClear();

    // Declined: the card goes back to null, nothing else in the turn changes.
    rerender(state(DOC, { card: null }));
    expect(scrollSpy).not.toHaveBeenCalled();

    // Applied instead: the card clears and the edit lands in `touched` — that reveal is
    // the ordinary F34 follow above, not this hook, and still fires exactly once.
    rerender(state(DOC, { card: null, touched: [A] }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("a replace_image card reveals the block whose photo it replaces", () => {
    frames(HERO, A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    rerender(state(DOC, { card: pendingCard(REPLACE_HERO_PHOTO_OP) }));
    expect(lastScroll().id).toBe(`block-${HERO}`);
  });

  it("a profile-field card (tagline, name — no block of its own) reveals the hero", () => {
    frames(HERO, A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, {}),
    });
    rerender(state(DOC, { card: pendingCard(RENAME_OP) }));
    expect(lastScroll().id).toBe(`block-${HERO}`);
  });

  it("a new card in a later turn (a different toolCallId) reveals again", () => {
    frames(HERO, A);
    const { rerender } = renderHook((s: FollowState) => useFollowHelper(s), {
      initialProps: state(DOC, { card: pendingCard(SHORTEN_BIO_OP, "c1") }),
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    rerender(state(DOC, { card: null }));
    rerender(state(DOC, { card: pendingCard(SHORTEN_BIO_OP, "c2") }));
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });
});
