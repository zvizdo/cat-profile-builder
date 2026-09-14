import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitStage } from "@/core/carousel/stage-fit";
import { useStageFit } from "@/ui/carousel/use-stage-fit";

// F64: the hook measures `.page` (a ResizeObserver) and `devicePixelRatio` (a `matchMedia`
// query on the current ratio) and hands `fitStage`'s result back as CSS variables plus
// `snapped`, re-measuring on either change and cleaning both subscriptions up when the ref
// detaches.

/** The variables `toStyle` builds from `fitStage`'s result, for the same box and ratio. */
function expectedStyle(width: number, height: number, dpr: number) {
  const fit = fitStage({ width, height, dpr });
  return {
    "--stage-scale": fit.scale,
    "--stage-left": `${fit.left}px`,
    "--stage-top": `${fit.top}px`,
  };
}

/** A `ResizeObserver` stand-in: jsdom has none. Captures every instance so a test can fire
 * its callback to simulate a resize, and spies on `disconnect` for the cleanup assertion. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly disconnect = vi.fn();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {
    // Nothing to record: the hook re-reads the node's own getBoundingClientRect().
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** A `matchMedia` stand-in that records every query asked for and lets a test dispatch a
 * "change" event on one of them, the way a real `dppx` query fires when the ratio moves. */
interface FakeMediaQueryList {
  media: string;
  listeners: Set<() => void>;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
  dispatch: () => void;
}

function fakeMatchMedia(): {
  matchMedia: (query: string) => FakeMediaQueryList;
  all: FakeMediaQueryList[];
} {
  const all: FakeMediaQueryList[] = [];
  const matchMedia = (query: string): FakeMediaQueryList => {
    const listeners = new Set<() => void>();
    const mql: FakeMediaQueryList = {
      media: query,
      listeners,
      addEventListener: (_type, cb) => listeners.add(cb),
      removeEventListener: (_type, cb) => listeners.delete(cb),
      dispatch: () => {
        for (const cb of [...listeners]) cb();
      },
    };
    all.push(mql);
    return mql;
  };
  return { matchMedia, all };
}

/** A DOM node whose `getBoundingClientRect` answers a fixed, mutable box. */
function fakePage(rect: { width: number; height: number }): HTMLElement {
  const node = document.createElement("div");
  node.getBoundingClientRect = vi.fn(
    () =>
      ({
        ...rect,
        top: 0,
        left: 0,
        right: rect.width,
        bottom: rect.height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return node;
}

let mediaQueries: ReturnType<typeof fakeMatchMedia>;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  mediaQueries = fakeMatchMedia();
  vi.stubGlobal("matchMedia", mediaQueries.matchMedia);
  vi.stubGlobal("devicePixelRatio", 3);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useStageFit", () => {
  it("is unsnapped until the ref attaches, then measures the node and applies fitStage", () => {
    const { result } = renderHook(() => useStageFit());
    expect(result.current.snapped).toBe(false);
    expect(result.current.style).toEqual({});

    const page = fakePage({ width: 390, height: 844 });
    act(() => result.current.pageRef(page));

    expect(result.current.snapped).toBe(true);
    expect(result.current.style).toEqual(expectedStyle(390, 844, 3));
    expect(mediaQueries.all).toHaveLength(1);
    expect(mediaQueries.all[0]?.media).toBe("(resolution: 3dppx)");
  });

  it("re-measures when the ResizeObserver fires", () => {
    const { result } = renderHook(() => useStageFit());
    const page = fakePage({ width: 390, height: 844 });
    act(() => result.current.pageRef(page));

    page.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 1440,
          height: 900,
          top: 0,
          left: 0,
          right: 1440,
          bottom: 900,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    act(() => FakeResizeObserver.instances[0]?.fire());

    expect(result.current.style).toEqual(expectedStyle(1440, 900, 3));
  });

  it("skips the state update — and the re-render — when a re-measurement gives an identical fit", () => {
    // The ResizeObserver's own initial callback fires right after `measure()` already ran
    // once synchronously on attach, with the same box: this is exactly that duplicate.
    const { result } = renderHook(() => useStageFit());
    const page = fakePage({ width: 390, height: 844 });
    act(() => result.current.pageRef(page));
    const styleBefore = result.current.style;

    act(() => FakeResizeObserver.instances[0]?.fire());

    // Same object reference: React bailed out of the update (the functional setState
    // returned `prev`), so the hook never re-ran and `toStyle` was never called again.
    expect(result.current.style).toBe(styleBefore);
  });

  it("re-measures on a devicePixelRatio change, and re-subscribes to the new ratio's query", () => {
    const { result } = renderHook(() => useStageFit());
    const page = fakePage({ width: 390, height: 844 });
    act(() => result.current.pageRef(page));
    expect(mediaQueries.all).toHaveLength(1);

    vi.stubGlobal("devicePixelRatio", 2);
    act(() => mediaQueries.all[0]?.dispatch());

    expect(result.current.style).toEqual(expectedStyle(390, 844, 2));
    expect(mediaQueries.all).toHaveLength(2);
    expect(mediaQueries.all[1]?.media).toBe("(resolution: 2dppx)");
    // The old query's listener is dropped so a stale query firing again does nothing new.
    expect(mediaQueries.all[0]?.listeners.size).toBe(0);
  });

  it("returns a cleanup that disconnects the observer and drops the media query listener (React 19 calls it on detach)", () => {
    const { result } = renderHook(() => useStageFit());
    const page = fakePage({ width: 390, height: 844 });
    let cleanup: (() => void) | undefined;
    act(() => {
      cleanup = result.current.pageRef(page);
    });
    const observer = FakeResizeObserver.instances[0]!;
    const lastQuery = mediaQueries.all[mediaQueries.all.length - 1]!;

    act(() => cleanup?.());

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(lastQuery.listeners.size).toBe(0);
  });

  // React re-attaching a ref to a different node calls the old node's returned cleanup,
  // then invokes the callback again with the new node — exactly what this simulates.
  it("re-attaching to a different node disconnects the first node's observer and empties its query's listeners", () => {
    const { result } = renderHook(() => useStageFit());
    const pageA = fakePage({ width: 390, height: 844 });
    let cleanupA: (() => void) | undefined;
    act(() => {
      cleanupA = result.current.pageRef(pageA);
    });
    const observerA = FakeResizeObserver.instances[0]!;
    const queryA = mediaQueries.all[mediaQueries.all.length - 1]!;

    const pageB = fakePage({ width: 1440, height: 900 });
    act(() => {
      cleanupA?.();
      result.current.pageRef(pageB);
    });

    expect(observerA.disconnect).toHaveBeenCalledTimes(1);
    expect(queryA.listeners.size).toBe(0);
    expect(result.current.style).toEqual(expectedStyle(1440, 900, 3));
  });

  it("does nothing when a ref that never attached is asked to detach", () => {
    const { result } = renderHook(() => useStageFit());
    expect(() => act(() => result.current.pageRef(null))).not.toThrow();
    expect(result.current.snapped).toBe(false);
  });
});
