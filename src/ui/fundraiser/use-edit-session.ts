"use client";
import { createRef, useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, RefObject } from "react";
import {
  GRACE_MS,
  IDLE_MS,
  IDLE_STATE,
  editSession,
  shouldCancelOnFocusLeave,
  type EditEvent,
  type EditField,
  type EditResult,
  type EditState,
} from "@/core/fundraiser/edit-session";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";

// The hook is a translator: it turns DOM events into the events of `editSession` and runs the
// timers the contract names. Every decision (what a hover, a confirm or a refusal means, and
// whether a focus leave cancels) is made in `src/core/fundraiser/edit-session.ts`. What lives
// here is only what needs a DOM or a clock: which element an event came from, when a timer
// fires, and where focus goes after a keyboard close.

/** Elements the pointer enters to open the amounts: the thermometer and the amount block. */
const FIGURES = "[data-figures]";
/** The headline, while it is being edited. */
const HEADLINE = "[data-headline]";
/** The reserved row under the goal line that holds Done and the refusal sentence. */
const EDIT_ROW = "[data-edit-row]";

/** The part of the page a session in this state owns; focus or a press outside it cancels. */
function regionSelector(state: EditState): string | null {
  switch (state.kind) {
    case "amounts":
      return `${FIGURES}, ${EDIT_ROW}`;
    case "headline":
      return `${HEADLINE}, ${EDIT_ROW}`;
    case "idle":
      return null;
  }
}

/** Whether `node` is inside the region the open session owns. False when nothing is open. */
function insideRegion(node: EventTarget | null, state: EditState): boolean {
  const selector = regionSelector(state);
  return selector !== null && node instanceof Element && node.closest(selector) !== null;
}

/** Events that open or preview a session: the ones `enabled === false` must swallow (FR-012). */
function isOpening(event: EditEvent): boolean {
  return (
    event.type === "hover-enter" || event.type === "open-amounts" || event.type === "open-headline"
  );
}

/** An input method's keystroke: Safari reports the key that ends a composition as keyCode 229. */
const IME_KEY_CODE = 229;

type TimerKey = "idle" | "grace" | "focus" | "press" | "closed";

/** A few named timeouts and animation frames, each cancelled by name or all at once. */
interface Timers {
  /** Runs `run` after `ms`, replacing any timer already holding `key`. */
  after(key: TimerKey, ms: number, run: () => void): void;
  /** Runs `run` on the next animation frame, replacing any frame already holding `key`. */
  frame(key: TimerKey, run: () => void): void;
  clear(key: TimerKey): void;
  clearAll(): void;
}

function createTimers(): Timers {
  const pending = new Map<TimerKey, () => void>();
  const clear = (key: TimerKey): void => {
    pending.get(key)?.();
    pending.delete(key);
  };
  const hold = (key: TimerKey, cancel: () => void): void => {
    clear(key);
    pending.set(key, cancel);
  };
  return {
    after(key, ms, run) {
      const id = setTimeout(() => {
        pending.delete(key);
        run();
      }, ms);
      hold(key, () => clearTimeout(id));
    },
    frame(key, run) {
      const id = requestAnimationFrame(() => {
        pending.delete(key);
        run();
      });
      hold(key, () => cancelAnimationFrame(id));
    },
    clear,
    clearAll() {
      for (const cancel of pending.values()) cancel();
      pending.clear();
    },
  };
}

/** Timers that live as long as the component and are all stopped when it unmounts. */
function useTimers(): Timers {
  const [timers] = useState(createTimers);
  useEffect(() => () => timers.clearAll(), [timers]);
  return timers;
}

/** The newest value, readable from handlers and timers without re-subscribing them. */
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/** What every piece of the hook shares: the live state, the one way to change it, the clock. */
interface Core {
  stateRef: RefObject<EditState>;
  /**
   * Set when a session closes by anything but the pointer leaving, cleared by a real pointer move.
   * Taking the fields out of the page makes the browser send `pointerover` again under a mouse
   * that has not moved; that is not a hover, so hover-enter is ignored while this is set.
   */
  hoverBlocked: RefObject<boolean>;
  dispatch(event: EditEvent): EditResult;
  timers: Timers;
}

