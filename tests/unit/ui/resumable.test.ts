import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRetryable,
  isSuccess,
  parseResumeOffset,
  resumeRange,
  RETRY_DELAYS_MS,
  STALL_MS,
  statusCheckRange,
  wait,
} from "@/ui/builder/resumable";

// The rules of resuming a GCS resumable upload (spec 2026-09-22, §2): what a status check's
// answer means, which failures earn a retry, and the Content-Range each request carries.

afterEach(() => {
  vi.useRealTimers();
});

describe("retry rules", () => {
  it("waits 1 s, 4 s, then 15 s — three retries — and gives up on a request stalled 30 s", () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 4000, 15000]);
    expect(STALL_MS).toBe(30_000);
  });

  it("retries no answer, a timeout, a rate limit and a 5xx — never another 4xx or a success", () => {
    for (const status of [0, 408, 429, 500, 503, 599])
      expect(isRetryable(status), `${status}`).toBe(true);
    for (const status of [200, 308, 400, 403, 404, 410])
      expect(isRetryable(status), `${status}`).toBe(false);
  });

  it("counts only a 2xx as success", () => {
    expect(isSuccess(200)).toBe(true);
    expect(isSuccess(201)).toBe(true);
    expect(isSuccess(299)).toBe(true);
    expect(isSuccess(308)).toBe(false);
    expect(isSuccess(0)).toBe(false);
  });
});

describe("parseResumeOffset", () => {
  it("resumes after the last byte storage has when it answers 308 with a Range", () => {
    expect(parseResumeOffset(308, "bytes=0-19", 50)).toEqual({ offset: 20 });
    expect(parseResumeOffset(308, " bytes=0-0 ", 50)).toEqual({ offset: 1 });
  });

  it("resumes from the first byte when a 308 carries no Range (nothing arrived)", () => {
    expect(parseResumeOffset(308, null, 50)).toEqual({ offset: 0 });
  });

  it("checks again when a 308 says every byte arrived but the object is not complete yet", () => {
    expect(parseResumeOffset(308, "bytes=0-49", 50)).toEqual({ retry: true });
  });

  it("is done when the status check answers 2xx — the object is complete", () => {
    expect(parseResumeOffset(200, null, 50)).toEqual({ done: true });
    expect(parseResumeOffset(201, null, 50)).toEqual({ done: true });
  });

  it("asks for another retry when the status check itself got no answer, a 429 or a 5xx", () => {
    expect(parseResumeOffset(0, null, 50)).toEqual({ retry: true });
    expect(parseResumeOffset(429, null, 50)).toEqual({ retry: true });
    expect(parseResumeOffset(503, null, 50)).toEqual({ retry: true });
  });

  it("fails on a gone session, any other 4xx, or a Range it cannot read", () => {
    expect(parseResumeOffset(404, null, 50)).toEqual({ fail: true });
    expect(parseResumeOffset(410, null, 50)).toEqual({ fail: true });
    expect(parseResumeOffset(308, "bytes=5-19", 50)).toEqual({ fail: true });
    expect(parseResumeOffset(308, "items=0-19", 50)).toEqual({ fail: true });
  });
});

describe("Content-Range values", () => {
  it("asks for status with an unknown range over the whole size", () => {
    expect(statusCheckRange(50)).toBe("bytes */50");
  });

  it("names the rest of the file from the offset", () => {
    expect(resumeRange(20, 50)).toBe("bytes 20-49/50");
    expect(resumeRange(0, 50)).toBe("bytes 0-49/50");
  });
});

describe("wait", () => {
  it("resolves after the given milliseconds", async () => {
    vi.useFakeTimers();
    let done = false;
    const waiting = wait(1000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });
});
