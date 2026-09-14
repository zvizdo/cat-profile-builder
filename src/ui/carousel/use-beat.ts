"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  advance,
  anchorForStep,
  applyRoster,
  createBeatState,
  manualNav,
  togglePause,
  type BeatState,
  type Turn,
} from "@/core/carousel/beat";

// The beat clock (ADR-009; FR-062, FR-063, FR-069): a timer at the hold that hands every
// step decision to beat.ts, plus the three things CSS cannot decide for itself — whether
// the clock is running, whether the pointer rests on the frame, and whether a fresh beat is
// still playing its entrance. Pausing keeps the beat's remaining time, so resuming picks
// the animations up where they froze instead of restarting or overrunning them.

/**
 * How far into the hold a beat's entrance is over (the last arrival, the third thumbnail,
 * settles at 26 %). A beat opened by a manual move plays this far before it freezes, so a
 * paused carousel never shows a cat still clipped away.
 */
export const ENTRANCE_FRACTION = 0.3;

/**
 * How long the pointer has to stay still over the frame before the loop resumes
 * (server-boundary.md's kiosk rule): a pointer moving over the frame is someone looking,
 * a parked one is not.
 */
export const HOVER_IDLE_MS = 3000;

export interface UseBeatOptions {
  roster: readonly Turn[];
  /** The hold in seconds (FR-089), already clamped by `parseHold`. */
  hold: number;
  /** `prefers-reduced-motion: reduce` — no clock, no entrance timer, arrows still page. */
  reducedMotion: boolean;
  /**
   * Called just before every step, automatic or manual, while the old beat still stands.
   * May hand back a fresh roster (the kiosk's five-minute poll, FR-066): the step is then
   * taken from that roster, anchored on the cat on show through `applyRoster`, so a swap
   * lands exactly at the boundary and never repeats or skips a cat.
   */
  onBeforeStep?: () => readonly Turn[] | undefined;
}

/** What the carousel reads: the beat, the two flags the stylesheet keys on, and the moves. */
export interface Beat {
  state: BeatState;
  /** Auto-advance is off: Space, a manual move, or the pointer moving over the frame. */
  paused: boolean;
  /** The pointer moved over the frame within the last `HOVER_IDLE_MS`; never under reduced motion. */
  hovered: boolean;
  /** Every animation and the clip stand still — paused, and past the entrance. */
  frozen: boolean;
  next(): void;
  prev(): void;
  togglePause(): void;
  pointerMove(): void;
  pointerLeave(): void;
}

interface Clock {
  state: BeatState;
  hovered: boolean;
  entering: boolean;
  /** Counts beats, so the timer effect can tell a new beat from a pause or a resume. */
  beatKey: number;
}

/** A step or a swap names the roster it is taken from and the one the beat stood on. */
interface Rosters {
  roster: readonly Turn[];
  previous: readonly Turn[];
}

type Action =
  | ({ type: "advance" } & Rosters)
  | ({ type: "nav"; direction: "next" | "prev" } & Rosters)
  | { type: "toggle" }
  | { type: "hover"; hovered: boolean }
  | { type: "entered" }
  | ({ type: "roster" } & Rosters);

/** The beat on `rosters.roster` between beats, anchored on the cat it shows. */
function swapped(state: BeatState, { roster, previous }: Rosters): BeatState {
  return roster === previous ? state : applyRoster(state, roster, previous[state.index]);
}

/** Where a step starts on `rosters.roster`: the cat on show, or the one before it that is left. */
function stepFrom(state: BeatState, { roster, previous }: Rosters): BeatState {
  return roster === previous ? state : anchorForStep(state, previous, roster);
}

function reduce(clock: Clock, action: Action): Clock {
  switch (action.type) {
    case "advance":
      return {
        ...clock,
        state: advance(stepFrom(clock.state, action), action.roster),
        entering: false,
        beatKey: clock.beatKey + 1,
      };
    case "nav":
      return {
        ...clock,
        state: manualNav(stepFrom(clock.state, action), action.roster, action.direction),
        entering: true,
        beatKey: clock.beatKey + 1,
      };
    case "toggle":
      return { ...clock, state: togglePause(clock.state) };
    case "hover":
      return clock.hovered === action.hovered ? clock : { ...clock, hovered: action.hovered };
    case "entered":
      return clock.entering ? { ...clock, entering: false } : clock;
    case "roster": {
      const state = swapped(clock.state, action);
      return state === clock.state ? clock : { ...clock, state };
    }
  }
}

// The first beat is entering too: a pause during its arrival waits for the arrival.
const INITIAL: Clock = {
  state: createBeatState(),
  hovered: false,
  entering: true,
  beatKey: 0,
};

