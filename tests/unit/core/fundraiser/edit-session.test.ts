import { describe, expect, it } from "vitest";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import {
  GRACE_MS,
  IDLE_MS,
  IDLE_STATE,
  editSession,
  shouldCancelOnFocusLeave,
  type CancelReason,
  type EditEvent,
  type EditState,
} from "@/core/fundraiser/edit-session";

// The transition table of contracts/editing-interaction.md → Events and results, one test per
// cell (rows: events, columns: idle / amounts / headline), plus the denials: an invalid entry
// never reaches the display (SC-008), a pass-by never steals an edit, and an event that
// changes nothing hands back the very same state object, so React does not re-render.

const CURRENT: Fundraiser = {
  headline: "Help Mochi get home",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};

type Amounts = Extract<EditState, { kind: "amounts" }>;
type Headline = Extract<EditState, { kind: "headline" }>;

function amounts(overrides: Partial<Amounts> = {}): Amounts {
  return {
    kind: "amounts",
    raised: "$6,500",
    goal: "$10,000",
    sticky: false,
    refusals: {},
    ...overrides,
  };
}

function headline(overrides: Partial<Headline> = {}): Headline {
  return { kind: "headline", text: CURRENT.headline, ...overrides };
}

function run(state: EditState, event: EditEvent, current: Fundraiser = CURRENT) {
  return editSession(state, event, current);
}

const REASONS: readonly CancelReason[] = ["escape", "outside", "focus-leave", "idle", "fullscreen"];

describe("constants", () => {
  it("idles out after a minute and gives the pointer 300 ms to cross a gap", () => {
    expect(IDLE_MS).toBe(60_000);
    expect(GRACE_MS).toBe(300);
  });

  it("starts idle", () => {
    expect(IDLE_STATE).toEqual({ kind: "idle" });
  });
});

describe("hover-enter", () => {
  it("opens the amounts from idle, not sticky, with drafts that read like the display", () => {
    const { state, commit } = run(IDLE_STATE, { type: "hover-enter" });
    expect(state).toEqual({
      kind: "amounts",
      raised: "$6,500",
      goal: "$10,000",
      sticky: false,
      refusals: {},
    });
    expect(commit).toBeUndefined();
  });

  it("shows cents in a draft only when there are some", () => {
    const { state } = run(
      IDLE_STATE,
      { type: "hover-enter" },
      { ...CURRENT, raisedCents: 650_050 },
    );
    expect(state).toMatchObject({ raised: "$6,500.50", goal: "$10,000" });
  });

  it("stays in amounts and returns the same state, sticky or not", () => {
    for (const sticky of [false, true]) {
      const before = amounts({ sticky, raised: "$7" });
      expect(run(before, { type: "hover-enter" }).state).toBe(before);
    }
  });

  it("is ignored while the headline is open: a pass-by must not steal an edit", () => {
    const before = headline({ text: "half typed" });
    const { state, commit } = run(before, { type: "hover-enter" });
    expect(state).toBe(before);
    expect(commit).toBeUndefined();
  });
});

describe("hover-leave", () => {
  it("does nothing from idle", () => {
    expect(run(IDLE_STATE, { type: "hover-leave" }).state).toBe(IDLE_STATE);
  });

  it("closes a session that was only a preview, dropping the drafts", () => {
    const { state, commit } = run(amounts({ sticky: false }), { type: "hover-leave" });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toBeUndefined();
  });

  it("keeps a sticky session open and returns the same state", () => {
    const before = amounts({ sticky: true, raised: "$7" });
    expect(run(before, { type: "hover-leave" }).state).toBe(before);
  });

  it("does nothing to the headline", () => {
    const before = headline();
    expect(run(before, { type: "hover-leave" }).state).toBe(before);
  });
});

