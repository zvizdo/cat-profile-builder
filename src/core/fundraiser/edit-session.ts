// The rules of editing in place, as a pure state machine (contracts/editing-interaction.md →
// Events and results; data-model.md → Edit session). The React hook only turns DOM events into
// the events below and runs two timers; every decision, including the Safari focus-leave rule,
// lives here so it can be tested without a browser. No React, no DOM, no timers in this module.

import {
  validateGoal,
  validateHeadline,
  validateRaised,
  type Fundraiser,
  type GoalReason,
  type HeadlineReason,
  type RaisedReason,
} from "@/core/fundraiser/fundraiser";
import { formatDollars } from "@/core/fundraiser/money";

/** Milliseconds with no input before an open session is cancelled (reason `idle`). Hook-owned timer. */
export const IDLE_MS = 60_000;

/**
 * Milliseconds the pointer may spend outside the figures region before `hover-leave` is sent.
 * The thermometer and the amounts sit in different columns, so the pointer must be able to
 * cross the gap between them. Hook-owned timer.
 */
export const GRACE_MS = 300;

/** Why a session was cancelled: the hook returns focus to the opener for `escape` only. */
export type CancelReason = "escape" | "outside" | "focus-leave" | "idle" | "fullscreen";

/** The fields a keystroke can land in. */
export type EditField = "raised" | "goal" | "headline";

/** The refusals recorded by a failed confirm of the amounts, one per field at most. */
export type AmountRefusals = { raised?: RaisedReason; goal?: GoalReason };

/**
 * Where the session is. `amounts` holds both drafts as text, whether a person has touched the
 * fields (`sticky`: a hover preview that was never touched leaves with the pointer), and the
 * codes of the last refused confirm. `headline` holds its one draft and its refusal.
 */
export type EditState =
  | { kind: "idle" }
  | {
      kind: "amounts";
      raised: string;
      goal: string;
      sticky: boolean;
      refusals: AmountRefusals;
    }
  | { kind: "headline"; text: string; refusal?: HeadlineReason };

/** What the hook can tell the machine happened. */
export type EditEvent =
  | { type: "hover-enter" }
  | { type: "hover-leave" }
  | { type: "open-amounts" }
  | { type: "open-headline" }
  | { type: "field-focus" }
  | { type: "input"; field: EditField; text: string }
  | { type: "confirm" }
  | { type: "cancel"; reason: CancelReason };

/**
 * The answer to an event: the next state, and, only when a confirm changed something, the
 * changed fields (never the unchanged ones). The hook applies `commit` to the page and writes
 * the address once.
 */
export type EditResult = { state: EditState; commit?: Partial<Fundraiser> };

/** The state with nothing open. One shared object, so "no change" can be a reference check. */
export const IDLE_STATE: EditState = Object.freeze({ kind: "idle" });

/** The three things the hook reads off the DOM when a field loses focus. */
export type FocusLeaveInput = {
  /** Where focus went: inside the region, outside it, or `null` when the browser did not say. */
  relatedTargetInside: boolean | null;
  /** One frame later: is `document.activeElement` inside the region? */
  activeElementInside: boolean;
  /** Did a `pointerdown` begin inside the region in that frame? */
  pointerDownInside: boolean;
};

/**
 * Whether a field losing focus should cancel the session. Safari does not focus a button when
 * it is pressed, so `focusout` can arrive with a `null` target before the click on Done lands;
 * cancelling then would throw away what was typed. A known target decides at once. A `null`
 * one cancels only when focus really is outside and no press began inside.
 */
export function shouldCancelOnFocusLeave(input: FocusLeaveInput): boolean {
  if (input.relatedTargetInside !== null) return !input.relatedTargetInside;
  return !input.activeElementInside && !input.pointerDownInside;
}

/** The answer for an event that changes nothing: the very same state, so nothing re-renders. */
function stay(state: EditState): EditResult {
  return { state };
}

/** Back to idle, with a commit only when something actually changed. */
function finish(commit: Partial<Fundraiser>): EditResult {
  return Object.keys(commit).length === 0 ? { state: IDLE_STATE } : { state: IDLE_STATE, commit };
}

/** Amount drafts start as the display text they replace (`$6,500`), so nothing seems to move. */
function openAmounts(current: Fundraiser, sticky: boolean): EditState {
  return {
    kind: "amounts",
    raised: formatDollars(current.raisedCents),
    goal: formatDollars(current.goalCents),
    sticky,
    refusals: {},
  };
}

/** The headline draft starts as the current headline. */
function openHeadline(current: Fundraiser): EditState {
  return { kind: "headline", text: current.headline };
}

type AmountsState = Extract<EditState, { kind: "amounts" }>;
type HeadlineState = Extract<EditState, { kind: "headline" }>;