/**
 * Holds the state and runs `editSession`. The state is also kept in a ref so that two events in
 * one tick see each other's result. A commit goes to the caller from here, once per confirm.
 * While `enabled` is false every opening event is dropped (FR-012), and the `true → false` edge
 * cancels with reason `fullscreen`.
 */
function useSessionCore(
  current: Fundraiser,
  onCommit: (changes: Partial<Fundraiser>) => void,
  enabled: boolean,
  timers: Timers,
): Core & { state: EditState } {
  const [state, setState] = useState<EditState>(IDLE_STATE);
  const stateRef = useRef<EditState>(IDLE_STATE);
  const hoverBlocked = useRef(false);
  const currentRef = useLatest(current);
  const commitRef = useLatest(onCommit);
  const enabledRef = useLatest(enabled);
  const dispatch = useCallback(
    (event: EditEvent): EditResult => {
      if (!enabledRef.current && isOpening(event)) return { state: stateRef.current };
      const result = editSession(stateRef.current, event, currentRef.current);
      if (stateRef.current.kind !== "idle" && result.state.kind === "idle") {
        hoverBlocked.current = event.type !== "hover-leave";
      }
      if (result.state !== stateRef.current) {
        stateRef.current = result.state;
        setState(result.state);
      }
      if (result.commit) commitRef.current(result.commit);
      return result;
    },
    [enabledRef, currentRef, commitRef],
  );
  useEffect(() => {
    if (enabled) return;
    dispatch({ type: "cancel", reason: "fullscreen" });
  }, [enabled, dispatch]);
  return { state: enabled ? state : IDLE_STATE, stateRef, hoverBlocked, dispatch, timers };
}

/**
 * The idle clock: 60 s after the last thing that changed the session, and cleared when it
 * closes. A state change (a keystroke, an open) restarts it; the returned function restarts it
 * for the inputs that change no state (a focus change, a pointer move over the region).
 * `expire` is what runs when the minute is up.
 */
function useIdleClock(state: EditState, core: Core, expire: () => void): () => void {
  const { timers, stateRef } = core;
  const open = state.kind !== "idle";
  useEffect(() => {
    if (!open) {
      timers.clear("idle");
      timers.clear("grace");
      timers.clear("focus");
      return;
    }
    timers.after("idle", IDLE_MS, expire);
  }, [state, open, timers, expire]);
  return useCallback(() => {
    if (stateRef.current.kind === "idle") return;
    timers.after("idle", IDLE_MS, expire);
  }, [timers, stateRef, expire]);
}

/**
 * What the idle minute does: cancels the session; if focus was inside it, sends focus back to
 * the control that opened it (the Escape path, so the "just closed" flag stops a reopen); and
 * tells `onIdleClose` unless it was only a hover preview, which has nothing typed to lose.
 */
function useExpire(
  core: Core,
  openers: Openers,
  returnFocus: (button: HTMLButtonElement | null) => void,
  onIdleClose: RefObject<(() => void) | undefined>,
): () => void {
  const { dispatch, stateRef } = core;
  return useCallback((): void => {
    const was = stateRef.current;
    if (was.kind === "idle") return;
    const focusInside = insideRegion(document.activeElement, was);
    dispatch({ type: "cancel", reason: "idle" });
    if (focusInside) returnFocus(openerOf(openers, was.kind));
    if (was.kind === "headline" || was.sticky) onIdleClose.current?.();
  }, [dispatch, stateRef, openers, returnFocus, onIdleClose]);
}

/**
 * While a session is open, watches every press on the page. A press outside the region cancels;
 * a press inside is remembered for one frame, which is how the focus-leave check knows that
 * Done is being pressed (Safari moves focus off the field before the click lands).
 */