describe("open-amounts", () => {
  it("opens sticky from idle", () => {
    expect(run(IDLE_STATE, { type: "open-amounts" }).state).toEqual(amounts({ sticky: true }));
  });

  it("makes a hover preview sticky and keeps its drafts", () => {
    const { state } = run(amounts({ sticky: false, raised: "$7" }), { type: "open-amounts" });
    expect(state).toEqual(amounts({ sticky: true, raised: "$7" }));
  });

  it("returns the same state when it is already sticky", () => {
    const before = amounts({ sticky: true });
    expect(run(before, { type: "open-amounts" }).state).toBe(before);
  });

  it("from the headline discards the headline draft and opens fresh amounts", () => {
    const { state, commit } = run(headline({ text: "typed but not confirmed" }), {
      type: "open-amounts",
    });
    expect(state).toEqual(amounts({ sticky: true }));
    expect(commit).toBeUndefined();
  });
});

describe("open-headline", () => {
  it("opens the headline from idle with the current text", () => {
    expect(run(IDLE_STATE, { type: "open-headline" }).state).toEqual(headline());
  });

  it("from amounts discards the amount drafts and their refusals", () => {
    const before = amounts({ sticky: true, raised: "oops", refusals: { raised: "not-a-number" } });
    const { state, commit } = run(before, { type: "open-headline" });
    expect(state).toEqual(headline());
    expect(commit).toBeUndefined();
  });

  it("stays when the headline is already open, keeping its draft", () => {
    const before = headline({ text: "half typed" });
    expect(run(before, { type: "open-headline" }).state).toBe(before);
  });

  it("never reaches the headline from amounts with the amount drafts still held", () => {
    const { state } = run(amounts({ raised: "$7" }), { type: "open-headline" });
    expect(state.kind).toBe("headline");
    expect(state).not.toHaveProperty("raised");
    expect(state).not.toHaveProperty("goal");
  });
});

describe("field-focus", () => {
  it("does nothing from idle", () => {
    expect(run(IDLE_STATE, { type: "field-focus" }).state).toBe(IDLE_STATE);
  });

  it("makes a hover preview sticky", () => {
    expect(run(amounts({ sticky: false }), { type: "field-focus" }).state).toEqual(
      amounts({ sticky: true }),
    );
  });

  it("returns the same state when amounts are already sticky", () => {
    const before = amounts({ sticky: true });
    expect(run(before, { type: "field-focus" }).state).toBe(before);
  });

  it("leaves the headline as it is", () => {
    const before = headline();
    expect(run(before, { type: "field-focus" }).state).toBe(before);
  });
});

describe("input", () => {
  it("does nothing from idle", () => {
    expect(run(IDLE_STATE, { type: "input", field: "raised", text: "5" }).state).toBe(IDLE_STATE);
  });

  it("changes only the raised draft, makes the session sticky, and clears only its refusal", () => {
    const before = amounts({ refusals: { raised: "negative", goal: "zero" } });
    const { state, commit } = run(before, { type: "input", field: "raised", text: "$7,2" });
    expect(state).toEqual(amounts({ raised: "$7,2", sticky: true, refusals: { goal: "zero" } }));
    expect(commit).toBeUndefined();
  });

  it("changes only the goal draft, and clears only its refusal", () => {
    const before = amounts({ refusals: { raised: "negative", goal: "zero" } });
    const { state } = run(before, { type: "input", field: "goal", text: "5" });
    expect(state).toEqual(amounts({ goal: "5", sticky: true, refusals: { raised: "negative" } }));
  });

  it("returns the same state when the text, stickiness and refusals would not change", () => {
    const before = amounts({ sticky: true, raised: "$7" });
    expect(run(before, { type: "input", field: "raised", text: "$7" }).state).toBe(before);
  });

  it("ignores a headline keystroke while the amounts are open", () => {
    const before = amounts({ sticky: true });
    expect(run(before, { type: "input", field: "headline", text: "x" }).state).toBe(before);
  });

  it("changes the headline draft and clears its refusal", () => {
    const before = headline({ text: "", refusal: "empty" });
    const { state, commit } = run(before, { type: "input", field: "headline", text: "Hi" });
    expect(state).toEqual({ kind: "headline", text: "Hi" });
    expect(state).not.toHaveProperty("refusal");
    expect(commit).toBeUndefined();
  });

  it("returns the same state when the headline draft would not change", () => {
    const before = headline();
    expect(run(before, { type: "input", field: "headline", text: CURRENT.headline }).state).toBe(
      before,
    );
  });

  it("ignores an amount keystroke while the headline is open", () => {
    const before = headline();
    expect(run(before, { type: "input", field: "goal", text: "5" }).state).toBe(before);
  });
});

