import { describe, expect, it } from "vitest";
import { enhancePhoto } from "@/adapters/pipeline/enhance-photo";
import { finalizeUpload } from "@/adapters/pipeline/finalize-upload";
import { NotFoundError, RefusedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema } from "@/core/media/schema";
import { fixture, PID, pipelineDeps, type PipelineDeps } from "./helpers";
import { PROBE_20S } from "./video.helpers";

// `enhancePhoto` (ADR-016; FR-053, FR-054): the deterministic `auto-v1` recipe, run
// synchronously — no describer call — over the source's clean bytes, written as a brand
// new asset. The source is never touched: it is still there, unchanged, to enhance again.

const MID = "mmmmmmm2";
const TARGET = { profileId: PID, mediaId: MID };

async function stored(deps: PipelineDeps, mid: string) {
  return loadAsset(await deps.mediaStore.readAsset(PID, mid));
}

/** A ready photo, finalized from `dim.jpg` — the fixture the enhance recipe brightens. */
async function readyPhoto(deps: PipelineDeps) {
  await deps.mediaStore.putOriginal(PID, MID, fixture("dim.jpg"));
  const { asset } = await finalizeUpload(deps, {
    ...TARGET,
    fileName: "dim.jpg",
    declaredType: "image/jpeg",
  });
  return asset;
}

describe("enhancePhoto — the denials", () => {
  it("answers not_found for a media id with no record", async () => {
    const deps = pipelineDeps();
    await expect(enhancePhoto(deps, { ...TARGET, mediaId: "nnnnnnn2" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("answers not_found when the record's clean revision has no file behind it", async () => {
    const deps = pipelineDeps();
    const source = await readyPhoto(deps);
    // A corrupt record: it names a revision `writeDerived` never actually wrote.
    await deps.mediaStore.writeAsset(PID, MID, { ...source, revisions: { clean: "0123456789" } });
    await expect(enhancePhoto(deps, TARGET)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a video with the same wording the schema itself uses for the rule", async () => {
    const deps = pipelineDeps([{ text: "A cat on a step." }], { probe: PROBE_20S });
    await deps.mediaStore.putOriginal(PID, MID, fixture("clip-20s.mp4"));
    await finalizeUpload(deps, { ...TARGET, fileName: "long.mp4", declaredType: "video/mp4" });
    const failure = enhancePhoto(deps, TARGET);
    await expect(failure).rejects.toBeInstanceOf(RefusedError);
    await expect(failure).rejects.toMatchObject({
      code: "refused",
      message: "Only a photo can be enhanced.",
    });
  });

  it("refuses a photo that hasn't finished processing yet, with its own wording (not the video one)", async () => {
    const deps = pipelineDeps();
    const source = await readyPhoto(deps);
    // The window `finalizeUpload` itself passes through: `processing`, before the describer
    // answers — a real race a second call (or a retry) can land in, not a made-up state.
    await deps.mediaStore.writeAsset(PID, MID, { ...source, status: "processing" });
    const failure = enhancePhoto(deps, TARGET);
    await expect(failure).rejects.toBeInstanceOf(RefusedError);
    await expect(failure).rejects.toMatchObject({
      code: "refused",
      message: "That photo is still being processed. Try again in a moment.",
    });
  });
});

describe("enhancePhoto — success", () => {
  it("writes a new asset that names the source and the recipe, with alt and focal copied verbatim", async () => {
    const deps = pipelineDeps();
    const source = await readyPhoto(deps);
    // A non-default focal point, so copying it verbatim is actually observable.
    await deps.mediaStore.writeAsset(PID, MID, { ...source, focal: { x: 30, y: 70 } });

    const { asset } = await enhancePhoto(deps, TARGET);

    expect(asset.id).not.toBe(MID);
    expect(asset).toMatchObject({
      kind: "photo",
      status: "ready",
      width: source.width,
      height: source.height,
      focal: { x: 30, y: 70 },
      alt: source.alt,
      enhancement: { sourceMediaId: MID, recipe: "auto-v1" },
    });
    expect(MediaAssetSchema.safeParse(asset).success).toBe(true);
    expect(await stored(deps, asset.id)).toEqual(asset);
    // The source is untouched: still there, unchanged, to enhance again.
    expect(await stored(deps, MID)).toMatchObject({ focal: { x: 30, y: 70 }, status: "ready" });
    expect(asset.revisions.clean).toBeDefined();
    expect(asset.revisions.clean).not.toBe(source.revisions.clean);
  });

  it("enhancing an already-enhanced photo is allowed — the source is that asset, no special case", async () => {
    const deps = pipelineDeps();
    await readyPhoto(deps);
    const once = await enhancePhoto(deps, TARGET);
    const twice = await enhancePhoto(deps, { profileId: PID, mediaId: once.asset.id });

    expect(twice.asset.enhancement).toEqual({ sourceMediaId: once.asset.id, recipe: "auto-v1" });
    expect(twice.asset.id).not.toBe(once.asset.id);
  });

  it("mints a fresh media id each time, never reusing the source's", async () => {
    const deps = pipelineDeps();
    await readyPhoto(deps);
    const first = await enhancePhoto(deps, TARGET);
    const second = await enhancePhoto(deps, TARGET);
    expect(first.asset.id).not.toBe(second.asset.id);
  });
});
