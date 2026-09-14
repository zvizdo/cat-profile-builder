import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFfmpegVideoProcessor,
  readProbe,
  ToolExitError,
} from "@/adapters/ffmpeg/video-processor";
import { InternalError, UnsupportedError } from "@/core/errors";
import { memoryLogger } from "../../../fakes/logger";

// The ffmpeg adapter against the real binaries (ADR-006: the one test above the port that
// runs ffmpeg; everything else uses the scripted fake). Tagged @ffmpeg: it runs wherever
// `ffmpeg` and `ffprobe` are on PATH — locally and in the container — and skips, saying so,
// anywhere else. The portrait fixture guards autorotate: 1920×1080 stored with a −90°
// display matrix must come out 1080×1920 with no rotation side data left to apply twice.

function ffmpegAvailable(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
}

function fixturePath(name: string): string {
  return new URL(`../../../fixtures/${name}`, import.meta.url).pathname;
}

/** What ffprobe says about `bytes`: stream types and sizes, rotation side data, duration. */
function probeBytes(bytes: Uint8Array) {
  const path = join(mkdtempSync(join(tmpdir(), "cpb-probe-")), "out");
  writeFileSync(path, bytes);
  try {
    const stdout = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_entries",
        "stream=codec_type,width,height:stream_side_data=rotation:format=duration",
        path,
      ],
      { encoding: "utf8" },
    );
    return JSON.parse(stdout) as {
      streams: Array<{
        codec_type: string;
        width?: number;
        height?: number;
        side_data_list?: Array<{ rotation?: number }>;
      }>;
      format: { duration?: string };
    };
  } finally {
    rmSync(dirname(path), { recursive: true, force: true });
  }
}

/** An executable shell script standing in for ffmpeg/ffprobe, so a failure can be staged. */
function fakeTool(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
}

/**
 * A 1 s test pattern whose audio track runs on to 1.6 s — the container says 1.6 s, the
 * picture says 1 s — encoded limited-range like a phone does. Made with ffmpeg's own
 * generators, so nothing binary is committed.
 */