describe("confirm in idle", () => {
  it("does nothing", () => {
    const { state, commit } = run(IDLE_STATE, { type: "confirm" });
    expect(state).toBe(IDLE_STATE);
    expect(commit).toBeUndefined();
  });
});

describe("confirm in amounts", () => {
  it("commits both fields when both changed, and goes idle", () => {
    const { state, commit } = run(amounts({ sticky: true, raised: "7,200", goal: "$12,000.50" }), {
      type: "confirm",
    });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toEqual({ raisedCents: 720_000, goalCents: 1_200_050 });
  });

  it("commits only the changed field", () => {
    const { commit } = run(amounts({ sticky: true, raised: "$7,200" }), { type: "confirm" });
    expect(commit).toEqual({ raisedCents: 720_000 });
    expect(commit).not.toHaveProperty("goalCents");

    const second = run(amounts({ sticky: true, goal: "$20,000" }), { type: "confirm" });
    expect(second.commit).toEqual({ goalCents: 2_000_000 });
  });

  it("commits nothing when the drafts equal the current values, and goes idle", () => {
    const { state, commit } = run(amounts({ sticky: true }), { type: "confirm" });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toBeUndefined();
  });

  it("treats text that reads as the current value as unchanged ($6,500.00 is $6,500)", () => {
    const { commit } = run(amounts({ raised: "6500.00" }), { type: "confirm" });
    expect(commit).toBeUndefined();
  });

  it("DENIAL: a valid raised and a goal of 0 commit nothing and keep the old values (SC-008)", () => {
    const before = amounts({ sticky: true, raised: "$7,200", goal: "0" });
    const { state, commit } = run(before, { type: "confirm" });
    expect(commit).toBeUndefined();
    expect(state).toEqual({ ...before, refusals: { goal: "zero" } });
    expect(state).toMatchObject({ raised: "$7,200", goal: "0" });
  });

  it("DENIAL: an invalid raised blocks a valid goal too", () => {
    const { state, commit } = run(amounts({ raised: "abc", goal: "$20,000" }), { type: "confirm" });
    expect(commit).toBeUndefined();
    expect(state).toMatchObject({ kind: "amounts", refusals: { raised: "not-a-number" } });
    expect(state).not.toHaveProperty("refusals.goal");
    expect((state as Amounts).refusals.goal).toBeUndefined();
  });

  it("records both codes when both are invalid", () => {
    const { state, commit } = run(amounts({ raised: "-5", goal: "" }), { type: "confirm" });
    expect(commit).toBeUndefined();
    expect(state).toMatchObject({ refusals: { raised: "negative", goal: "empty" } });
  });

  it.each([
    ["", "empty"],
    ["abc", "not-a-number"],
    ["-1", "negative"],
    ["1.234", "too-precise"],
    ["100,000,000", "too-large"],
  ] as const)("refuses raised %j as %s", (text, code) => {
    const { state } = run(amounts({ raised: text }), { type: "confirm" });
    expect((state as Amounts).refusals).toEqual({ raised: code });
  });

  it("refuses a goal that is too large", () => {
    const { state } = run(amounts({ goal: "100,000,000" }), { type: "confirm" });
    expect((state as Amounts).refusals).toEqual({ goal: "too-large" });
  });

  it("accepts a raised of 0 and a raised above the goal", () => {
    expect(run(amounts({ raised: "0" }), { type: "confirm" }).commit).toEqual({ raisedCents: 0 });
    expect(run(amounts({ raised: "$99,999" }), { type: "confirm" }).commit).toEqual({
      raisedCents: 9_999_900,
    });
  });

  it("replaces an old refusal when the same entry is confirmed again and is now fine", () => {
    const before = amounts({ raised: "$7,200", refusals: { raised: "negative" } });
    const { state, commit } = run(before, { type: "confirm" });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toEqual({ raisedCents: 720_000 });
  });

  it("returns the same state when a repeated confirm refuses with the same codes", () => {
    const first = run(amounts({ raised: "abc" }), { type: "confirm" }).state;
    expect(run(first, { type: "confirm" }).state).toBe(first);
  });
});

