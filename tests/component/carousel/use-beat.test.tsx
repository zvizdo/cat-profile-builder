import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Turn } from "@/core/carousel/beat";
import { ENTRANCE_FRACTION, HOVER_IDLE_MS, useBeat } from "@/ui/carousel/use-beat";

// The beat clock (T042; FR-062, FR-063, FR-069): one automatic step per hold, none while
// paused, a manual move pauses, Space resumes, and reduced motion installs no timer at
// all. Every step decision is beat.ts's; this hook only owns the clock and the flags.

const roster = [
  { name: "Solo", url: "/solo" },
  { name: "Clip", url: "/clip" },
  { name: "Olive", url: "/olive" },
] as const;
const HOLD = 8;
const MS = HOLD * 1000;

/** One `act` per beat: React commits the next beat's timer only once the previous act ends. */
function beats(count: number): void {
  for (let i = 0; i < count; i++) act(() => vi.advanceTimersByTime(MS));
}

function beat(
  options: {
    reducedMotion?: boolean;
    cats?: readonly Turn[];
    onBeforeStep?: () => readonly Turn[] | undefined;
  } = {},
) {
  return renderHook(() =>
    useBeat({
      roster: options.cats ?? roster,
      hold: HOLD,
      reducedMotion: options.reducedMotion ?? false,
      onBeforeStep: options.onBeforeStep,
    }),
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useBeat — the clock", () => {
  it("advances once per hold, wrapping and counting loops through beat.ts", () => {
    const { result } = beat();
    expect(result.current.state.index).toBe(0);
    act(() => vi.advanceTimersByTime(MS - 1));
    expect(result.current.state.index).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.index).toBe(1);
    expect(result.current.state.parity).toBe("b");
    beats(2);
    expect(result.current.state).toMatchObject({ index: 0, loopIndex: 1, parity: "b" });
  });

  it("does not advance while paused, and resumes with the beat's remaining time", () => {
    const { result } = beat();
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.togglePause());
    expect(result.current.paused).toBe(true);
    act(() => vi.advanceTimersByTime(MS * 3));
    expect(result.current.state.index).toBe(0);
    act(() => result.current.togglePause());
    expect(result.current.paused).toBe(false);
    // 3 s were used before the pause: the beat has 5 s left, not a fresh 8.
    act(() => vi.advanceTimersByTime(MS - 3000 - 1));
    expect(result.current.state.index).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.index).toBe(1);
  });

  it("installs no timer for an empty roster", () => {
    const { result } = beat({ cats: [] });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(MS * 2));
    expect(result.current.state.index).toBe(0);
  });
});

describe("useBeat — manual navigation", () => {
  it("next and prev move through beat.ts and pause auto-advance", () => {
    const { result } = beat();
    act(() => result.current.next());
    expect(result.current.state).toMatchObject({ index: 1, paused: true });
    expect(result.current.paused).toBe(true);
    act(() => result.current.prev());
    act(() => result.current.prev());
    expect(result.current.state.index).toBe(2);
    act(() => vi.advanceTimersByTime(MS * 4));
    expect(result.current.state.index).toBe(2);
  });

  it("the arrow keys move; Space toggles pause and resumes the clock", () => {
    const { result } = beat();
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(result.current.state).toMatchObject({ index: 1, paused: true });
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });
    expect(result.current.state.index).toBe(0);
    act(() => {
      fireEvent.keyDown(window, { key: " " });
    });
    expect(result.current.paused).toBe(false);
    act(() => vi.advanceTimersByTime(MS));
    expect(result.current.state.index).toBe(1);
    act(() => {
      fireEvent.keyDown(window, { key: " " });
    });
    expect(result.current.paused).toBe(true);
  });

  it("leaves Space to a focused button — its own activation wins — but takes it on a link", () => {
    const { result } = beat();
    const button = document.createElement("button");
    const link = document.createElement("a");
    document.body.append(button, link);
    act(() => {
      fireEvent.keyDown(button, { key: " " });
    });
    expect(result.current.paused).toBe(false);
    // A link does nothing on Space by itself (the frame is one), so the carousel takes it.
    act(() => {
      fireEvent.keyDown(link, { key: " " });
    });
    expect(result.current.paused).toBe(true);
    button.remove();
    link.remove();
  });

  it("ignores a held arrow's repeats and any arrow with a modifier", () => {
    const { result } = beat();
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
      fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
      fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
      fireEvent.keyDown(window, { key: "ArrowLeft", ctrlKey: true });
    });
    expect(result.current.state.index).toBe(0);
    expect(result.current.paused).toBe(false);
  });

  it("calls onBeforeStep just before every step, automatic or manual", () => {
    const onBeforeStep = vi.fn();
    const { result } = beat({ onBeforeStep });
    act(() => vi.advanceTimersByTime(MS));
    expect(onBeforeStep).toHaveBeenCalledTimes(1);
    act(() => result.current.next());
    expect(onBeforeStep).toHaveBeenCalledTimes(2);
    act(() => result.current.togglePause());
    expect(onBeforeStep).toHaveBeenCalledTimes(2);
  });

  it("a fresh beat after a manual move plays its entrance before it freezes", () => {
    const { result } = beat();
    act(() => result.current.next());
    expect(result.current.frozen).toBe(false);
    act(() => vi.advanceTimersByTime(MS * ENTRANCE_FRACTION - 1));
    expect(result.current.frozen).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.frozen).toBe(true);
    // Resuming continues from the frozen point: the remaining 70 % of the hold.
    act(() => result.current.togglePause());
    act(() => vi.advanceTimersByTime(MS * (1 - ENTRANCE_FRACTION) - 1));
    expect(result.current.state.index).toBe(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.index).toBe(2);
  });

  it("the first beat's entrance finishes before a pause freezes it", () => {
    const { result } = beat();
    act(() => result.current.togglePause());
    expect(result.current.paused).toBe(true);
    expect(result.current.frozen).toBe(false);
    act(() => vi.advanceTimersByTime(MS * ENTRANCE_FRACTION));
    expect(result.current.frozen).toBe(true);
  });

  it("a pause mid-beat freezes everything at once", () => {
    const { result } = beat();
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.togglePause());
    expect(result.current.frozen).toBe(true);
    act(() => result.current.togglePause());
    expect(result.current.frozen).toBe(false);
  });
});

