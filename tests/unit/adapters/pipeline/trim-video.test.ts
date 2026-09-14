import { describe, expect, it } from "vitest";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { clearTrim, trimVideo } from "@/adapters/pipeline/trim-video";
import { NotFoundError, RefusedError, UnsupportedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { revOf } from "@/core/media/rev";
import { MediaAssetSchema } from "@/core/media/schema";
import type { VideoScript } from "../../../fakes/video-processor";
import { fixture, PID, pipelineDeps, type PipelineDeps } from "./helpers";
import {
  POSTER_BYTES,
  POSTER_BYTES_2,
  PROBE_2S,
  PROBE_20S,
  TRANSCODED_2S,
  TRANSCODED_TRIM,
  WEB_BYTES,
  WEB_BYTES_2,
} from "./video.helpers";

// `trimVideo` and `clearTrim` (ADR-006, ADR-015; FR-077, FR-078, FR-079): the trim rule is
// `checkTrim`'s — a refusal comes back as `refused` with its words and no transcode is
// attempted; an accepted trim regenerates web, poster and alt from the clip only, under new
// revs, with the old files left in place; a failed re-trim leaves the previous revisions
// current; clearing the trim on a long original puts it back to `needs-trim`.

const MID = "mmmmmmm2";
const TARGET = { profileId: PID, mediaId: MID };

/** A long original, uploaded and finalized: `needs-trim`, nothing produced. */
async function longVideo(script: VideoScript = {}) {
  const deps = pipelineDeps([{ text: "A cat on a step." }], { probe: PROBE_20S, ...script });
  await deps.mediaStore.putOriginal(PID, MID, fixture("clip-20s.mp4"));
  const { asset } = await finalizeUpload(deps, {
    ...TARGET,
    fileName: "long.mp4",
    declaredType: "video/mp4",
  });
  return { deps, asset };
}

/** A short original, finalized whole: `ready` with web and poster. */
async function shortVideo(script: VideoScript = {}) {
  const deps = pipelineDeps([{ text: "A cat on a step." }, { text: "A cat mid-jump." }], {
    probe: PROBE_2S,
    transcode: [TRANSCODED_2S, TRANSCODED_TRIM],
    ...script,
  });
  await deps.mediaStore.putOriginal(PID, MID, fixture("clip-2s.mp4"));
  const { asset } = await finalizeUpload(deps, {
    ...TARGET,
    fileName: "clip.mp4",
    declaredType: "video/mp4",
  });
  return { deps, asset };
}

function webUri(rev: string) {
  return `gs://memory-public/profiles/${PID}/media/${MID}/web.${rev}.mp4`;
}

async function stored(deps: PipelineDeps) {
  return loadAsset(await deps.mediaStore.readAsset(PID, MID));
}

describe("trimVideo — refusals come from checkTrim and touch nothing", () => {
  it("refuses a 0.5 s range naming 1 second, with no transcode attempted", async () => {
    const { deps } = await longVideo();
    const failure = trimVideo(deps, { ...TARGET, start: 2, end: 2.5 });
    await expect(failure).rejects.toBeInstanceOf(RefusedError);
    await expect(failure).rejects.toMatchObject({
      code: "refused",
      message: "A clip must be at least 1 second.",
    });
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
    expect((await stored(deps)).status).toBe("needs-trim");
  });

  it("refuses a 16 s range naming 15 seconds, with no transcode attempted", async () => {
    const { deps } = await longVideo();
    await expect(trimVideo(deps, { ...TARGET, start: 1, end: 17 })).rejects.toMatchObject({
      code: "refused",
      message: "A clip can be at most 15 seconds.",
    });
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
  });

  it("refuses a range outside the original", async () => {
    const { deps } = await longVideo();
    await expect(trimVideo(deps, { ...TARGET, start: 15, end: 25 })).rejects.toMatchObject({
      code: "refused",
      message: "That range is outside the clip.",
    });
    expect(deps.videoProcessor.transcodeCalls).toEqual([]);
  });

  it("refuses to trim a photo, and answers not_found for an unknown id", async () => {
    const deps = pipelineDeps();
    await deps.mediaStore.putOriginal(PID, MID, fixture("cat-1.jpg"));
    await finalizeUpload(deps, { ...TARGET, fileName: "cat.jpg", declaredType: "image/jpeg" });
    await expect(trimVideo(deps, { ...TARGET, start: 0, end: 5 })).rejects.toMatchObject({
      code: "refused",
      message: "Only a clip can be trimmed.",
    });
    await expect(
      trimVideo(deps, { ...TARGET, mediaId: "nnnnnnn2", start: 0, end: 5 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(clearTrim(deps, { ...TARGET, mediaId: "nnnnnnn2" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(clearTrim(deps, TARGET)).rejects.toMatchObject({ code: "refused" });
  });
});

describe("trimVideo — an accepted trim", () => {
  it("regenerates web, poster and alt from the clip, under new revs, and is ready", async () => {
    const { deps } = await longVideo({ transcode: TRANSCODED_TRIM });

    const { asset } = await trimVideo(deps, { ...TARGET, start: 4, end: 14 });

    expect(asset).toMatchObject({
      status: "ready",
      trim: { start: 4, end: 14 },
      durationSeconds: 10,
      originalDurationSeconds: 20,
      width: 406,
      height: 720,
      alt: { text: "A cat on a step.", source: "model" },
      descriptionStatus: "ready",
      revisions: { web: revOf(WEB_BYTES_2), poster: revOf(POSTER_BYTES_2) },
    });
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(await stored(deps)).toEqual(asset);
    expect(deps.videoProcessor.transcodeCalls).toHaveLength(1);
    expect(deps.videoProcessor.transcodeCalls[0]).toMatchObject({
      options: { trim: { start: 4, end: 14 } },
    });
    expect(typeof deps.videoProcessor.transcodeCalls[0]?.input).toBe("string");
    expect(deps.describer.videoCalls).toEqual([webUri(revOf(WEB_BYTES_2))]);
  });

  it("re-trimming a ready clip writes new revs and leaves the old files readable (ADR-015)", async () => {
    const { deps, asset: before } = await shortVideo();
    expect(before.revisions).toEqual({ web: revOf(WEB_BYTES), poster: revOf(POSTER_BYTES) });

    const { asset } = await trimVideo(deps, { ...TARGET, start: 0.5, end: 1.5 });

    expect(asset.revisions).toEqual({ web: revOf(WEB_BYTES_2), poster: revOf(POSTER_BYTES_2) });
    expect(asset.revisions.web).not.toBe(before.revisions.web);
    expect(asset).toMatchObject({
      trim: { start: 0.5, end: 1.5 },
      alt: { text: "A cat mid-jump.", source: "model" },
    });
    expect(await deps.mediaStore.readDerived(PID, MID, "web", revOf(WEB_BYTES))).toEqual(WEB_BYTES);
    expect(await deps.mediaStore.readDerived(PID, MID, "web", revOf(WEB_BYTES_2))).toEqual(
      WEB_BYTES_2,
    );
    expect(deps.describer.videoCalls).toEqual([
      webUri(revOf(WEB_BYTES)),
      webUri(revOf(WEB_BYTES_2)),
    ]);
  });

  it("keeps the clip when only the poster failed on a trim", async () => {
    const { deps } = await longVideo({ transcode: { ...TRANSCODED_TRIM, poster: null } });
    const { asset } = await trimVideo(deps, { ...TARGET, start: 0, end: 10 });
    expect(asset.status).toBe("ready");
    expect(asset.revisions).toEqual({ web: revOf(WEB_BYTES_2) });
  });

  it("marks the description failed, not the trim, when the describer fails", async () => {
    const deps = pipelineDeps([{ failed: "model" }], {
      probe: PROBE_20S,
      transcode: TRANSCODED_TRIM,
    });
    await deps.mediaStore.putOriginal(PID, MID, fixture("clip-20s.mp4"));
    await finalizeUpload(deps, { ...TARGET, fileName: "long.mp4", declaredType: "video/mp4" });
    const { asset } = await trimVideo(deps, { ...TARGET, start: 0, end: 10 });
    expect(asset).toMatchObject({ status: "ready", alt: null, descriptionStatus: "failed" });
  });
});

describe("trimVideo — a failed transcode", () => {
  it("leaves the previous revisions current and refuses with the ADR sentence", async () => {
    const { deps, asset: before } = await shortVideo({
      transcode: [TRANSCODED_2S, new UnsupportedError("We couldn't process that video.")],
    });

    const failure = trimVideo(deps, { ...TARGET, start: 0.5, end: 1.5 });
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({
      message: "We couldn't process clip.mp4. Nothing was added.",
    });

    expect(await stored(deps)).toEqual(before);
    expect(await deps.mediaStore.originalSize(PID, MID)).not.toBeNull();
    expect(deps.describer.videoCalls).toEqual([webUri(revOf(WEB_BYTES))]);
  });
});

describe("trimVideo — logs the job for Cloud Run diagnostics", () => {
  // A trim can run ffmpeg for 10-25s server-side with nothing else on the wire: the only
  // way to tell, from Cloud Run logs alone, that a trim ran at all (let alone how long it
  // took or that it failed) is these lines. Ids and durations only — never a path or URL
  // (constitution: no secrets/paths in logs).
  it("logs info at the start and the end of an accepted trim, with ids and durations only", async () => {
    const { deps } = await longVideo({ transcode: TRANSCODED_TRIM });

    await trimVideo(deps, { ...TARGET, start: 4, end: 14 });

    const messages = deps.logger.entries.map((entry) => entry.msg);
    expect(messages).toContain("trim started");
    expect(messages).toContain("trim finished");
    const started = deps.logger.entries.find((entry) => entry.msg === "trim started");
    const finished = deps.logger.entries.find((entry) => entry.msg === "trim finished");
    expect(started).toMatchObject({
      level: "info",
      fields: { pid: PID, mid: MID, start: 4, end: 14 },
    });
    expect(finished).toMatchObject({
      level: "info",
      fields: { pid: PID, mid: MID, durationSeconds: 10 },
    });
    for (const entry of deps.logger.entries) {
      const values = Object.values(entry.fields);
      expect(values.some((value) => typeof value === "string" && value.includes("/"))).toBe(false);
    }
  });

  it("logs a warn naming the failure when a trim's transcode fails, and never logs it finished", async () => {
    const { deps } = await shortVideo({
      transcode: [TRANSCODED_2S, new UnsupportedError("We couldn't process that video.")],
    });

    await expect(trimVideo(deps, { ...TARGET, start: 0.5, end: 1.5 })).rejects.toBeInstanceOf(
      UnsupportedError,
    );

    const messages = deps.logger.entries.map((entry) => entry.msg);
    expect(messages).toContain("trim started");
    expect(messages).toContain("trim failed");
    expect(messages).not.toContain("trim finished");
    const failed = deps.logger.entries.find((entry) => entry.msg === "trim failed");
    expect(failed).toMatchObject({ level: "warn", fields: { pid: PID, mid: MID } });
  });

  it("does not log a trim job for a refusal checkTrim catches before any work starts", async () => {
    const { deps } = await longVideo();

    await expect(trimVideo(deps, { ...TARGET, start: 2, end: 2.5 })).rejects.toBeInstanceOf(
      RefusedError,
    );

    const messages = deps.logger.entries.map((entry) => entry.msg);
    expect(messages).not.toContain("trim started");
    expect(messages).not.toContain("trim finished");
    expect(messages).not.toContain("trim failed");
  });
});

describe("clearTrim", () => {
  it("puts a long original back to needs-trim: no trim, no web, no duration, no description", async () => {
    const { deps } = await longVideo({ transcode: TRANSCODED_TRIM });
    const trimmed = await trimVideo(deps, { ...TARGET, start: 4, end: 14 });
    expect(trimmed.asset.alt).toEqual({ text: "A cat on a step.", source: "model" });

    const { asset } = await clearTrim(deps, TARGET);

    expect(asset).toMatchObject({
      status: "needs-trim",
      revisions: {},
      alt: null,
      descriptionStatus: "pending",
    });
    expect(asset.trim).toBeUndefined();
    expect(asset.durationSeconds).toBeUndefined();
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(await stored(deps)).toEqual(asset);
    // The old files stay on disk (ADR-015); the record just no longer points at them.
    expect(await deps.mediaStore.readDerived(PID, MID, "web", revOf(WEB_BYTES_2))).toEqual(
      WEB_BYTES_2,
    );
    expect(deps.videoProcessor.transcodeCalls).toHaveLength(1);
  });

  it("re-transcodes a short original whole, as finalize did", async () => {
    const { deps } = await shortVideo({
      transcode: [TRANSCODED_2S, TRANSCODED_TRIM, TRANSCODED_2S],
    });
    await trimVideo(deps, { ...TARGET, start: 0.5, end: 1.5 });

    const { asset } = await clearTrim(deps, TARGET);

    expect(asset).toMatchObject({
      status: "ready",
      durationSeconds: 2,
      revisions: { web: revOf(WEB_BYTES), poster: revOf(POSTER_BYTES) },
    });
    expect(asset.trim).toBeUndefined();
    expect(deps.videoProcessor.transcodeCalls).toHaveLength(3);
    expect(deps.videoProcessor.transcodeCalls[2]).toMatchObject({ options: {} });
    expect(deps.describer.videoCalls).toHaveLength(3);
    expect(await stored(deps)).toEqual(asset);
  });

  it("does nothing to a clip that has no trim", async () => {
    const { deps, asset: before } = await shortVideo();
    const { asset } = await clearTrim(deps, TARGET);
    expect(asset).toEqual(before);
    expect(deps.videoProcessor.transcodeCalls).toHaveLength(1);
  });
});
