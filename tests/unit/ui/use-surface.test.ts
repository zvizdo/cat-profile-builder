import { afterEach, describe, expect, it, vi } from "vitest";
import { PHONE_QUERY, readSurface, subscribeSurface } from "@/ui/builder/use-surface";

// The surface (data-model.md → Builder session `surface`; FR-091): phone under 768px,
// full from it — read from one media query, and `full` wherever there is no window to
// ask (the server, jsdom without a stub).

/** A `matchMedia` answering `matches` for the phone query and recording its listeners. */
function stubMatchMedia(matches: boolean) {
  const list = {
    matches,
    media: PHONE_QUERY,
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

describe("useSurface", () => {
  it("asks for everything under 768px wide, and everything under 480px tall (a phone sideways)", () => {
    expect(PHONE_QUERY).toBe("(max-width: 767px), (max-height: 479px)");
  });

  it("reads phone when the query matches and full when it does not", () => {
    const { matchMedia } = stubMatchMedia(true);
    expect(readSurface()).toBe("phone");
    expect(matchMedia).toHaveBeenCalledWith(PHONE_QUERY);
    stubMatchMedia(false);
    expect(readSurface()).toBe("full");
  });

  it("is full where there is no window or no matchMedia", () => {
    vi.stubGlobal("window", undefined);
    expect(readSurface()).toBe("full");
    vi.stubGlobal("window", {});
    expect(readSurface()).toBe("full");
  });

  it("subscribes to the query's change and unsubscribes on teardown", () => {
    const { list } = stubMatchMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeSurface(onChange);
    expect(list.addEventListener).toHaveBeenCalledWith("change", onChange);
    unsubscribe();
    expect(list.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("subscribing without matchMedia is a no-op", () => {
    vi.stubGlobal("window", {});
    expect(() => subscribeSurface(() => {})()).not.toThrow();
  });
});
