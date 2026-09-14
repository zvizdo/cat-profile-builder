import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KIOSK_POLL_MS, useKioskPoll } from "@/ui/carousel/use-kiosk-poll";
import { CLIP, OLIVE, ROSTER, SOLO } from "./fixtures";

// The kiosk's five-minute poll (T043; FR-061, FR-066; server-boundary.md → `/kiosk`):
// one `GET /api/carousel` per interval and nothing else; an answer is held as
// `pendingRoster` until `drain()` — which hands it back for the step — and a failed poll
// (the network, a non-2xx, an answer that is not a roster) keeps the roster and dates the
// outage. That a drain happens exactly at a beat boundary is the stage's doing and is
// proven in KioskShell.test.tsx; the transitions themselves are feed.ts's, proven in
// tests/unit/core/carousel/feed.test.ts. The first roster is the server page's: no fetch
// before the first interval.

const LOADED_AT = new Date(2026, 8, 12, 14, 2).getTime();

/** A fake `fetch` answering `GET /api/carousel` with `body`, or failing as `failure` says. */
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

function poll(options: { immediate?: boolean; initial?: typeof ROSTER } = {}) {
  return renderHook(
    ({ immediate }) => useKioskPoll({ initial: options.initial ?? ROSTER, immediate }),
    { initialProps: { immediate: options.immediate ?? false } },
  );
}

/** Lets the interval fire and the fetch's promise chain settle. */
async function interval(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(KIOSK_POLL_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOADED_AT);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useKioskPoll — the interval", () => {
  it("starts on the server's roster with no fetch, then polls /api/carousel once every five minutes", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: ROSTER }));
    const { result } = poll();
    expect(result.current.roster).toBe(ROSTER);
    expect(result.current.lastGoodAt).toBe(LOADED_AT);
    expect(result.current.failedSince).toBeUndefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIOSK_POLL_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/carousel");
    await interval();
    await interval();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling once unmounted", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: ROSTER }));
    const { unmount } = poll();
    await interval();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    await interval();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useKioskPoll — an answer is held until drained (FR-066)", () => {
  it("sits in pendingRoster, untouched by time, until drain() moves it onto the roster and hands it back", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO, OLIVE] }));
    const { result } = poll();
    await interval();
    // Arrived: the poll succeeded, the feed is fine, but the beat still shows the old roster.
    expect(result.current.roster).toBe(ROSTER);
    expect(result.current.pendingRoster).toEqual([SOLO, OLIVE]);
    expect(result.current.lastGoodAt).toBe(LOADED_AT + KIOSK_POLL_MS);
    // Any amount of time short of the next poll changes nothing by itself.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIOSK_POLL_MS - 1);
    });
    expect(result.current.roster).toBe(ROSTER);
    let drained: unknown;
    act(() => {
      drained = result.current.drain();
    });
    expect(drained).toEqual([SOLO, OLIVE]);
    expect(result.current.roster).toBe(drained);
    expect(result.current.pendingRoster).toBeUndefined();
  });

  it("a later answer replaces what is pending; draining with nothing pending changes nothing", async () => {
    fetchMock.mockImplementationOnce(async () => answer({ cats: [SOLO, OLIVE] }));
    fetchMock.mockImplementationOnce(async () => answer({ cats: [CLIP] }));
    const { result } = poll();
    await interval();
    await interval();
    expect(result.current.pendingRoster).toEqual([CLIP]);
    act(() => result.current.drain());
    const drained = result.current.roster;
    expect(drained).toEqual([CLIP]);
    let again: unknown = "not called";
    act(() => {
      again = result.current.drain();
    });
    expect(again).toBeUndefined();
    expect(result.current.roster).toBe(drained);
  });

  it("with nothing mid-beat to wait for (`immediate`), an answer is the roster as it arrives", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO, OLIVE] }));
    const { result } = poll({ immediate: true });
    await interval();
    expect(result.current.roster).toEqual([SOLO, OLIVE]);
    expect(result.current.pendingRoster).toBeUndefined();
  });

  it("from an empty roster, where no beat runs, an answer is the roster as it arrives", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO] }));
    const { result } = poll({ initial: [] });
    await interval();
    expect(result.current.roster).toEqual([SOLO]);
    expect(result.current.pendingRoster).toBeUndefined();
  });

  it("what was held is applied the moment the beat has nothing to wait for", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [] }));
    const { result, rerender } = poll();
    await interval();
    expect(result.current.roster).toBe(ROSTER);
    rerender({ immediate: true });
    expect(result.current.roster).toEqual([]);
    expect(result.current.pendingRoster).toBeUndefined();
  });
});

describe("useKioskPoll — a poll that fails", () => {
  it("a network failure keeps the roster and records failedSince, keeping the last good time", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { result } = poll();
    await interval();
    expect(result.current.roster).toBe(ROSTER);
    expect(result.current.pendingRoster).toBeUndefined();
    expect(result.current.failedSince).toBe(LOADED_AT + KIOSK_POLL_MS);
    expect(result.current.lastGoodAt).toBe(LOADED_AT);
    // A second failure keeps the first failure's time: the line dates the outage's start.
    await interval();
    expect(result.current.failedSince).toBe(LOADED_AT + KIOSK_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a non-2xx answer and an answer that is not a roster are failures too", async () => {
    fetchMock.mockImplementationOnce(async () => answer({ error: { message: "upstream" } }, 502));
    fetchMock.mockImplementationOnce(async () => answer({ cats: "none" }));
    fetchMock.mockImplementationOnce(
      async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const { result } = poll();
    await interval();
    expect(result.current.failedSince).toBe(LOADED_AT + KIOSK_POLL_MS);
    await interval();
    await interval();
    expect(result.current.roster).toBe(ROSTER);
    expect(result.current.pendingRoster).toBeUndefined();
    expect(result.current.failedSince).toBe(LOADED_AT + KIOSK_POLL_MS);
  });

  it("the next success clears failedSince and moves lastGoodAt; what it brought is held", async () => {
    fetchMock.mockImplementationOnce(async () => answer({}, 502));
    fetchMock.mockImplementationOnce(async () => answer({ cats: [SOLO] }));
    const { result } = poll();
    await interval();
    expect(result.current.failedSince).toBeDefined();
    await interval();
    expect(result.current.failedSince).toBeUndefined();
    expect(result.current.lastGoodAt).toBe(LOADED_AT + 2 * KIOSK_POLL_MS);
    expect(result.current.roster).toBe(ROSTER);
    expect(result.current.pendingRoster).toEqual([SOLO]);
  });
});
