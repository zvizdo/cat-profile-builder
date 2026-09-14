import { describe, expect, it } from "vitest";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { UnsupportedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { revOf } from "@/core/media/rev";
import { MediaAssetSchema } from "@/core/media/schema";
import { fixture, NOW, PID, pipelineDeps, type PipelineDeps } from "./helpers";
import { POSTER_BYTES, PROBE_2S, PROBE_20S, TRANSCODED_2S, WEB_BYTES } from "./video.helpers";

// The video branch of `finalizeUpload` (ADR-006; FR-077, FR-078, FR-079, FR-085): a short
// original is transcoded whole and described from its web clip; a long one stops at
// `needs-trim` with nothing produced; every failure deletes the object and the record. The
// processor is scripted — no ffmpeg runs here — so the tests pin what the pipeline asks of
// it, not what it answers.

const MID = "mmmmmmm2";

function input(overrides: Partial<Parameters<typeof finalizeUpload>[1]> = {}) {
  return {
    profileId: PID,
    mediaId: MID,
    fileName: "charlotte.mp4",
    declaredType: "video/mp4",
    ...overrides,
  };
}

async function uploaded(deps: PipelineDeps, bytes: Uint8Array) {
  await deps.mediaStore.putOriginal(PID, MID, bytes);
}

async function remains(deps: PipelineDeps) {
  return {
    asset: await deps.mediaStore.readAsset(PID, MID),
    original: await deps.mediaStore.originalSize(PID, MID),
    listed: await deps.mediaStore.listMedia(PID),
  };
}

describe("finalizeUpload — a short video", () => {
  it("transcodes it whole, writes web and poster, and describes the web clip only", async () => {
    const deps = pipelineDeps([{ text: "A grey cat jumps onto a step." }], {
      probe: PROBE_2S,
      transcode: TRANSCODED_2S,
    });
    await uploaded(deps, fixture("clip-2s.mp4"));

    const result = await finalizeUpload(deps, input());

    expect(result.warnings).toEqual([]);
    const { asset } = result;
    expect(asset).toEqual({
      schemaVersion: 1,
      id: MID,
      kind: "video",
      fileName: "charlotte.mp4",
      mimeType: "video/mp4",
      bytes: fixture("clip-2s.mp4").byteLength,
      width: 1080,
      height: 1920,
      durationSeconds: 2,
      originalDurationSeconds: 2,
      focal: { x: 50, y: 50 },
      status: "ready",
      alt: { text: "A grey cat jumps onto a step.", source: "model" },
      descriptionStatus: "ready",
      revisions: { web: revOf(WEB_BYTES), poster: revOf(POSTER_BYTES) },
      createdAt: NOW,
    });
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
    expect(await deps.mediaStore.readDerived(PID, MID, "web", revOf(WEB_BYTES))).toEqual(WEB_BYTES);
    expect(await deps.mediaStore.readDerived(PID, MID, "poster", revOf(POSTER_BYTES))).toEqual(
      POSTER_BYTES,
    );

    // The processor saw a path to the spooled original, untrimmed; the describer saw the
    // finished web clip's gs:// URI and never the original (FR-079).
    expect(deps.videoProcessor.transcodeCalls).toHaveLength(1);
    expect(deps.videoProcessor.transcodeCalls[0]).toMatchObject({ options: {} });
    expect(typeof deps.videoProcessor.transcodeCalls[0]?.input).toBe("string");
    expect(deps.describer.videoCalls).toEqual([
      `gs://memory-public/profiles/${PID}/media/${MID}/web.${revOf(WEB_BYTES)}.mp4`,
    ]);
    expect(deps.describer.photoCalls).toEqual([]);
  });

  it("accepts a MOV-declared upload of MP4 bytes — the sniff decides the type", async () => {
    const deps = pipelineDeps(undefined, { probe: PROBE_2S, transcode: TRANSCODED_2S });
    await uploaded(deps, fixture("clip-2s.mp4"));
    const { asset } = await finalizeUpload(deps, input({ declaredType: "video/quicktime" }));
    expect(asset).toMatchObject({ kind: "video", mimeType: "video/mp4", status: "ready" });
  });

  it("keeps the clip when only the poster failed: ready, web set, no poster (ADR-006)", async () => {
    const deps = pipelineDeps(undefined, {
      probe: PROBE_2S,
      transcode: { ...TRANSCODED_2S, poster: null },
    });
    await uploaded(deps, fixture("clip-2s.mp4"));
    const { asset } = await finalizeUpload(deps, input());
    expect(asset.status).toBe("ready");
    expect(asset.revisions).toEqual({ web: revOf(WEB_BYTES) });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
  });

  it("leaves the clip ready with no description when the describer fails (FR-073)", async () => {
    const deps = pipelineDeps([{ failed: "timeout" }], {
      probe: PROBE_2S,
      transcode: TRANSCODED_2S,
    });
    await uploaded(deps, fixture("clip-2s.mp4"));
    const { asset } = await finalizeUpload(deps, input());
    expect(asset).toMatchObject({ status: "ready", alt: null, descriptionStatus: "failed" });
    expect(deps.logger.entries.find((entry) => entry.level === "warn")).toMatchObject({
      fields: { pid: PID, mid: MID, reason: "timeout" },
    });
  });
});

describe("finalizeUpload — a long video (FR-078)", () => {
  it("stops at needs-trim: no transcode, no derived file, no describer call", async () => {
    const deps = pipelineDeps(undefined, { probe: PROBE_20S });
    await uploaded(deps, fixture("clip-20s.mp4"));

    const { asset, warnings } = await finalizeUpload(deps, input({ fileName: "long.mp4" }));

    expect(warnings).toEqual([]);
    expect(asset).toMatchObject({
      kind: "video",
      status: "needs-trim",
      originalDurationSeconds: 20,
      width: 406,
      height: 720,
      alt: null,
      descriptionStatus: "pending",
      revisions: {},
    });
    expect(asset.durationSeconds).toBeUndefined();
    expect(asset.trim).toBeUndefined();
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
    expect(deps.describer.videoCalls).toEqual([]);
    expect(await deps.mediaStore.originalSize(PID, MID)).toBe(fixture("clip-20s.mp4").byteLength);
  });

  it("cannot be finalized again — trimVideo is the way forward, and nothing is deleted", async () => {
    const deps = pipelineDeps(undefined, { probe: PROBE_20S });
    await uploaded(deps, fixture("clip-20s.mp4"));
    const { asset } = await finalizeUpload(deps, input({ fileName: "long.mp4" }));

    await expect(finalizeUpload(deps, input({ fileName: "long.mp4" }))).rejects.toMatchObject({
      code: "refused",
      message: "This file was already added.",
    });
    expect(loadAsset(await deps.mediaStore.readAsset(PID, MID))).toEqual(asset);
    expect(await deps.mediaStore.originalSize(PID, MID)).toBe(fixture("clip-20s.mp4").byteLength);
    expect(deps.videoProcessor.probeCalls).toHaveLength(1);
  });

  it("records the upright dimensions of a portrait original (rotation applied)", async () => {
    const deps = pipelineDeps(undefined, { probe: { ...PROBE_2S, durationSeconds: 30 } });
    await uploaded(deps, fixture("clip-2s.mp4"));
    const { asset } = await finalizeUpload(deps, input());
    expect(asset).toMatchObject({ status: "needs-trim", width: 1080, height: 1920 });
  });

  it("transcodes an original of exactly 15 s whole — the limit is inclusive", async () => {
    const deps = pipelineDeps(undefined, {
      probe: { ...PROBE_20S, durationSeconds: 15 },
      transcode: { ...TRANSCODED_2S, durationSeconds: 15 },
    });
    await uploaded(deps, fixture("clip-20s.mp4"));
    const { asset } = await finalizeUpload(deps, input());
    expect(asset).toMatchObject({ status: "ready", durationSeconds: 15 });
  });
});

describe("finalizeUpload — video failures delete the object", () => {
  it("a transcode failure removes the object and the record, naming the file, keeping the cause", async () => {
    const fromFfmpeg = new UnsupportedError("We couldn't process that video.");
    const deps = pipelineDeps(undefined, { probe: PROBE_2S, transcode: fromFfmpeg });
    await uploaded(deps, fixture("clip-2s.mp4"));
    const failure = finalizeUpload(deps, input({ fileName: "charlotte.mp4" }));
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({
      code: "unsupported",
      message: "We couldn't process charlotte.mp4. Nothing was added.",
      cause: fromFfmpeg,
    });
    expect(await remains(deps)).toEqual({ asset: null, original: null, listed: [] });
    expect(deps.describer.videoCalls).toEqual([]);
  });

  it("a probe failure is unsupported and removes the object", async () => {
    const deps = pipelineDeps(undefined, {
      probe: new UnsupportedError("We can't read that file."),
    });
    await uploaded(deps, fixture("clip-2s.mp4"));
    await expect(finalizeUpload(deps, input())).rejects.toMatchObject({ code: "unsupported" });
    expect(await remains(deps)).toEqual({ asset: null, original: null, listed: [] });
  });

  it("refuses a video over 200 MB by its real size before probing", async () => {
    const deps = pipelineDeps(undefined, { probe: PROBE_2S });
    await uploaded(deps, fixture("clip-2s.mp4"));
    deps.mediaStore.originalSize = async () => 200 * 1024 * 1024 + 1;
    await expect(finalizeUpload(deps, input())).rejects.toMatchObject({
      code: "too_large",
      message: "That video is over 200MB.",
    });
    expect(deps.videoProcessor.probeCalls).toEqual([]);
    expect(await deps.mediaStore.readAsset(PID, MID)).toBeNull();
  });
});
