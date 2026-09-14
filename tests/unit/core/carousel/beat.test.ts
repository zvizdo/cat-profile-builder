import { describe, expect, it } from "vitest";
import {
  advance,
  applyRoster,
  createBeatState,
  manualNav,
  anchorForStep,
  togglePause,
  type BeatState,
} from "@/core/carousel/beat";

// The beat's pure transitions (FR-062, FR-063, FR-084): wrap-and-count, parity alternation,
// pause on a manual move, and clamping the index when the roster itself changes.

const ROSTER_3 = [1, 2, 3];

describe("createBeatState", () => {
  it("starts at the first cat, loop zero, playing, parity a", () => {
    expect(createBeatState()).toEqual({ index: 0, loopIndex: 0, parity: "a", paused: false });
  });
});

describe("advance", () => {
  it("wraps the index and bumps loopIndex on wrap", () => {
    let state = createBeatState();
    state = advance(state, ROSTER_3);
    expect(state).toMatchObject({ index: 1, loopIndex: 0 });
    state = advance(state, ROSTER_3);
    expect(state).toMatchObject({ index: 2, loopIndex: 0 });
    state = advance(state, ROSTER_3);
    expect(state).toMatchObject({ index: 0, loopIndex: 1 });
  });

  it("alternates parity a, b, a, b over four advances", () => {
    let state = createBeatState();
    const parities: string[] = [];
    for (let i = 0; i < 4; i++) {
      state = advance(state, ROSTER_3);
      parities.push(state.parity);
    }
    expect(parities).toEqual(["b", "a", "b", "a"]);
  });

  it("leaves paused untouched", () => {
    const state: BeatState = { index: 0, loopIndex: 0, parity: "a", paused: true };
    expect(advance(state, ROSTER_3).paused).toBe(true);
  });
});

describe("manualNav", () => {
  it("pauses on a forward move", () => {
    const state = createBeatState();
    expect(manualNav(state, ROSTER_3, "next").paused).toBe(true);
  });

  it("pauses on a backward move", () => {
    const state = createBeatState();
    expect(manualNav(state, ROSTER_3, "prev").paused).toBe(true);
  });

  it("wraps forward past the end and bumps loopIndex", () => {
    const state: BeatState = { index: 2, loopIndex: 0, parity: "a", paused: false };
    expect(manualNav(state, ROSTER_3, "next")).toMatchObject({ index: 0, loopIndex: 1 });
  });

  it("wraps backward before the start without decrementing loopIndex", () => {
    const state: BeatState = { index: 0, loopIndex: 2, parity: "a", paused: false };
    expect(manualNav(state, ROSTER_3, "prev")).toMatchObject({ index: 2, loopIndex: 2 });
  });

  it("flips parity", () => {
    const state = createBeatState();
    expect(manualNav(state, ROSTER_3, "next").parity).toBe("b");
  });
});

describe("togglePause", () => {
  it("flips paused and nothing else", () => {
    const state: BeatState = { index: 1, loopIndex: 2, parity: "b", paused: false };
    expect(togglePause(state)).toEqual({ ...state, paused: true });
    expect(togglePause(togglePause(state))).toEqual(state);
  });
});

describe("applyRoster — anchored on the cat on show (FR-061, FR-066)", () => {
  const A = { url: "/a" };
  const B = { url: "/b" };
  const C = { url: "/c" };
  const D = { url: "/d" };
  const X = { url: "/x" };
  const onC: BeatState = { index: 2, loopIndex: 1, parity: "b", paused: false };

  it("follows the current cat to its new position when a cat is published before it", () => {
    expect(applyRoster(onC, [X, A, B, C, D], C)).toEqual({ ...onC, index: 3 });
  });

  it("follows the current cat back when a cat before it is unpublished", () => {
    expect(applyRoster(onC, [B, C, D], C)).toEqual({ ...onC, index: 1 });
  });

  it("leaves an index alone when the roster around it is unchanged", () => {
    expect(applyRoster(onC, [A, B, C, D], C)).toBe(onC);
  });

  it("falls back to the clamp when the current cat itself is gone", () => {
    expect(applyRoster(onC, [A, B, D], C).index).toBe(2);
    expect(applyRoster({ ...onC, index: 3 }, [A, B], D).index).toBe(1);
  });

  it("clamps to 0 for an empty roster, and starts at 0 when nothing was on show", () => {
    expect(applyRoster(onC, [], C).index).toBe(0);
    expect(applyRoster(createBeatState(), [A, B], undefined).index).toBe(0);
  });

  it("the boundary step from the new list neither repeats the cat just shown nor skips one", () => {
    // A publish prepends X while C is on show: the next beat is D, not C again.
    const published = [X, A, B, C, D];
    expect(advance(applyRoster(onC, published, C), published).index).toBe(4);
    expect(published[4]).toBe(D);
    // An unpublish of A while C is on show: the next beat is D, not A-shifted Pepper.
    const unpublished = [B, C, D];
    expect(advance(applyRoster(onC, unpublished, C), unpublished).index).toBe(2);
    expect(unpublished[2]).toBe(D);
    // And backwards: the cat before C in the new order.
    expect(manualNav(applyRoster(onC, published, C), published, "prev").index).toBe(2);
    expect(published[2]).toBe(B);
  });
});

describe("anchorForStep — where a boundary step starts after a swap (FR-061, FR-066)", () => {
  const A = { url: "/a" };
  const B = { url: "/b" };
  const C = { url: "/c" };
  const D = { url: "/d" };
  const X = { url: "/x" };
  const OLD = [A, B, C, D];
  const onC: BeatState = { index: 2, loopIndex: 1, parity: "b", paused: false };

  it("is the cat on show when it is still there, like applyRoster", () => {
    expect(anchorForStep(onC, OLD, [X, A, B, C, D]).index).toBe(3);
    expect(anchorForStep(onC, OLD, [B, C, D]).index).toBe(1);
    expect(anchorForStep(onC, OLD, OLD)).toBe(onC);
  });

  it("when the cat on show is gone, is its nearest predecessor still live — so the step lands on its former follower", () => {
    // Biscuit leaves while on the TV: the beat anchors on B, and the next beat is D.
    const next = [A, B, D];
    expect(anchorForStep(onC, OLD, next).index).toBe(1);
    expect(advance(anchorForStep(onC, OLD, next), next).index).toBe(2);
    expect(next[2]).toBe(D);
    // Its predecessor left too: the one before that.
    const fewer = [A, D];
    expect(anchorForStep(onC, OLD, fewer).index).toBe(0);
    expect(advance(anchorForStep(onC, OLD, fewer), fewer).index).toBe(1);
    expect(fewer[1]).toBe(D);
  });

  it("with no predecessor left, anchors before the start so the step lands on the first cat", () => {
    const next = [D, X];
    expect(anchorForStep(onC, OLD, next).index).toBe(-1);
    expect(advance(anchorForStep(onC, OLD, next), next)).toMatchObject({ index: 0, loopIndex: 2 });
    expect(anchorForStep(createBeatState(), [], [A]).index).toBe(-1);
    expect(advance(anchorForStep(createBeatState(), [], [A]), [A]).index).toBe(0);
  });
});