function useOutsidePress(open: boolean, core: Core): RefObject<boolean> {
  const { dispatch, timers, stateRef } = core;
  const pressInside = useRef(false);
  useEffect(() => {
    if (!open) return;
    const onPress = (event: Event): void => {
      if (!insideRegion(event.target, stateRef.current)) {
        dispatch({ type: "cancel", reason: "outside" });
        return;
      }
      pressInside.current = true;
      timers.frame("press", () => {
        pressInside.current = false;
      });
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      timers.clear("press");
      pressInside.current = false;
    };
  }, [open, dispatch, timers, stateRef]);
  return pressInside;
}

/**
 * While a session is open, Escape cancels it wherever focus is (the contract's table does not
 * limit the target: a hover preview may be open with focus on the page). The listener is on the
 * document, in the bubbling phase, so a field that handled its own Escape (it calls
 * `preventDefault`) has already run and is skipped. An Escape that belongs to an input method
 * (composing, or keyCode 229) is left alone, as `InPlaceField` leaves it, so it cannot drop a draft.
 */
function useEscapeKey(open: boolean, escape: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.isComposing || event.keyCode === IME_KEY_CODE) return;
      escape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, escape]);
}

/** The part of the return value that sends a mouse or pen over the figures into events. */
interface PointerHandlers {
  onPointerOver(event: PointerEvent<HTMLElement>): void;
  onPointerOut(event: PointerEvent<HTMLElement>): void;
  onPointerMove(event: PointerEvent<HTMLElement>): void;
}

/**
 * Hover. Mouse and pen only: a touch tap fires enter, up and leave before its click, which would
 * flash the session open and shut. Leaving starts the 300 ms grace timer; re-entering either
 * figures element cancels it, so the pointer can cross the gap between them.
 */
function pointerHandlers(core: Core, restartIdle: () => void): PointerHandlers {
  const { dispatch, timers, stateRef, hoverBlocked } = core;
  const onFigures = (event: PointerEvent<HTMLElement>): boolean =>
    event.pointerType !== "touch" &&
    event.target instanceof Element &&
    event.target.closest(FIGURES) !== null;
  return {
    onPointerOver(event) {
      if (!onFigures(event)) return;
      timers.clear("grace");
      if (hoverBlocked.current) return;
      dispatch({ type: "hover-enter" });
    },
    onPointerOut(event) {
      if (!onFigures(event) || stateRef.current.kind === "idle") return;
      timers.after("grace", GRACE_MS, () => dispatch({ type: "hover-leave" }));
    },
    onPointerMove(event) {
      if (event.pointerType !== "touch") hoverBlocked.current = false;
      if (insideRegion(event.target, stateRef.current)) restartIdle();
    },
  };
}