describe("confirm in headline", () => {
  it("commits a changed headline, normalised, and goes idle", () => {
    const { state, commit } = run(headline({ text: "  Mochi   needs\ta home " }), {
      type: "confirm",
    });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toEqual({ headline: "Mochi needs a home" });
  });

  it("commits nothing when the headline is unchanged", () => {
    const { state, commit } = run(headline(), { type: "confirm" });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toBeUndefined();
  });

  it("refuses an empty headline and stays", () => {
    const { state, commit } = run(headline({ text: "  \n " }), { type: "confirm" });
    expect(commit).toBeUndefined();
    expect(state).toEqual(headline({ text: "  \n ", refusal: "empty" }));
  });

  it("refuses 61 characters as too-long, and never cuts", () => {
    const text = "x".repeat(61);
    const { state, commit } = run(headline({ text }), { type: "confirm" });
    expect(commit).toBeUndefined();
    expect(state).toEqual(headline({ text, refusal: "too-long" }));
  });

  it("accepts exactly 60 characters", () => {
    const text = "y".repeat(60);
    expect(run(headline({ text }), { type: "confirm" }).commit).toEqual({ headline: text });
  });

  it("returns the same state when a repeated confirm refuses with the same code", () => {
    const first = run(headline({ text: "" }), { type: "confirm" }).state;
    expect(run(first, { type: "confirm" }).state).toBe(first);
  });
});

describe("cancel", () => {
  it.each(REASONS)("from idle (%s) does nothing and returns the same state", (reason) => {
    const { state, commit } = run(IDLE_STATE, { type: "cancel", reason });
    expect(state).toBe(IDLE_STATE);
    expect(commit).toBeUndefined();
  });

  it.each(REASONS)("from amounts (%s) goes idle and drops the drafts", (reason) => {
    const before = amounts({ sticky: true, raised: "$7", refusals: { goal: "zero" } });
    const { state, commit } = run(before, { type: "cancel", reason });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toBeUndefined();
  });

  it.each(REASONS)("from headline (%s) goes idle and drops the draft", (reason) => {
    const { state, commit } = run(headline({ text: "typed" }), { type: "cancel", reason });
    expect(state).toEqual({ kind: "idle" });
    expect(commit).toBeUndefined();
  });

  it("from a hover preview also goes idle", () => {
    expect(run(amounts({ sticky: false }), { type: "cancel", reason: "fullscreen" }).state).toEqual(
      {
        kind: "idle",
      },
    );
  });
});

describe("a session after cancel starts from the current values", () => {
  it("reopens with fresh drafts, not the dropped ones", () => {
    const dropped = run(amounts({ sticky: true, raised: "$7" }), {
      type: "cancel",
      reason: "escape",
    });
    expect(run(dropped.state, { type: "open-amounts" }).state).toEqual(amounts({ sticky: true }));
  });
});

describe("shouldCancelOnFocusLeave", () => {
  it("never cancels when focus moved to an element inside the region", () => {
    for (const activeElementInside of [true, false]) {
      for (const pointerDownInside of [true, false]) {
        expect(
          shouldCancelOnFocusLeave({
            relatedTargetInside: true,
            activeElementInside,
            pointerDownInside,
          }),
        ).toBe(false);
      }
    }
  });

  it("always cancels at once when focus moved to an element outside the region", () => {
    for (const activeElementInside of [true, false]) {
      for (const pointerDownInside of [true, false]) {
        expect(
          shouldCancelOnFocusLeave({
            relatedTargetInside: false,
            activeElementInside,
            pointerDownInside,
          }),
        ).toBe(true);
      }
    }
  });

  it("with a null related target (Safari) cancels only when focus is outside and no press began inside", () => {
    const rule = (activeElementInside: boolean, pointerDownInside: boolean) =>
      shouldCancelOnFocusLeave({
        relatedTargetInside: null,
        activeElementInside,
        pointerDownInside,
      });
    expect(rule(false, false)).toBe(true);
    expect(rule(true, false)).toBe(false);
    expect(rule(false, true)).toBe(false);
    expect(rule(true, true)).toBe(false);
  });
});
