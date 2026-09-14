// The carousel's beat — one step of automatic advance or manual navigation (FR-062,
// FR-063, FR-084) — as pure state transitions. The hook that owns the interval timer calls
// these at a beat boundary; nothing here touches a clock, a timer or the DOM.

/**
 * Where a beat is: `index` into the roster, `loopIndex` counting full passes (so
 * `pickMedia` can show the next photo each time round), `parity` alternating `"a"`/`"b"`
 * every beat (for a crossfade that always fades between two different layers) and
 * `paused`, set by a manual move and cleared elsewhere.
 */
export interface BeatState {
  index: number;
  loopIndex: number;
  parity: "a" | "b";
  paused: boolean;
}

/** The starting beat: the first cat, loop zero, playing. */
export function createBeatState(): BeatState {
  return { index: 0, loopIndex: 0, parity: "a", paused: false };
}

/** `state.parity`'s other value. */
function flip(parity: BeatState["parity"]): BeatState["parity"] {
  return parity === "a" ? "b" : "a";
}

/**
 * One automatic step (FR-062, FR-084): the next cat in the roster, wrapping to the first
 * and incrementing `loopIndex` when it does, with `parity` flipped and `paused` untouched.
 * Called only while playing — a paused carousel does not advance.
 */
export function advance(state: BeatState, roster: readonly unknown[]): BeatState {
  const index = (state.index + 1) % roster.length;
  return {
    index,
    loopIndex: index === 0 ? state.loopIndex + 1 : state.loopIndex,
    parity: flip(state.parity),
    paused: state.paused,
  };
}

/**
 * A pointer or keyboard move (FR-063): one cat forward or back, wrapping at either end.
 * Wrapping forward (past the last cat, back to the first) counts as a new pass and bumps
 * `loopIndex`, the same as an automatic advance; wrapping backward (before the first, to
 * the last) does not — `loopIndex` never decrements. Always sets `paused: true`, since a
 * volunteer who just chose a cat is not asking the carousel to keep moving on its own.
 */
export function manualNav(
  state: BeatState,
  roster: readonly unknown[],
  direction: "next" | "prev",
): BeatState {
  const length = roster.length;
  const raw = state.index + (direction === "next" ? 1 : -1);
  const index = ((raw % length) + length) % length;
  return {
    index,
    loopIndex: raw >= length ? state.loopIndex + 1 : state.loopIndex,
    parity: flip(state.parity),
    paused: true,
  };
}

/** Pause/resume, leaving every other field untouched. */
export function togglePause(state: BeatState): BeatState {
  return { ...state, paused: !state.paused };
}

/** What the beat needs of a roster entry: its identity, so a swap can follow the cat. */
export interface Turn {
  url: string;
}

/** `turn`'s position in `roster`, or `-1` for none or for no turn at all. */
function positionOf(roster: readonly Turn[], turn: Turn | undefined): number {
  return turn === undefined ? -1 : roster.findIndex((entry) => entry.url === turn.url);
}

/**
 * Swaps in a freshly-fetched roster between beats (the five-minute kiosk poll, FR-066)
 * anchored on the cat on show: `index` becomes `current`'s position in `next`, so a
 * publish before it or an unpublish before it moves the index with the cat. When
 * `current` is gone from `next`, or nothing was on show, `index` is clamped to the new
 * roster's last position — `0` for a roster that is now empty — so the beat never points
 * past the end; nothing steps here, so a valid index is all that matters. Everything
 * else is unchanged. A swap at a boundary goes through {@link anchorForStep} instead.
 */
export function applyRoster(
  state: BeatState,
  next: readonly Turn[],
  current: Turn | undefined,
): BeatState {
  const found = positionOf(next, current);
  const index = found >= 0 ? found : Math.min(state.index, Math.max(0, next.length - 1));
  return index === state.index ? state : { ...state, index };
}

/**
 * Where a boundary step starts once `previous` has become `next`: the cat on show, at its
 * position in `next` — so the step that follows neither repeats the cat just shown nor
 * skips the one after it. When the cat on show is itself gone (it was the one
 * unpublished — likeliest of all, it just got adopted off the TV), the anchor is its
 * nearest predecessor in `previous` that is still in `next`, so the step lands on the cat
 * that followed it; with no predecessor left, `-1` — before the start — so the step lands
 * on the first cat. The result is only ever fed to `advance` or `manualNav`.
 */
export function anchorForStep(
  state: BeatState,
  previous: readonly Turn[],
  next: readonly Turn[],
): BeatState {
  let index = -1;
  for (let at = state.index; at >= 0 && index < 0; at--) {
    index = positionOf(next, previous[at]);
  }
  return index === state.index ? state : { ...state, index };
}