describe("useBeat — the pointer", () => {
  it("movement over the frame pauses; three still seconds resume; leaving resumes at once", () => {
    const { result } = beat();
    // Past the entrance, so the pause is a plain freeze.
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.pointerMove());
    expect(result.current.paused).toBe(true);
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS - 1));
    expect(result.current.paused).toBe(true);
    // Every move restarts the still clock.
    act(() => result.current.pointerMove());
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS - 1));
    expect(result.current.paused).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.paused).toBe(false);
    // The clock resumes with the beat's remaining 4 s — nothing was spent while paused.
    act(() => vi.advanceTimersByTime(MS - 4000 - 1));
    expect(result.current.state.index).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.state.index).toBe(1);

    act(() => result.current.pointerMove());
    expect(result.current.paused).toBe(true);
    act(() => result.current.pointerLeave());
    expect(result.current.paused).toBe(false);
  });

  it("a Space pause outlives the pointer's stillness and its leaving", () => {
    const { result } = beat();
    act(() => result.current.togglePause());
    act(() => result.current.pointerMove());
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS));
    expect(result.current.paused).toBe(true);
    act(() => result.current.pointerLeave());
    expect(result.current.paused).toBe(true);
  });

  it("under reduced motion the pointer changes nothing and installs no timer", () => {
    const { result } = beat({ reducedMotion: true });
    act(() => result.current.pointerMove());
    expect(result.current.paused).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useBeat — reduced motion", () => {
  it("installs no timer, never advances by itself, and still pages by arrow", () => {
    const { result } = beat({ reducedMotion: true });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(MS * 3));
    expect(result.current.state.index).toBe(0);
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(result.current.state.index).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      fireEvent.keyDown(window, { key: " " });
    });
    act(() => vi.advanceTimersByTime(MS * 3));
    expect(result.current.state.index).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useBeat — a roster that changes", () => {
  it("a roster onBeforeStep hands back is what the step is taken from, anchored on the cat on show", () => {
    const fresh: Turn[] = [{ url: "/new" }, ...roster];
    const onBeforeStep = vi.fn<() => readonly Turn[] | undefined>().mockReturnValueOnce(fresh);
    const { result, rerender } = renderHook(
      ({ cats }) => useBeat({ roster: cats, hold: HOLD, reducedMotion: false, onBeforeStep }),
      { initialProps: { cats: roster as readonly Turn[] } },
    );
    beats(1);
    // On Clip (index 1 of the old three); a cat published before it makes it index 2, and
    // the beat steps on to Olive at 3 — not back over Clip.
    beats(1);
    expect(result.current.state.index).toBe(3);
    // The parent now renders that same array: nothing to swap again.
    rerender({ cats: fresh });
    expect(result.current.state.index).toBe(3);
    beats(1);
    expect(result.current.state).toMatchObject({ index: 0, loopIndex: 1 });
  });

  it("a manual move takes the fresh roster the same way", () => {
    const fresh: { roster: Turn[] | undefined } = { roster: undefined };
    const { result } = beat({ onBeforeStep: () => fresh.roster });
    beats(2);
    expect(result.current.state.index).toBe(2);
    // Solo was unpublished while Olive is on show: prev is Clip, at 0 in the new list.
    fresh.roster = [roster[1], roster[2]];
    act(() => result.current.prev());
    expect(result.current.state.index).toBe(0);
  });

  it("a fresh roster without the cat on show steps to that cat's former follower", () => {
    const fresh: { roster: Turn[] | undefined } = { roster: undefined };
    const { result } = beat({ onBeforeStep: () => fresh.roster });
    beats(1);
    expect(result.current.state.index).toBe(1);
    // Clip is unpublished while on show: the next beat is Olive, now at 1 — not Solo again.
    fresh.roster = [roster[0], roster[2]];
    beats(1);
    expect(result.current.state).toMatchObject({ index: 1, loopIndex: 0 });
  });

  it("a roster that changes between beats is anchored on the cat on show", () => {
    const { result, rerender } = renderHook(
      ({ cats }) => useBeat({ roster: cats, hold: HOLD, reducedMotion: false }),
      { initialProps: { cats: roster as readonly Turn[] } },
    );
    beats(2);
    expect(result.current.state.index).toBe(2);
    rerender({ cats: [{ url: "/new" }, ...roster] });
    expect(result.current.state.index).toBe(3);
  });

  it("clamps the index through applyRoster when the roster shrinks", () => {
    const { result, rerender } = renderHook(
      ({ cats }) => useBeat({ roster: cats, hold: HOLD, reducedMotion: false }),
      { initialProps: { cats: roster as readonly Turn[] } },
    );
    beats(2);
    expect(result.current.state.index).toBe(2);
    rerender({ cats: [roster[0]] });
    expect(result.current.state.index).toBe(0);
  });
});
