import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocument } from "@/core/profile/schema";
import { createAutosave, RETRY_MESSAGE, sendDraft, type SendResult } from "@/ui/builder/autosave";

// The draft autosave (FR-023, FR-024; ADR-015 → Draft saves): one send for a burst of
// edits within a second, never later than five seconds after the first while edits keep
// coming, the whole document on `pagehide` with `keepalive`, and every failure keeps the
// local copy (FR-027). Fake timers drive the clock; `send` is a spy.

const DOC: ProfileDocument = {
  schemaVersion: 1,
  id: "abcdefgh",
  name: "Charlotte",
  blocks: [],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
};

function named(name: string): ProfileDocument {
  return { ...DOC, name };
}

const OK: SendResult = { ok: true, updatedAt: "2026-09-11T10:00:00.000Z" };

function harness(results: SendResult[] = [OK]) {
  const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
  for (const result of results) send.mockResolvedValueOnce(result);
  send.mockResolvedValue(OK);
  const onStart = vi.fn();
  const onResult = vi.fn<(result: SendResult) => void>();
  const autosave = createAutosave({ send, onStart, onResult });
  return { send, onStart, onResult, autosave };
}

describe("createAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends once, one second after the last touch of a burst, with the latest document", async () => {
    const { send, onStart, autosave } = harness();
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(400);
    autosave.touch(named("Ch"));
    await vi.advanceTimersByTimeAsync(400);
    autosave.touch(named("Cha"));
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(named("Cha"), false);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("sends no later than five seconds after the first touch under continuous edits", async () => {
    const { send, autosave } = harness();
    for (let i = 0; i < 12; i += 1) {
      autosave.touch(named(`edit ${i}`));
      await vi.advanceTimersByTimeAsync(500);
    }
    // 6 s of edits 500 ms apart: the debounce never fires, the 5 s ceiling does — once.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual(named("edit 9"));
    // The edits after that send land one second after the last of them.
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual(named("edit 11"));
  });

  it("reports the server's stamp when the send lands, with the document it sent", async () => {
    const { onResult, autosave } = harness();
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith(OK, named("C"));
  });

  it("flush sends the pending document at once with keepalive (pagehide)", async () => {
    const { send, autosave } = harness();
    autosave.touch(named("C"));
    autosave.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(named("C"), true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending sends nothing", () => {
    const { send, autosave } = harness();
    autosave.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("retry sends a failed document at once, without keepalive, and only once (the online event)", async () => {
    const failed: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    const { send, autosave } = harness([failed]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    autosave.retry();
    autosave.retry();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(named("C"), false);
    // It landed: the backoff timer the failure armed sends nothing more.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retry with nothing pending sends nothing", () => {
    const { send, autosave } = harness();
    autosave.retry();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends again after an in-flight save when the document moved on meanwhile", async () => {
    let resolveFirst: (result: SendResult) => void = () => undefined;
    const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
    send.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    send.mockResolvedValue(OK);
    const autosave = createAutosave({ send, onStart: vi.fn(), onResult: vi.fn() });
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    autosave.touch(named("Ch"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(1);
    resolveFirst(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual(named("Ch"));
  });

  it("reports a 400 and keeps scheduling: the next touch sends again", async () => {
    const refused: SendResult = { ok: false, message: "The name is too long.", terminal: false };
    const { send, onResult, autosave } = harness([refused]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith(refused, expect.anything());
    autosave.touch(named("Ch"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops for good after a terminal failure (the cat was deleted)", async () => {
    const gone: SendResult = { ok: false, message: "This cat was deleted.", terminal: true };
    const { send, onResult, autosave } = harness([gone]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith(gone, expect.anything());
    autosave.touch(named("Ch"));
    await vi.advanceTimersByTimeAsync(6000);
    autosave.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps a document whose save failed: flush sends it again", async () => {
    const down: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    const { send, onResult, autosave } = harness([down]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith(down, expect.anything());
    autosave.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(named("C"), true);
  });

  it("after a failure the next touch sends the newest document, not the failed one", async () => {
    const down: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    const { send, autosave } = harness([down]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    autosave.touch(named("Ch"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(named("Ch"), false);
  });

  it("after a failure the ceiling timer resends by itself, backing off while it keeps failing", async () => {
    const down: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    const { send, onResult, autosave } = harness([down, down, down]);
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    // First retry after the max wait; the second after twice that; each with the same doc.
    await vi.advanceTimersByTimeAsync(4999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(named("C"), false);
    // Storage is back: the next retry lands and nothing more is sent.
    await vi.advanceTimersByTimeAsync(20000);
    expect(send).toHaveBeenCalledTimes(4);
    expect(onResult).toHaveBeenLastCalledWith(OK, expect.anything());
    await vi.advanceTimersByTimeAsync(60000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("caps the backoff at thirty seconds", async () => {
    const down: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    const { send, autosave } = harness(Array.from({ length: 6 }, () => down));
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    // 5 s, 10 s, 20 s, then 30 s, 30 s.
    for (const wait of [5000, 10000, 20000, 30000, 30000]) {
      const before = send.mock.calls.length;
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(send).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(before + 1);
    }
  });

  it("never lets a stale ceiling timer force an unscheduled send", async () => {
    vi.setSystemTime(0);
    const down: SendResult = { ok: false, message: RETRY_MESSAGE, terminal: false };
    let resolveFirst: (result: SendResult) => void = () => undefined;
    const times: number[] = [];
    const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
    send.mockImplementation(() => {
      times.push(Date.now());
      return Promise.resolve(down);
    });
    send.mockImplementationOnce(() => {
      times.push(Date.now());
      return new Promise((resolve) => (resolveFirst = resolve));
    });
    const autosave = createAutosave({ send, onStart: vi.fn(), onResult: vi.fn() });
    autosave.touch(named("A"));
    await vi.advanceTimersByTimeAsync(1000); // send #1 at 1000, held in flight
    await vi.advanceTimersByTimeAsync(500);
    autosave.touch(named("B")); // 1500: a fresh debounce (2500) and ceiling (6500)
    await vi.advanceTimersByTimeAsync(500);
    resolveFirst(down); // 2000: #1 fails → retry armed for 7000
    await vi.advanceTimersByTimeAsync(500); // 2500: debounce sends #2, which fails → retry at 12500
    expect(times).toEqual([1000, 2500]);
    await vi.advanceTimersByTimeAsync(9999); // through 6500 and 7000: nothing may fire
    expect(times).toEqual([1000, 2500]);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toEqual([1000, 2500, 12500]);
  });

  it("keeps the five-second ceiling after one fired during an in-flight send", async () => {
    vi.setSystemTime(0);
    let resolveFirst: (result: SendResult) => void = () => undefined;
    const times: number[] = [];
    const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
    send.mockImplementation(() => {
      times.push(Date.now());
      return Promise.resolve(OK);
    });
    send.mockImplementationOnce(() => {
      times.push(Date.now());
      return new Promise((resolve) => (resolveFirst = resolve));
    });
    const autosave = createAutosave({ send, onStart: vi.fn(), onResult: vi.fn() });
    autosave.touch(named("A"));
    await vi.advanceTimersByTimeAsync(1000); // send #1 at 1000, held
    for (let i = 0; i < 12; i += 1) {
      await vi.advanceTimersByTimeAsync(500);
      autosave.touch(named(`B${i}`)); // 1500 … 7000: the ceiling armed at 1500 fires at 6500, in flight
    }
    resolveFirst(OK); // 7000: #1 lands, the pending B11 goes at once
    await vi.advanceTimersByTimeAsync(0);
    expect(times).toEqual([1000, 7000]);
    for (let i = 0; i < 12; i += 1) {
      await vi.advanceTimersByTimeAsync(500);
      autosave.touch(named(`C${i}`)); // 7500 … 13000: continuous edits, so the ceiling must send
    }
    expect(times).toEqual([1000, 7000, 12500]);
  });

  it("keeps keepalive for a flush asked for while a send is in flight", async () => {
    let resolveFirst: (result: SendResult) => void = () => undefined;
    const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
    send.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    send.mockResolvedValue(OK);
    const autosave = createAutosave({ send, onStart: vi.fn(), onResult: vi.fn() });
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    autosave.touch(named("Ch"));
    autosave.flush();
    expect(send).toHaveBeenCalledTimes(1);
    resolveFirst(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(named("Ch"), true);
    // The flag is spent: a later ordinary send is not keepalive.
    autosave.touch(named("Cha"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenLastCalledWith(named("Cha"), false);
  });

  it("does not send a document that is already on its way", async () => {
    const { send, autosave } = harness();
    autosave.touch(named("C"));
    autosave.flush();
    autosave.flush();
    await vi.advanceTimersByTimeAsync(6000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush settles with the outcome of the send it caused, or null when nothing was pending", async () => {
    const failed: SendResult = { ok: false, message: "The name is too long.", terminal: false };
    const { autosave } = harness([OK, failed]);
    await expect(autosave.flush()).resolves.toBeNull();
    autosave.touch(named("C"));
    await expect(autosave.flush()).resolves.toEqual(OK);
    autosave.touch(named("Ch"));
    await expect(autosave.flush()).resolves.toEqual(failed);
  });

  it("flush during an in-flight send settles after the follow-up send that carries the newer document", async () => {
    let resolveFirst: (result: SendResult) => void = () => undefined;
    const send = vi.fn<(doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>>();
    send.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const second: SendResult = { ok: true, updatedAt: "2026-09-11T11:00:00.000Z" };
    send.mockResolvedValue(second);
    const autosave = createAutosave({ send, onStart: vi.fn(), onResult: vi.fn() });
    autosave.touch(named("C"));
    await vi.advanceTimersByTimeAsync(1000);
    autosave.touch(named("Ch"));
    const settled = autosave.flush();
    resolveFirst(OK);
    await expect(settled).resolves.toEqual(second);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("sendDraft", () => {
  const fetchSpy = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs the whole document as JSON and answers the stamp", async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ updatedAt: "2026-09-11T10:00:00.000Z" }));
    const result = await sendDraft(DOC, false);
    expect(result).toEqual({ ok: true, updatedAt: "2026-09-11T10:00:00.000Z" });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/profiles/abcdefgh/draft");
    expect(init?.method).toBe("PUT");
    expect(init?.keepalive).toBe(false);
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual(DOC);
  });

  it("passes keepalive through for the pagehide send", async () => {
    fetchSpy.mockResolvedValueOnce(Response.json({ updatedAt: "2026-09-11T10:00:00.000Z" }));
    await sendDraft(DOC, true);
    expect(fetchSpy.mock.calls[0]?.[1]?.keepalive).toBe(true);
  });

  it("reports a 400 in the server's words, not terminal", async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { error: { code: "invalid", message: "The name is too long." } },
        { status: 400 },
      ),
    );
    expect(await sendDraft(DOC, false)).toEqual({
      ok: false,
      message: "The name is too long.",
      terminal: false,
    });
  });

  it("reports a 404 as the cat being deleted, terminal", async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { error: { code: "not_found", message: "There's no cat with that id." } },
        { status: 404 },
      ),
    );
    expect(await sendDraft(DOC, false)).toEqual({
      ok: false,
      message: "This cat was deleted.",
      terminal: true,
    });
  });

  it("reports a network failure as a retry, not terminal", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await sendDraft(DOC, false)).toEqual({
      ok: false,
      message: "Couldn't save. Your change is kept here and will be sent again.",
      terminal: false,
    });
  });

  it("reports a 5xx as a retry even when the body carries a sentence", async () => {
    fetchSpy.mockResolvedValueOnce(
      Response.json(
        { error: { code: "upstream", message: "The storage service didn't respond." } },
        { status: 502 },
      ),
    );
    expect(await sendDraft(DOC, false)).toEqual({
      ok: false,
      message: "Couldn't save. Your change is kept here and will be sent again.",
      terminal: false,
    });
  });

  it("treats an answer it cannot read as a retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    expect(await sendDraft(DOC, false)).toEqual({
      ok: false,
      message: "Couldn't save. Your change is kept here and will be sent again.",
      terminal: false,
    });
  });
});