/** Builds refusals without keys for the fields that are fine. */
function refusalsOf(raised?: RaisedReason, goal?: GoalReason): AmountRefusals {
  return {
    ...(raised === undefined ? {} : { raised }),
    ...(goal === undefined ? {} : { goal }),
  };
}

/** The refusals without `field`'s, or the same object when it had none. */
function withoutRefusal(refusals: AmountRefusals, field: "raised" | "goal"): AmountRefusals {
  if (refusals[field] === undefined) return refusals;
  return refusalsOf(
    field === "raised" ? undefined : refusals.raised,
    field === "goal" ? undefined : refusals.goal,
  );
}

/** Whether two refusal sets say the same thing. */
function sameRefusals(a: AmountRefusals, b: AmountRefusals): boolean {
  return a.raised === b.raised && a.goal === b.goal;
}

/**
 * A keystroke in an amount field: that draft changes, the session turns sticky, and only that
 * field's refusal goes. A headline keystroke is not for this session.
 */
function typeIntoAmounts(state: AmountsState, field: EditField, text: string): EditResult {
  if (field === "headline") return stay(state);
  const refusals = withoutRefusal(state.refusals, field);
  if (state[field] === text && state.sticky && refusals === state.refusals) return stay(state);
  return stay({ ...state, [field]: text, sticky: true, refusals });
}

/**
 * Checks both drafts together. Any refusal blocks the whole commit and the display keeps its
 * old values (SC-008); every field's code is recorded so each can be shown. When both pass,
 * the commit holds only the fields whose value differs from the current ones.
 */
function confirmAmounts(state: AmountsState, current: Fundraiser): EditResult {
  const raised = validateRaised(state.raised);
  const goal = validateGoal(state.goal);
  if (!raised.ok || !goal.ok) {
    const refusals = refusalsOf(
      raised.ok ? undefined : raised.error,
      goal.ok ? undefined : goal.error,
    );
    return stay(sameRefusals(refusals, state.refusals) ? state : { ...state, refusals });
  }
  return finish({
    ...(raised.value === current.raisedCents ? {} : { raisedCents: raised.value }),
    ...(goal.value === current.goalCents ? {} : { goalCents: goal.value }),
  });
}

/** Checks the headline draft: it refuses an empty or over-long one and never cuts it. */
function confirmHeadline(state: HeadlineState, current: Fundraiser): EditResult {
  const checked = validateHeadline(state.text);
  if (!checked.ok) {
    return stay(state.refusal === checked.error ? state : { ...state, refusal: checked.error });
  }
  return finish(checked.value === current.headline ? {} : { headline: checked.value });
}

/** Nothing is open: only a hover or an explicit open starts a session. */
function fromIdle(state: EditState, event: EditEvent, current: Fundraiser): EditResult {
  switch (event.type) {
    case "hover-enter":
      return stay(openAmounts(current, false));
    case "open-amounts":
      return stay(openAmounts(current, true));
    case "open-headline":
      return stay(openHeadline(current));
    default:
      return stay(state);
  }
}

/** The amounts are open. Opening the headline throws their drafts away. */
function fromAmounts(state: AmountsState, event: EditEvent, current: Fundraiser): EditResult {
  switch (event.type) {
    case "hover-leave":
      return stay(state.sticky ? state : IDLE_STATE);
    case "open-amounts":
    case "field-focus":
      return stay(state.sticky ? state : { ...state, sticky: true });
    case "open-headline":
      return stay(openHeadline(current));
    case "input":
      return typeIntoAmounts(state, event.field, event.text);
    case "confirm":
      return confirmAmounts(state, current);
    default:
      return stay(state);
  }
}

/**
 * The headline is open. A hover pass-by must not steal the edit, so `hover-enter` is ignored;
 * opening the amounts throws the draft away.
 */
function fromHeadline(state: HeadlineState, event: EditEvent, current: Fundraiser): EditResult {
  switch (event.type) {
    case "open-amounts":
      return stay(openAmounts(current, true));
    case "input":
      if (event.field !== "headline") return stay(state);
      return stay(
        state.text === event.text && state.refusal === undefined
          ? state
          : { kind: "headline", text: event.text },
      );
    case "confirm":
      return confirmHeadline(state, current);
    default:
      return stay(state);
  }
}

/**
 * The whole table of contracts/editing-interaction.md. `cancel` goes idle from anywhere and
 * drops the drafts; every other event is answered by the handler for the current state. An
 * event that changes nothing returns the same state object it was given.
 */
export function editSession(state: EditState, event: EditEvent, current: Fundraiser): EditResult {
  if (event.type === "cancel") return stay(state.kind === "idle" ? state : IDLE_STATE);
  switch (state.kind) {
    case "idle":
      return fromIdle(state, event, current);
    case "amounts":
      return fromAmounts(state, event, current);
    case "headline":
      return fromHeadline(state, event, current);
  }
}
