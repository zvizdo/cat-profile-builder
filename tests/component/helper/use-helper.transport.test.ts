import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithHeaderTimeout, HEADERS_TIMEOUT_MS } from "@/ui/helper/use-helper";

// F42: the transport's timeout covers the response *headers* only. A request that never
// answers gives up after 120 s the way a dropped connection does (a `TypeError` naming
// fetch, which the AI SDK's client reads as `isDisconnect`); a body that streams for
// longer than that is never cut; the SDK's own abort still reaches the request.

/** A `fetch` that never answers — but, like the real one, rejects with the abort reason
 * the moment its signal fires. */
function never(_input?: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
}

describe("fetchWithHeaderTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up on a request whose headers never arrive, as a network-style TypeError", async () => {
    vi.stubGlobal("fetch", vi.fn(never));
    const pending = fetchWithHeaderTimeout("/api/helper/chat", { method: "POST" });
    const outcome = pending.then(
      () => "resolved",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(HEADERS_TIMEOUT_MS - 1);
    // Still waiting: the timer has not fired.
    await vi.advanceTimersByTimeAsync(2);
    const error = await outcome;
    expect(error).toBeInstanceOf(TypeError);
    expect(String((error as Error).message).toLowerCase()).toContain("fetch");
  });

  it("aborts the underlying request when it gives up", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return never(input, init);
      }),
    );
    const pending = fetchWithHeaderTimeout("/api/helper/chat").catch(() => undefined);
    await vi.advanceTimersByTimeAsync(HEADERS_TIMEOUT_MS + 1);
    await pending;
    expect(signals[0]?.aborted).toBe(true);
  });

  it("once the headers are in, a body that streams for longer than the timeout is never cut", async () => {
    let close: () => void = () => undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: x\n\n"));
        close = () => controller.close();
      },
    });
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Response(body, { status: 200 });
      }),
    );
    const response = await fetchWithHeaderTimeout("/api/helper/chat");
    await vi.advanceTimersByTimeAsync(HEADERS_TIMEOUT_MS * 3);
    expect(signals[0]?.aborted).toBe(false);
    close();
    expect(await response.text()).toBe("data: x\n\n");
  });

  it("forwards the SDK's own abort, before and after the request starts", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return never(input, init);
      }),
    );
    const upstream = new AbortController();
    void fetchWithHeaderTimeout("/api/helper/chat", { signal: upstream.signal }).catch(
      () => undefined,
    );
    expect(signals[0]?.aborted).toBe(false);
    upstream.abort();
    expect(signals[0]?.aborted).toBe(true);

    const already = new AbortController();
    already.abort();
    void fetchWithHeaderTimeout("/api/helper/chat", { signal: already.signal }).catch(
      () => undefined,
    );
    expect(signals[1]?.aborted).toBe(true);
  });
});