function makeAudioOutrunsVideo(dir: string): string {
  const path = join(dir, "av.mp4");
  execFileSync("ffmpeg", [
    ...["-y", "-hide_banner", "-v", "error"],
    ...["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=1"],
    ...["-f", "lavfi", "-i", "sine=duration=1.6"],
    ...["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path],
  ]);
  return path;
}

describe.skipIf(!ffmpegAvailable())(
  "ffmpeg video processor (@ffmpeg — skipped: ffmpeg/ffprobe not on PATH)",
  () => {
    const logger = memoryLogger();
    const processor = createFfmpegVideoProcessor({ logger });
    const dir = mkdtempSync(join(tmpdir(), "cpb-fixture-"));
    let audioOutrunsVideo = "";
    beforeAll(() => {
      audioOutrunsVideo = makeAudioOutrunsVideo(dir);
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("probe reports the stored dimensions, the rotation tag, the duration and the audio track", async () => {
      const probe = await processor.probe(fixture("clip-2s.mp4"));
      expect(probe).toEqual({
        durationSeconds: 2,
        width: 1920,
        height: 1080,
        rotation: -90,
        hasAudio: true,
      });
      const long = await processor.probe(fixturePath("clip-20s.mp4"));
      expect(long).toMatchObject({ durationSeconds: 20, height: 720, rotation: 0, hasAudio: true });
    });

    it("probe refuses a file that is not a video as unsupported, in plain words", async () => {
      const failure = processor.probe(fixture("not-a-video.mp4"));
      await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
      await expect(failure).rejects.toMatchObject({ message: "We can't read that file." });
      await expect(processor.probe(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
        UnsupportedError,
      );
    });

    it("transcodes silent, autorotated to 1080×1920 with no rotation side data, plus a matching poster", async () => {
      const result = await processor.transcode(fixture("clip-2s.mp4"), {});
      expect(result).toMatchObject({ width: 1080, height: 1920 });
      expect(result.durationSeconds).toBeCloseTo(2, 1);

      const web = probeBytes(result.web);
      const kinds = web.streams.map((stream) => stream.codec_type);
      expect(kinds).toEqual(["video"]);
      expect(web.streams[0]).toMatchObject({ width: 1080, height: 1920 });
      expect(web.streams[0]?.side_data_list ?? []).toEqual([]);
      // faststart: the moov atom sits before the media data.
      const head = Buffer.from(result.web.subarray(0, 64)).toString("latin1");
      expect(head.indexOf("moov")).toBeGreaterThan(-1);
      expect(head.indexOf("mdat")).toBe(-1);

      expect(result.poster).not.toBeNull();
      const poster = await sharp(result.poster as Uint8Array).metadata();
      expect(poster).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
    });

    it("applies a trim: 0.5–1.5 s of the original is a clip of about one second", async () => {
      const result = await processor.transcode(fixturePath("clip-2s.mp4"), {
        trim: { start: 0.5, end: 1.5 },
      });
      expect(result.durationSeconds).toBeCloseTo(1, 1);
      const web = probeBytes(result.web);
      expect(Number(web.format.duration)).toBeCloseTo(1, 1);
      expect(web.streams.map((stream) => stream.codec_type)).toEqual(["video"]);
      expect(result.poster).not.toBeNull();
    });

    it("probe reports the picture's length, not the container's, when the audio outruns it", async () => {
      const probe = await processor.probe(audioOutrunsVideo);
      expect(probe).toMatchObject({ durationSeconds: 1, width: 320, height: 240, hasAudio: true });
    });

    it("keeps the clip and answers poster: null when the poster frame lies past the last picture", async () => {
      const before = logger.entries.length;
      const result = await processor.transcode(audioOutrunsVideo, {
        trim: { start: 0.6, end: 1.6 },
      });
      expect(result.poster).toBeNull();
      expect(result.durationSeconds).toBeCloseTo(0.4, 1);
      expect(probeBytes(result.web).streams.map((stream) => stream.codec_type)).toEqual(["video"]);
      expect(logger.entries.slice(before).map((entry) => entry.msg)).toContain(
        "poster extraction failed; clip kept without one",
      );
    });

    it("extracts a poster from limited-range video, as phones record it", async () => {
      const result = await processor.transcode(audioOutrunsVideo, {});
      expect(result.poster).not.toBeNull();
      expect(await sharp(result.poster as Uint8Array).metadata()).toMatchObject({
        format: "jpeg",
        width: 320,
        height: 240,
      });
    });

    it("an ffmpeg exit after a good probe is unsupported, with ffmpeg's words logged and kept as cause", async () => {
      const failing = memoryLogger();
      const own = createFfmpegVideoProcessor({
        ffmpegPath: fakeTool(dir, "ffmpeg-fails", 'echo "boom: bad input" >&2; exit 1'),
        logger: failing,
      });
      const failure = own.transcode(fixturePath("clip-2s.mp4"), {});
      await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
      await expect(failure).rejects.toMatchObject({
        message: "We couldn't process that video.",
        cause: expect.any(ToolExitError),
      });
      expect(failing.entries.find((entry) => entry.msg === "ffmpeg failed")).toMatchObject({
        level: "warn",
        fields: { code: 1, signal: null, stderr: expect.stringContaining("boom: bad input") },
      });
    });

    it("transcode refuses a file that is not a video and leaves no temp folder behind", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "cpb-adapter-"));
      try {
        const own = createFfmpegVideoProcessor({ tmpDir, logger: memoryLogger() });
        await expect(own.transcode(fixture("not-a-video.mp4"), {})).rejects.toBeInstanceOf(
          UnsupportedError,
        );
        await own.transcode(fixture("clip-2s.mp4"), {});
        await own.probe(fixturePath("clip-20s.mp4"));
        expect(await readdir(tmpDir)).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  },
);

describe("ffmpeg video processor — failures the tool did not choose", () => {
  const dir = mkdtempSync(join(tmpdir(), "cpb-tools-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("a missing binary is an internal error, not a refusal blamed on the file", async () => {
    const logger = memoryLogger();
    const processor = createFfmpegVideoProcessor({
      ffmpegPath: "/nonexistent/ffmpeg",
      ffprobePath: "/nonexistent/ffprobe",
      logger,
    });
    await expect(processor.probe(fixture("clip-2s.mp4"))).rejects.toBeInstanceOf(InternalError);
    await expect(processor.transcode(fixture("clip-2s.mp4"), {})).rejects.toBeInstanceOf(
      InternalError,
    );
    expect(logger.entries[0]).toMatchObject({
      level: "warn",
      msg: "ffmpeg failed",
      fields: { bin: "/nonexistent/ffprobe", code: "ENOENT" },
    });
  });

  it("a probe that exits non-zero is unsupported, with its stderr logged and kept as cause", async () => {
    const logger = memoryLogger();
    const processor = createFfmpegVideoProcessor({
      ffprobePath: fakeTool(dir, "ffprobe-fails", 'echo "moov atom not found" >&2; exit 3'),
      logger,
    });
    const failure = processor.probe(fixture("clip-2s.mp4"));
    await expect(failure).rejects.toBeInstanceOf(UnsupportedError);
    await expect(failure).rejects.toMatchObject({
      message: "We can't read that file.",
      cause: expect.any(ToolExitError),
    });
    expect(logger.entries).toEqual([
      {
        level: "warn",
        msg: "ffmpeg failed",
        fields: {
          bin: expect.stringContaining("ffprobe-fails"),
          code: 3,
          signal: null,
          stderr: "moov atom not found\n",
        },
      },
    ]);
  });

  it("a tool killed by a signal is an internal error, not the file's fault", async () => {
    const logger = memoryLogger();
    const processor = createFfmpegVideoProcessor({
      ffprobePath: fakeTool(dir, "ffprobe-dies", "kill -KILL $$"),
      logger,
    });
    const failure = processor.probe(fixture("clip-2s.mp4"));
    await expect(failure).rejects.toBeInstanceOf(InternalError);
    await expect(failure).rejects.toMatchObject({
      cause: expect.objectContaining({ signal: "SIGKILL" }),
    });
    expect(logger.entries[0]).toMatchObject({ fields: { signal: "SIGKILL" } });
  });
});

describe("readProbe — ffprobe's JSON as a probe result", () => {
  const video = { codec_type: "video", width: 320, height: 240, duration: "1.000000" };
  const audio = { codec_type: "audio", duration: "1.600000" };

  it("takes the picture's duration when the audio outruns it", () => {
    expect(readProbe({ streams: [video, audio], format: { duration: "1.600000" } })).toEqual({
      durationSeconds: 1,
      width: 320,
      height: 240,
      rotation: 0,
      hasAudio: true,
    });
  });

  it("falls back to the container's duration when the stream carries none", () => {
    const bare = { codec_type: "video", width: 320, height: 240 };
    expect(readProbe({ streams: [bare], format: { duration: "2.500000" } })).toMatchObject({
      durationSeconds: 2.5,
      hasAudio: false,
    });
  });

  it("reads the rotation tag and refuses a still image, a missing stream or bad JSON", () => {
    const tagged = { ...video, side_data_list: [{ rotation: -90 }] };
    expect(readProbe({ streams: [tagged], format: {} })).toMatchObject({ rotation: -90 });
    expect(
      readProbe({ streams: [{ codec_type: "video", width: 4, height: 4 }], format: {} }),
    ).toBeUndefined();
    expect(readProbe({ streams: [audio], format: { duration: "1.6" } })).toBeUndefined();
    expect(readProbe(undefined)).toBeUndefined();
  });
});
