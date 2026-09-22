import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/core/media/validation";
import {
  ACCEPTED_TYPES,
  screenFile,
  UPLOAD_FAILED,
  uploadFile,
  UploadFailure,
} from "@/ui/builder/upload-client";
import { actions, ASSET, FakeXhr, PID, file, resetForTest } from "./upload-client.helpers";

// The browser's half of an upload (ADR-005): `beginUpload` → the bytes to the signed URL
// with progress → `finalizeUpload`. `XMLHttpRequest` is the one way to see upload progress,
// so it is what moves the bytes; it is faked here (`./upload-client.helpers`), and both
// signed shapes are driven — a direct `PUT` (the filesystem store) and GCS's
// `POST … x-goog-resumable: start` that answers a session URL to `PUT` to. `screenFile` is
// the client-side refusal, in core's own sentences, before `beginUpload` is ever called
// (FR-007, FR-008). Resume, retry and stall behaviour is in `upload-client.resume.test.ts`;
// reporting is in `upload-client.reports.test.ts`.

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

describe("screenFile", () => {
  it("accepts the five allowed types and lets an unnamed type through to the server's sniff", () => {
    for (const type of ACCEPTED_TYPES.split(",")) {
      expect(screenFile({ type, size: 10 })).toEqual({ ok: true });
    }
    expect(screenFile({ type: "", size: 10 })).toEqual({ ok: true });
  });

  it("refuses a type outside the lists with the accepted formats named, before any size check", () => {
    expect(screenFile({ type: "image/heic", size: LIMITS.videoBytes + 1 })).toEqual({
      ok: false,
      code: "unsupported",
      message:
        "We can't read that file. Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
    });
  });

  it("refuses a file over its kind's cap in core's sentence (FR-007)", () => {
    expect(screenFile({ type: "video/mp4", size: LIMITS.videoBytes + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That video is over 200MB.",
    });
    expect(screenFile({ type: "image/jpeg", size: LIMITS.photoBytes + 1 })).toEqual({
      ok: false,
      code: "too_large",
      message: "That photo is over 25MB.",
    });
    expect(screenFile({ type: "image/jpeg", size: LIMITS.photoBytes })).toEqual({ ok: true });
  });

  it("lists every accepted type for the picker's accept attribute", () => {
    expect(ACCEPTED_TYPES).toBe("image/jpeg,image/png,image/webp,video/mp4,video/quicktime");
  });
});

describe("uploadFile", () => {
  it("PUTs the file to the signed URL with its headers, maps progress, then finalizes with the name and type", async () => {
    actions.beginUpload.mockResolvedValueOnce({
      ok: true,
      mediaId: "maaaaaab",
      uploadUrl: "/api/dev-upload/abcdefgh/maaaaaab",
      method: "PUT",
      headers: { "x-test": "1" },
    });
    actions.finalizeUpload.mockResolvedValueOnce({ ok: true, asset: ASSET, warnings: ["soft"] });
    const onProgress = vi.fn();

    const result = await uploadFile({ profileId: PID, file, onProgress });

    expect(actions.beginUpload).toHaveBeenCalledWith({
      profileId: PID,
      fileName: "rain-day.mov",
      byteSize: 50,
      declaredType: "video/quicktime",
    });
    expect(FakeXhr.instances).toHaveLength(1);
    const xhr = FakeXhr.instances[0];
    expect(xhr?.method).toBe("PUT");
    expect(xhr?.url).toBe("/api/dev-upload/abcdefgh/maaaaaab");
    expect(xhr?.headers).toEqual({ "x-test": "1" });
    expect(xhr?.body).toBe(file);
    expect(onProgress.mock.calls).toEqual([[68], [100]]);
    expect(actions.finalizeUpload).toHaveBeenCalledWith({
      profileId: PID,
      mediaId: "maaaaaab",
      fileName: "rain-day.mov",
      declaredType: "video/quicktime",
    });
    expect(result).toEqual({ ok: true, asset: ASSET, warnings: ["soft"] });
  });

  it("starts a GCS resumable session with POST and PUTs the bytes to the session URL it answers", async () => {
    actions.beginUpload.mockResolvedValueOnce({
      ok: true,
      mediaId: "maaaaaab",
      uploadUrl: "https://storage.googleapis.com/signed",
      method: "POST",
      headers: { "x-goog-resumable": "start", "x-goog-content-length-range": "0,50" },
    });
    FakeXhr.replies = [
      { status: 201, headers: { Location: "https://storage.googleapis.com/session" } },
    ];
    actions.finalizeUpload.mockResolvedValueOnce({ ok: true, asset: ASSET, warnings: [] });

    await uploadFile({ profileId: PID, file, onProgress: vi.fn() });

    const [start, bytes] = FakeXhr.instances;
    expect(start).toMatchObject({
      method: "POST",
      url: "https://storage.googleapis.com/signed",
      headers: { "x-goog-resumable": "start", "x-goog-content-length-range": "0,50" },
      body: null,
    });
    expect(bytes).toMatchObject({
      method: "PUT",
      url: "https://storage.googleapis.com/session",
      headers: {},
      body: file,
    });
  });

  it("fails in beginUpload's own words, with its code, and moves no bytes", async () => {
    actions.beginUpload.mockResolvedValueOnce({
      ok: false,
      error: { code: "too_large", message: "That video is over 200MB." },
    });

    const failure = await uploadFile({ profileId: PID, file, onProgress: vi.fn() }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UploadFailure);
    expect(failure).toMatchObject({ code: "too_large", message: "That video is over 200MB." });
    expect(FakeXhr.instances).toHaveLength(0);
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
  });

  it("reports a transport failure as `Upload failed. Nothing was added.` and never finalizes", async () => {
    actions.beginUpload.mockResolvedValueOnce({
      ok: true,
      mediaId: "maaaaaab",
      uploadUrl: "/api/dev-upload/abcdefgh/maaaaaab",
      method: "PUT",
      headers: {},
    });
    FakeXhr.replies = [{ status: 0, error: true }];

    await expect(uploadFile({ profileId: PID, file, onProgress: vi.fn() })).rejects.toMatchObject({
      code: "network",
      message: UPLOAD_FAILED,
    });
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
  });

  it("treats a non-2xx upload answer, and a session with no Location, as the same failure", async () => {
    const begun = {
      ok: true as const,
      mediaId: "maaaaaab",
      uploadUrl: "/u",
      method: "PUT" as const,
      headers: {},
    };
    actions.beginUpload.mockResolvedValueOnce(begun);
    FakeXhr.replies = [{ status: 413 }];
    await expect(uploadFile({ profileId: PID, file, onProgress: vi.fn() })).rejects.toMatchObject({
      code: "network",
      message: UPLOAD_FAILED,
    });

    actions.beginUpload.mockResolvedValueOnce({ ...begun, method: "POST" });
    FakeXhr.replies = [{ status: 201 }];
    await expect(uploadFile({ profileId: PID, file, onProgress: vi.fn() })).rejects.toMatchObject({
      code: "network",
      message: UPLOAD_FAILED,
    });
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
    expect(actions.reportUploadEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "start", outcome: "failed", status: 201 }),
    );
  });

  it("fails in finalizeUpload's words and code when the server refuses the bytes", async () => {
    actions.beginUpload.mockResolvedValueOnce({
      ok: true,
      mediaId: "maaaaaab",
      uploadUrl: "/u",
      method: "PUT",
      headers: {},
    });
    actions.finalizeUpload.mockResolvedValueOnce({
      ok: false,
      error: { code: "unsupported", message: "We can't read that file." },
    });

    await expect(uploadFile({ profileId: PID, file, onProgress: vi.fn() })).rejects.toMatchObject({
      code: "unsupported",
      message: "We can't read that file.",
    });
  });
});
