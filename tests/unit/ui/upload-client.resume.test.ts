import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STALL_MS } from "@/ui/builder/resumable";
import { uploadFile } from "@/ui/builder/upload-client";
import type { Reply } from "./upload-client.helpers";
import {
  actions,
  dropped,
  FakeXhr,
  GCS,
  landed,
  noSleep,
  PID,
  resetForTest,
  started,
  file,
} from "./upload-client.helpers";

// Resuming a dropped or stalled GCS upload (spec 2026-09-22, §2): a status check after a
// drop or a stall, a resend from the byte storage confirmed, up to three retries at 1 s,
// 4 s and 15 s. The stall watchdog (`STALL_MS`, `./resumable`) turns a hung mobile
// connection — which may never report an error — into a retry instead of a long wait.
// screenFile and the plain happy-path/failure cases are in `upload-client.test.ts`; report
// content is asserted in `upload-client.reports.test.ts`.

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

describe("uploadFile: resume, retry and the stall watchdog", () => {
  it("resends from the first byte when the status check's 308 names no Range", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, dropped, { status: 308 }, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });

    const resumed = FakeXhr.instances[3];
    expect(resumed?.headers).toEqual({ "Content-Range": "bytes 0-49/50" });
    expect((resumed?.body as Blob).size).toBe(50);
  });

  it("goes straight to finalize when the status check says the object is complete", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, dropped, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const onProgress = vi.fn();

    await uploadFile({ profileId: PID, file, onProgress, sleep: noSleep() });

    expect(FakeXhr.instances).toHaveLength(3);
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
    // The bar reaches 100 even though no resend PUT reported the last of the file, and it
    // never moves backwards getting there.
    expect(onProgress.mock.calls.at(-1)).toEqual([100]);
    const percents = onProgress.mock.calls.map(([percent]) => percent as number);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
  });

  it("resumes an upload that stalled for 30 s with a status check and a resend", async () => {
    vi.useFakeTimers();
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [
      started,
      { status: 0, hang: true },
      { status: 308, headers: { Range: "bytes=0-19" } },
      { status: 200 },
    ];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();

    const upload = uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep });
    await vi.advanceTimersByTimeAsync(STALL_MS);
    await upload;

    expect(FakeXhr.instances[1]?.aborted).toBe(true);
    expect(sleep.mock.calls).toEqual([[1000]]);
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
  });

  it("resets the stall watchdog on progress, so a PUT longer than 30 s is not aborted", async () => {
    vi.useFakeTimers();
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [
      started,
      {
        status: 200,
        progressAt: [
          { ms: 29_000, loaded: 25 },
          { ms: 58_000, loaded: 50 },
        ],
      },
    ];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();

    const upload = uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep });
    await vi.advanceTimersByTimeAsync(60_000);
    await upload;

    const dataPuts = FakeXhr.instances.filter((instance) => instance.body === file);
    expect(dataPuts).toHaveLength(1);
    expect(dataPuts[0]?.aborted).toBe(false);
    expect(sleep).not.toHaveBeenCalled();
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
  });

  it("resends after a 308 on the resumed PUT itself, while retries remain, then finalizes", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [
      started,
      dropped,
      { status: 308, headers: { Range: "bytes=0-19" } },
      { status: 308 },
      { status: 200 },
    ];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep });

    expect(sleep.mock.calls).toEqual([[1000], [4000]]);
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
  });

  it("gives up after three retries at 1 s, 4 s and 15 s, reporting how far it got", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    const held: Reply = { status: 308, headers: { Range: "bytes=0-9" } };
    FakeXhr.replies = [started, dropped, held, dropped, held, dropped, held, dropped];
    const sleep = noSleep();

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep }),
    ).rejects.toMatchObject({ code: "network", message: "Upload failed. Nothing was added." });

    expect(sleep.mock.calls).toEqual([[1000], [4000], [15000]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "send",
        outcome: "failed",
        status: 0,
        confirmedBytes: 10,
        attempts: 4,
      }),
    );
  });

  it("retries a session start that got no answer, and reports the rescue at the start", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [dropped, started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep });

    expect(sleep.mock.calls).toEqual([[1000]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "start", outcome: "resumed", status: 201, attempts: 2 }),
    );
  });
});
