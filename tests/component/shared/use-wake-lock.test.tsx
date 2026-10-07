import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "@/ui/shared/use-wake-lock";

// The shared screen wake lock (the kiosk's, now the fundraising display's too): asked for
// on mount, asked for again each time the page becomes visible — the browser drops the
// lock when the page hides — released on unmount, and never a reason to throw: a browser
// without the API has nothing to hold, and a refused request is quietly left alone.

function Harness() {
  useWakeLock();
  return <p>Awake</p>;
}

function stubVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  fireEvent(document, new Event("visibilitychange"));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useWakeLock", () => {
  it("requests a screen lock on mount", async () => {
    const request = vi.fn(async () => ({ release: vi.fn() }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    render(<Harness />);
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("releases the lock it holds on unmount", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(async () => ({ release }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = render(<Harness />);
    await settle();
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("asks again when the page becomes visible, and not while it is hidden", async () => {
    const request = vi.fn(async () => ({ release: vi.fn() }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    render(<Harness />);
    await settle();
    stubVisibility("hidden");
    expect(request).toHaveBeenCalledTimes(1);
    stubVisibility("visible");
    expect(request).toHaveBeenCalledTimes(2);
    await settle();
  });

  it("stops listening for visibility once unmounted", async () => {
    const request = vi.fn(async () => ({ release: vi.fn() }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = render(<Harness />);
    await settle();
    unmount();
    stubVisibility("visible");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and does not throw, where the browser has no wake lock", () => {
    vi.stubGlobal("navigator", { ...navigator, wakeLock: undefined });
    const { getByText, unmount } = render(<Harness />);
    expect(getByText("Awake")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it("does not throw when the browser refuses the request", async () => {
    const request = vi.fn(() => Promise.reject(new DOMException("hidden", "NotAllowedError")));
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { getByText, unmount } = render(<Harness />);
    await settle();
    expect(getByText("Awake")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });
});
