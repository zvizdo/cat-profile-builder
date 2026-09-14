import { describe, expect, it } from "vitest";
import { UpstreamError } from "@/core/errors";
import { createScriptedDescriber } from "../../fakes/describer";
import { createScriptedVideoProcessor } from "../../fakes/video-processor";

const PROBE = { durationSeconds: 2, width: 1080, height: 1920, rotation: -90, hasAudio: true };
const TRANSCODE = {
  web: new Uint8Array([1, 2, 3]),
  poster: new Uint8Array([4]),
  durationSeconds: 2,
  width: 1080,
  height: 1920,
};

describe("createScriptedVideoProcessor", () => {
  it("answers probe and transcode with the scripted results and records the calls", async () => {
    const processor = createScriptedVideoProcessor({ probe: PROBE, transcode: TRANSCODE });
    const input = new Uint8Array([9]);
    expect(await processor.probe(input)).toEqual(PROBE);
    expect(await processor.transcode(input, { trim: { start: 1, end: 3 } })).toEqual(TRANSCODE);
    expect(await processor.transcode("/tmp/original", {})).toEqual(TRANSCODE);
    expect(processor.probeCalls).toEqual([input]);
    expect(processor.transcodeCalls).toEqual([
      { input, options: { trim: { start: 1, end: 3 } } },
      { input: "/tmp/original", options: {} },
    ]);
  });

  it("plays a queue in order and repeats the last entry once it is exhausted", async () => {
    const second = { ...PROBE, durationSeconds: 20 };
    const processor = createScriptedVideoProcessor({ probe: [PROBE, second] });
    expect(await processor.probe("a")).toEqual(PROBE);
    expect(await processor.probe("b")).toEqual(second);
    expect(await processor.probe("c")).toEqual(second);
  });

  it("throws a scripted error in place of a result", async () => {
    const failure = new UpstreamError("ffmpeg failed");
    const processor = createScriptedVideoProcessor({ transcode: [failure, TRANSCODE] });
    await expect(processor.transcode("a", {})).rejects.toBe(failure);
    expect(await processor.transcode("a", {})).toEqual(TRANSCODE);
  });

  it("fails loudly when a call has no scripted result", async () => {
    const processor = createScriptedVideoProcessor({});
    await expect(processor.probe("a")).rejects.toBeInstanceOf(UpstreamError);
    await expect(processor.transcode("a", {})).rejects.toBeInstanceOf(UpstreamError);
    const empty = createScriptedVideoProcessor({ probe: [] });
    await expect(empty.probe("a")).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("createScriptedDescriber", () => {
  const WEB = "gs://b/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4";

  it("plays its queue across photos and videos, then repeats the last result", async () => {
    const describer = createScriptedDescriber([{ text: "A cat." }, { failed: "model" }]);
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ text: "A cat." });
    expect(await describer.describeVideo(WEB)).toEqual({ failed: "model" });
    expect(await describer.describeVideo(WEB)).toEqual({ failed: "model" });
    expect(describer.photoCalls).toEqual([new Uint8Array([1])]);
    expect(describer.videoCalls).toEqual([WEB, WEB]);
  });

  it("needs at least one scripted result", () => {
    expect(() => createScriptedDescriber([])).toThrow(/at least one/);
  });
});
