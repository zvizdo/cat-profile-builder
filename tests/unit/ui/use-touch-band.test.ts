import { afterEach, describe, expect, it, vi } from "vitest";
import { readTouchBand, subscribeTouchBand, TOUCH_QUERY } from "@/ui/builder/blocks/use-touch-band";

// The touch band (F28 review #6; comp 7c): 768–1179, between the phone floor and the
// docked `wide` column at 1180. Read from one media query, `false` wherever there is no
// window to ask (the server, or jsdom without a stub) — the same shape as `useSurface`.

/** A `matchMedia` answering `matches` for the touch query and recording its listeners. */
function stubMatchMedia(matches: boolean) {
  const list = {
    matches,
    media: TOUCH_QUERY,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => list);
  vi.stubGlobal("window", { matchMedia });
  return { list, matchMedia };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTouchBand", () => {
  it("asks for 768–1179, short of the docked `wide` column at 1180", () => {
    expect(TOUCH_QUERY).toBe("(min-width: 768px) and (max-width: 1179px)");
  });

  it("reads true when the query matches and false when it does not", () => {
    const { matchMedia } = stubMatchMedia(true);
    expect(readTouchBand()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(TOUCH_QUERY);
    stubMatchMedia(false);
    expect(readTouchBand()).toBe(false);
  });

  it("is false where there is no window or no matchMedia", () => {
    vi.stubGlobal("window", undefined);
    expect(readTouchBand()).toBe(false);
    vi.stubGlobal("window", {});
    expect(readTouchBand()).toBe(false);
  });

  it("subscribes to the query's change and unsubscribes on teardown", () => {
    const { list } = stubMatchMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeTouchBand(onChange);
    expect(list.addEventListener).toHaveBeenCalledWith("change", onChange);
    unsubscribe();
    expect(list.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("subscribing without matchMedia is a no-op", () => {
    vi.stubGlobal("window", {});
    expect(() => subscribeTouchBand(() => {})()).not.toThrow();
  });
});