/** Space on a button or a field is that control's own activation, not the carousel's. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("button, input, select, textarea") !== null
  );
}

interface ClockOptions {
  beatKey: number;
  running: boolean;
  entering: boolean;
  holdMs: number;
  onAdvance(): void;
  onEntered(): void;
}

// The timer: milliseconds of the current beat already spent are kept across pauses, and
// the beat key tells a new beat (elapsed starts over) from a resume (elapsed carries on).
function useClock({ beatKey, running, entering, holdMs, onAdvance, onEntered }: ClockOptions) {
  const elapsed = useRef(0);
  const lastBeatKey = useRef(beatKey);
  const handlers = useRef({ onAdvance, onEntered });
  useEffect(() => {
    handlers.current = { onAdvance, onEntered };
  }, [onAdvance, onEntered]);
  useEffect(() => {
    if (beatKey !== lastBeatKey.current) {
      elapsed.current = 0;
      lastBeatKey.current = beatKey;
    }
    if (!running && !entering) return;
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fire: () => void): void => {
      timers.push(setTimeout(fire, Math.max(0, ms - elapsed.current)));
    };
    if (running) after(holdMs, () => handlers.current.onAdvance());
    if (entering) after(holdMs * ENTRANCE_FRACTION, () => handlers.current.onEntered());
    return () => {
      for (const timer of timers) clearTimeout(timer);
      elapsed.current += Date.now() - startedAt;
    };
  }, [beatKey, running, entering, holdMs]);
}

// The keys, from anywhere on the page: arrows page, Space toggles pause. A held arrow's
// repeats are one press, and an arrow with a modifier is the browser's (back, forward).
function useKeys(nav: (direction: "next" | "prev") => void, toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowRight") nav("next");
      else if (event.key === "ArrowLeft") nav("prev");
      else if (event.key === " " && !isControl(event.target)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav, toggle]);
}

// The pointer: movement over the frame — or a press, so a tap counts on a touch screen —
// pauses, `HOVER_IDLE_MS` of stillness resumes, leaving resumes at once. Under reduced
// motion there is nothing to pause, so no timer.
function usePointer(
  dispatch: (action: Action) => void,
  reducedMotion: boolean,
): Pick<Beat, "pointerMove" | "pointerLeave"> {
  const still = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (still.current !== null) clearTimeout(still.current);
    still.current = null;
  }, []);
  useEffect(() => clear, [clear]);
  return {
    pointerMove: useCallback(() => {
      if (reducedMotion) return;
      dispatch({ type: "hover", hovered: true });
      clear();
      still.current = setTimeout(() => {
        still.current = null;
        dispatch({ type: "hover", hovered: false });
      }, HOVER_IDLE_MS);
    }, [dispatch, reducedMotion, clear]),
    pointerLeave: useCallback(() => {
      clear();
      dispatch({ type: "hover", hovered: false });
    }, [dispatch, clear]),
  };
}

/**
 * Drives one beat at a time: advances once per `hold` while running, pauses on Space, a
 * manual move or a pointer moving over the frame, resumes with the beat's remaining time,
 * and under reduced motion installs no timer at all. Arrow keys page in every mode.
 */
export function useBeat({ roster, hold, reducedMotion, onBeforeStep }: UseBeatOptions): Beat {
  const [clock, dispatch] = useReducer(reduce, INITIAL);
  const refs = useRef({ roster, onBeforeStep });
  useEffect(() => {
    refs.current.onBeforeStep = onBeforeStep;
  }, [onBeforeStep]);
  // A roster that changes between beats swaps in at once, anchored on the cat on show; one
  // a step already took (handed back by onBeforeStep) is the same array and needs nothing.
  useEffect(() => {
    const previous = refs.current.roster;
    if (roster === previous) return;
    refs.current.roster = roster;
    dispatch({ type: "roster", roster, previous });
  }, [roster]);
  // The step's roster: what onBeforeStep hands back, else the one the beat stands on.
  const rosters = useCallback((): Rosters => {
    const previous = refs.current.roster;
    const fresh = refs.current.onBeforeStep?.();
    if (fresh !== undefined) refs.current.roster = fresh;
    return { roster: fresh ?? previous, previous };
  }, []);

  const paused = clock.state.paused || clock.hovered;
  const entering = clock.entering && !reducedMotion && roster.length > 0;
  const nav = useCallback(
    (direction: "next" | "prev") => dispatch({ type: "nav", direction, ...rosters() }),
    [rosters],
  );
  const toggle = useCallback(() => dispatch({ type: "toggle" }), []);
  useClock({
    beatKey: clock.beatKey,
    running: !paused && !reducedMotion && roster.length > 0,
    entering,
    holdMs: hold * 1000,
    onAdvance: useCallback(() => dispatch({ type: "advance", ...rosters() }), [rosters]),
    onEntered: useCallback(() => dispatch({ type: "entered" }), []),
  });
  useKeys(nav, toggle);
  const pointer = usePointer(dispatch, reducedMotion);

  return {
    state: clock.state,
    paused,
    hovered: clock.hovered,
    frozen: paused && !entering,
    next: () => nav("next"),
    prev: () => nav("prev"),
    togglePause: toggle,
    ...pointer,
  };
}
