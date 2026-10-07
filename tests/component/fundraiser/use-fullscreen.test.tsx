import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFullscreen } from "@/ui/fundraiser/use-fullscreen";
import {
  DISPLAY_MODE_FULLSCREEN,
  stubFullscreenApi,
  stubMatchMediaQueries,
  type FullscreenFake,
  type MatchMediaFake,
} from "./fullscreen-fakes";

// The hook that says whether the page is in display state and asks the browser for full
// screen. jsdom has neither the API nor a media query that can change, so the fakes in
// fullscreen-fakes.ts stand in for both.

let media: MatchMediaFake;
let api: FullscreenFake;

beforeEach(() => {
  media = stubMatchMediaQueries();
  api = stubFullscreenApi();
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

describe("useFullscreen supported", () => {
  it("is supported where the page can ask for full screen", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
  });

  it("is not supported where requestFullscreen is missing, as on iPhone Safari", () => {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(false);
  });
});

describe("useFullscreen enter", () => {
  it("asks the document element once per call and reports it entered", async () => {
    const { result } = renderHook(() => useFullscreen());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.enter();
    });
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("entered");
  });

  it("reports refused when the browser rejects the request", async () => {
    api.request.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const { result } = renderHook(() => useFullscreen());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.enter();
    });
    expect(outcome).toBe("refused");
  });

  it("reports refused, and throws nothing, when there is no API to ask", async () => {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    const { result } = renderHook(() => useFullscreen());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.enter();
    });
    expect(outcome).toBe("refused");
  });
});

describe("useFullscreen active", () => {
  it("starts inactive", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.active).toBe(false);
  });

  it("follows fullscreenchange in and out", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => api.setElement(document.documentElement));
    expect(result.current.active).toBe(true);
    act(() => api.setElement(null));
    expect(result.current.active).toBe(false);
  });

  it("is active when the display-mode query matches, with no fullscreenElement", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(document.fullscreenElement).toBeNull();
    act(() => media.set(DISPLAY_MODE_FULLSCREEN, true));
    expect(result.current.active).toBe(true);
    act(() => media.set(DISPLAY_MODE_FULLSCREEN, false));
    expect(result.current.active).toBe(false);
  });

  it("stays active while either signal still says full screen", () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => media.set(DISPLAY_MODE_FULLSCREEN, true));
    act(() => api.setElement(document.documentElement));
    act(() => media.set(DISPLAY_MODE_FULLSCREEN, false));
    expect(result.current.active).toBe(true);
    act(() => api.setElement(null));
    expect(result.current.active).toBe(false);
  });

  it("lets go of both listeners when the page goes away", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useFullscreen());
    expect(media.listenerCount(DISPLAY_MODE_FULLSCREEN)).toBeGreaterThan(0);
    unmount();
    expect(media.listenerCount(DISPLAY_MODE_FULLSCREEN)).toBe(0);
    expect(remove).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });
});

describe("useFullscreen on the server", () => {
  it("renders as a browser that can go full screen but is not in it yet", () => {
    function Probe() {
      const { supported, active } = useFullscreen();
      return <p data-supported={supported} data-active={active} />;
    }
    expect(renderToString(<Probe />)).toContain('data-supported="true" data-active="false"');
  });
});