/** Whether a node is an editable text control: the only things that count as "a field". */
function isField(node: EventTarget | null): boolean {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

/** The part of the return value that watches focus and keys on the whole stage. */
interface FocusHandlers {
  onFocus(event: FocusEvent<HTMLElement>): void;
  onBlur(event: FocusEvent<HTMLElement>): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
}

/**
 * Focus leaving the region cancels, safely. A `relatedTarget` says where focus went and decides
 * at once. A null one (Safari, before a click on Done lands) is decided one frame later from
 * where focus really is and whether a press began inside, by `shouldCancelOnFocusLeave`.
 */
function focusLeaveHandler(core: Core, pressInside: RefObject<boolean>): FocusHandlers["onBlur"] {
  const { dispatch, timers, stateRef } = core;
  return (event) => {
    const state = stateRef.current;
    if (!insideRegion(event.target, state)) return;
    const next = event.relatedTarget;
    const pressedBefore = pressInside.current;
    const decide = (relatedTargetInside: boolean | null): void => {
      const cancel = shouldCancelOnFocusLeave({
        relatedTargetInside,
        activeElementInside: insideRegion(document.activeElement, stateRef.current),
        pointerDownInside: pressedBefore || pressInside.current,
      });
      if (cancel) dispatch({ type: "cancel", reason: "focus-leave" });
    };
    if (next === null) timers.frame("focus", () => decide(null));
    else decide(insideRegion(next, state));
  };
}

/**
 * Focus and keys on the stage: a field taking focus makes the session sticky, and any focus or
 * key inside the region restarts the idle clock. Escape is not handled here: it is listened for
 * on the document (`useEscapeKey`), because it cancels wherever focus is.
 */
function focusHandlers(
  core: Core,
  restartIdle: () => void,
  pressInside: RefObject<boolean>,
): FocusHandlers {
  const { dispatch, stateRef } = core;
  const onBlur = focusLeaveHandler(core, pressInside);
  return {
    onBlur,
    onFocus(event) {
      if (!insideRegion(event.target, stateRef.current)) return;
      if (isField(event.target)) dispatch({ type: "field-focus" });
      restartIdle();
    },
    onKeyDown(event) {
      if (!insideRegion(event.target, stateRef.current)) return;
      restartIdle();
    },
  };
}

/** Which control opened a session, so a keyboard close can send focus back to it. */
interface Openers {
  amounts: RefObject<HTMLButtonElement | null>;
  headline: RefObject<HTMLButtonElement | null>;
}

/**
 * Returns focus to `button` after a keyboard close, without reopening. Focusing the amounts
 * button opens the session, so the "just closed" flag swallows that one focus event. It is armed
 * only when focus actually has to move: if the button already holds focus, `focus()` fires
 * nothing and a flag left armed would swallow the next real Tab-in. It clears on the next frame.
 * One flag serves both openers: a headline close arms it too, but only the thermometer button
 * reads it, and it is gone within a frame, so it can swallow nothing else.
 */
function useReturnFocus(timers: Timers): {
  justClosed: RefObject<boolean>;
  returnFocus(button: HTMLButtonElement | null): void;
} {
  const justClosed = useRef(false);
  const returnFocus = useCallback(
    (button: HTMLButtonElement | null): void => {
      if (!button || document.activeElement === button) return;
      justClosed.current = true;
      timers.frame("closed", () => {
        justClosed.current = false;
      });
      button.focus();
    },
    [timers],
  );
  return { justClosed, returnFocus };
}

/** The control a session was opened from: the headline's button, else the thermometer's. */
function openerOf(openers: Openers, kind: EditState["kind"]): HTMLButtonElement | null {
  return kind === "headline" ? openers.headline.current : openers.amounts.current;
}

/** What the Escape, Enter and Done paths share: close, and send focus back when by keyboard. */
function useClose(
  core: Core,
  openers: Openers,
  returnFocus: (button: HTMLButtonElement | null) => void,
): { escape: () => void; confirm: (byKeyboard: boolean) => void } {
  const { dispatch, stateRef } = core;
  const escape = useCallback((): void => {
    const was = stateRef.current.kind;
    dispatch({ type: "cancel", reason: "escape" });
    if (was !== "idle") returnFocus(openerOf(openers, was));
  }, [dispatch, stateRef, openers, returnFocus]);
  const confirm = useCallback(
    (byKeyboard: boolean): void => {
      const was = stateRef.current.kind;
      const { state } = dispatch({ type: "confirm" });
      if (byKeyboard && was !== "idle" && state.kind === "idle") {
        returnFocus(openerOf(openers, was));
      }
    },
    [dispatch, stateRef, openers, returnFocus],
  );
  return { escape, confirm };
}

/** Props for a control that opens a session: spread them on the button. */
export interface OpenerProps {
  ref: RefObject<HTMLButtonElement | null>;
  onClick(): void;
  onFocus?(): void;
}

/** Props for the Done button. */
export interface DoneProps {
  /** Keeps the press from moving focus off the field, so the typed text is never lost first. */
  onPointerDown(event: PointerEvent<HTMLButtonElement>): void;
  onMouseDown(event: MouseEvent<HTMLButtonElement>): void;
  /** Confirms. A click with `detail === 0` came from the keyboard, and focus goes back to the opener. */
  onClick(event: MouseEvent<HTMLButtonElement>): void;
}

/** What `useEditSession` returns. */
export interface EditSession {
  /** Where the session is. Always idle while `enabled` is false. */
  state: EditState;
  /**
   * Spread on the one element that holds every region (the stage). It listens to bubbling
   * pointer, focus and key events and finds the region with `closest`, so the thermometer and
   * the amounts, which sit in different columns, need no common wrapper of their own.
   */
  stage: PointerHandlers & FocusHandlers;
  /** Spread on the thermometer button; focusing or clicking it opens the amounts, sticky. */
  amountsButton: OpenerProps & { onFocus(): void };
  /** Spread on the headline button; clicking it (Enter and Space click) opens the headline. */
  headlineButton: OpenerProps;
  /** Spread on the Done button, which lives inside the `[data-edit-row]` element. */
  done: DoneProps;
  /** The three callbacks of every `InPlaceField`: `onChange` takes the field it belongs to. */
  field: {
    onChange(field: EditField, text: string): void;
    onConfirm(): void;
    onCancel(): void;
  };
}

/**
 * Editing in place: the state machine of `editSession`, driven by DOM events and two timers.
 * Mark the DOM as the contract says: `data-figures` on the thermometer (and its button) and on
 * the amount block, `data-headline` on the headline field's box, `data-edit-row` on the row that
 * holds Done. `enabled` is false in full screen: openings and hovers are ignored, and an open
 * session is cancelled with every timer when it turns false (FR-012). A confirm hands the
 * changed fields to `onCommit`; the caller applies them and writes the address. `onIdleClose`
 * is told when the idle minute closes a session that could hold a draft, so the caller can say so.
 */
export function useEditSession(
  current: Fundraiser,
  onCommit: (changes: Partial<Fundraiser>) => void,
  enabled: boolean,
  onIdleClose?: () => void,
): EditSession {
  const timers = useTimers();
  const core = { ...useSessionCore(current, onCommit, enabled, timers) };
  const { state, dispatch } = core;
  const [openers] = useState<Openers>(() => ({
    amounts: createRef<HTMLButtonElement>(),
    headline: createRef<HTMLButtonElement>(),
  }));
  const { justClosed, returnFocus } = useReturnFocus(timers);
  const idleCloseRef = useLatest(onIdleClose);
  const expire = useExpire(core, openers, returnFocus, idleCloseRef);
  const restartIdle = useIdleClock(state, core, expire);
  const pressInside = useOutsidePress(state.kind !== "idle", core);
  const { escape, confirm } = useClose(core, openers, returnFocus);
  useEscapeKey(state.kind !== "idle", escape);
  const pointer = pointerHandlers(core, restartIdle);
  const focus = focusHandlers(core, restartIdle, pressInside);
  const openAmounts = (): void => void dispatch({ type: "open-amounts" });
  const onConfirm = useCallback(() => confirm(true), [confirm]);
  return {
    state,
    stage: { ...pointer, ...focus },
    amountsButton: {
      ref: openers.amounts,
      onClick: openAmounts,
      onFocus: () => {
        if (!justClosed.current) openAmounts();
      },
    },
    headlineButton: {
      ref: openers.headline,
      onClick: () => void dispatch({ type: "open-headline" }),
    },
    done: {
      onPointerDown: (event) => event.preventDefault(),
      onMouseDown: (event) => event.preventDefault(),
      onClick: (event) => confirm(event.detail === 0),
    },
    field: {
      onChange: (field, text) => void dispatch({ type: "input", field, text }),
      onConfirm,
      onCancel: escape,
    },
  };
}
