import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_FAILED, uploadFile } from "@/ui/builder/upload-client";
import {
  actions,
  FakeXhr,
  GCS,
  landed,
  noSleep,
  PID,
  resetForTest,
  SESSION,
  started,
  file,
} from "./upload-client.helpers";

// Every upload failure — and every rescue by retry — is reported to the server log with
// `reportUploadEvent`, since the browser → storage step is invisible to the server
// otherwise (spec 2026-09-22, §3). A report is held, then flushed: a failure at once, a
// rescue after `finalizeUpload` so its report never queues ahead of it, and a report that
// could not be sent is held again and goes out after the next upload that lands.
// screenFile and the plain happy-path/failure cases are in `upload-client.test.ts`; resume
// and stall behaviour is in `upload-client.resume.test.ts`.

vi.mock("@/app/actions/media", () => ({
  beginUpload: (input: unknown) => actions.beginUpload(input),
  finalizeUpload: (input: unknown) => actions.finalizeUpload(input),
  reportUploadEvent: (input: unknown) => actions.reportUploadEvent(input),
}));

beforeEach(() => {
  resetForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("uploadFile: reporting", () => {
  it("resumes a dropped PUT from the byte storage confirmed, and reports the rescue after finalize", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [
      started,
      { status: 0, error: true, sent: 45 },
      { status: 308, headers: { Range: "bytes=0-19" } },
      { status: 200 },
    ];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();
    const onProgress = vi.fn();

    await uploadFile({ profileId: PID, file, onProgress, sleep });

    const [, first, check, resumed] = FakeXhr.instances;
    expect(first).toMatchObject({ method: "PUT", url: SESSION, body: file });
    expect(check).toMatchObject({
      method: "PUT",
      url: SESSION,
      headers: { "Content-Range": "bytes */50" },
      body: null,
    });
    expect(resumed?.headers).toEqual({ "Content-Range": "bytes 20-49/50" });
    expect((resumed?.body as Blob).size).toBe(30);
    expect((resumed?.body as Blob).type).toBe("video/quicktime");
    expect(sleep.mock.calls).toEqual([[1000]]);
    // 45 of 50 showed 90%; the resend from byte 20 passes 40 (80%) silently — never backwards.
    expect(onProgress.mock.calls).toEqual([[90], [100]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith({
      profileId: PID,
      mediaId: "maaaaaab",
      stage: "send",
      outcome: "resumed",
      status: 200,
      byteSize: 50,
      declaredType: "video/quicktime",
      confirmedBytes: 50,
      attempts: 2,
    });
    const [finalized] = actions.finalizeUpload.mock.invocationCallOrder;
    const [reported] = actions.reportUploadEvent.mock.invocationCallOrder;
    expect(finalized).toBeLessThan(reported ?? 0);
  });

  it("does not retry a 4xx, fails with the usual toast, and reports it", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 403 }];
    const sleep = noSleep();

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep }),
    ).rejects.toMatchObject({ code: "network", message: UPLOAD_FAILED });

    expect(sleep).not.toHaveBeenCalled();
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "send", outcome: "failed", status: 403, attempts: 1 }),
    );
  });

  it("reports a finalize call that never answered, then fails as before", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "finalize",
        outcome: "failed",
        status: 0,
        confirmedBytes: 50,
      }),
    );
  });

  it("keeps a report it could not send and sends it after the next upload lands", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 403 }];
    actions.reportUploadEvent.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() }),
    ).rejects.toMatchObject({ message: UPLOAD_FAILED });
    expect(actions.reportUploadEvent).toHaveBeenCalledTimes(1);

    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });

    expect(actions.reportUploadEvent).toHaveBeenCalledTimes(2);
    expect(actions.reportUploadEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "send", outcome: "failed", status: 403 }),
    );
  });

  it("sends no report for an upload that worked first time", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });
    expect(actions.reportUploadEvent).not.toHaveBeenCalled();
  });
});
