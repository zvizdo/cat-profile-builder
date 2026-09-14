import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { InternalError, UnsupportedError } from "@/core/errors";
import type {
  Logger,
  ProbeResult,
  TranscodeOptions,
  TranscodeResult,
  VideoInput,
  VideoProcessor,
} from "@/core/ports";

// The VideoProcessor over the ffmpeg and ffprobe binaries (ADR-006). Every call is
// `execFile` with a fixed argument list — never a shell string, so a file name can never
// become a command. Inputs are spooled to a folder under the OS temp dir that is removed
// in `finally`, whatever happened. Every tool failure is logged with its stderr and kept as
// the `cause` of the error a caller sees, so a refusal is diagnosable after the fact. The argument sets are the ones ADR-006 names: H.264,
// no audio (`-an`, FR-085), metadata and chapters stripped after ffmpeg's default
// autorotate has applied the phone's rotation, a 1080p ceiling, `+faststart`; the poster is
// one JPEG frame at the trim start + 0.5 s.

const run = promisify(execFile);

export interface FfmpegOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  /** Where the temp folders go; the OS temp dir by default. */
  tmpDir?: string;
  /** Receives one `warn` line per tool failure (with stderr) and per poster-only failure. */
  logger?: Logger;
}

/** The one sentence for a file ffprobe cannot read as a video. */
const CANNOT_READ = "We can't read that file.";

/** The sentence for a transcode ffmpeg gave up on; the pipeline names the file. */
const CANNOT_PROCESS = "We couldn't process that video.";

/**
 * The 1080p ceiling, applied after autorotate (so `iw`/`ih` are the upright frame): the
 * long edge is capped at 1920 and the short edge at 1080 whichever way the frame stands,
 * the aspect ratio is kept, nothing is upscaled, and both edges stay even for yuv420p.
 */
const SCALE =
  "scale=w='if(gt(iw,ih),min(iw,1920),min(iw,1080))':" +
  "h='if(gt(iw,ih),min(ih,1080),min(ih,1920))':" +
  "force_original_aspect_ratio=decrease:force_divisible_by=2";

const ENCODE = [
  "-an",
  "-map_metadata",
  "-1",
  "-map_chapters",
  "-1",
  "-vf",
  SCALE,
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
];

/** The poster's output options: one frame, the clip's scale, full-range for JPEG, quality 2. */
const POSTER = ["-frames:v", "1", "-vf", `${SCALE},format=yuvj420p`, "-q:v", "2"];

/** True for a read of a file the tool never wrote (exit 0, nothing encoded). */
function isMissingFile(error: unknown): boolean {
  return ExecFailureSchema.safeParse(error).data?.code === "ENOENT";
}

/** The ffprobe JSON this adapter reads; everything else in the output is ignored. */
const ProbeOutputSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      // ffprobe prints durations as decimal strings ("2.000000").
      duration: z.coerce.number().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional(),
    }),
  ),
  format: z.object({ duration: z.coerce.number().optional() }).optional(),
});

/** Seconds as a fixed-point string ffmpeg reads exactly. */
function seconds(value: number): string {
  return value.toFixed(3);
}

/**
 * Where the poster frame is taken: half a second into the clip (FR-077), or the clip's
 * start when the clip is shorter than that.
 */
function posterAt(start: number, end: number): number {
  const at = start + 0.5;
  return at < end ? at : start;
}

/** The last part of a process's stderr kept for the log: enough to diagnose, never a dump. */
const STDERR_TAIL = 2048;

/**
 * What `execFile` rejects with: an exit code or a spawn errno in `code`, a `signal` when
 * the process was killed, and the captured stderr.
 */
const ExecFailureSchema = z.looseObject({
  code: z.union([z.number(), z.string()]).nullable().optional(),
  signal: z.string().nullable().optional(),
  killed: z.boolean().optional(),
  stderr: z.string().optional(),
});

/** The one exec failure that is the file's fault: the tool ran and said no. */
export class ToolExitError extends Error {
  constructor(bin: string, exitCode: number, options: { cause: unknown }) {
    super(`${bin} exited with ${exitCode}.`, options);
    this.name = "ToolExitError";
  }
}

/**
 * Runs one binary to completion and answers its stdout. Every failure is logged at `warn`
 * with the binary, exit code, signal and the tail of stderr, so a refusal in production can
 * be diagnosed without reproducing it. A binary that cannot be started, one that was
 * killed or signalled, or one whose output overran the buffer is an `InternalError` — the
 * deployment's problem, never the file's; a plain non-zero exit is a `ToolExitError` for
 * the caller to turn into the sentence that step means, with this error as its `cause`.
 */
async function exec(
  bin: string,
  args: string[],
  logger: Logger | undefined,
): Promise<{ stdout: string }> {
  try {
    return await run(bin, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    const failure = ExecFailureSchema.safeParse(error).data ?? {};
    const stderr = (failure.stderr ?? "").slice(-STDERR_TAIL);
    const { code, signal } = failure;
    logger?.warn({ bin, code, signal, stderr }, "ffmpeg failed");
    if (typeof code === "number" && signal == null && failure.killed !== true) {
      throw new ToolExitError(bin, code, { cause: error });
    }
    throw new InternalError(`Could not run ${bin}.`, { cause: error });
  }
}

class FfmpegVideoProcessor implements VideoProcessor {
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private readonly tmpDir: string;
  private readonly logger: Logger | undefined;

  constructor(options: FfmpegOptions) {
    this.ffmpeg = options.ffmpegPath ?? "ffmpeg";
    this.ffprobe = options.ffprobePath ?? "ffprobe";
    this.tmpDir = options.tmpDir ?? tmpdir();
    this.logger = options.logger;
  }

  async probe(input: VideoInput): Promise<ProbeResult> {
    return this.withInput(input, (path) => this.probePath(path));
  }

  async transcode(input: VideoInput, options: TranscodeOptions): Promise<TranscodeResult> {
    return this.withInput(input, async (path, dir) => {
      const source = await this.probePath(path);
      const start = options.trim?.start ?? 0;
      const end = options.trim?.end ?? source.durationSeconds;
      const web = join(dir, "web.mp4");
      const trimArgs = options.trim ? ["-ss", seconds(start), "-t", seconds(end - start)] : [];
      try {
        await exec(
          this.ffmpeg,
          ["-y", "-hide_banner", "-v", "error", ...trimArgs, "-i", path, ...ENCODE, web],
          this.logger,
        );
      } catch (error) {
        if (error instanceof ToolExitError) {
          throw new UnsupportedError(CANNOT_PROCESS, { cause: error });
        }
        throw error;
      }
      const poster = await this.poster(path, posterAt(start, end), join(dir, "poster.jpg"));
      const made = await this.probePath(web);
      return {
        web: new Uint8Array(await readFile(web)),
        poster,
        durationSeconds: made.durationSeconds,
        width: made.width,
        height: made.height,
      };
    });
  }

  /**
   * Gives `fn` a path to the input — the given path, or the bytes written to a fresh temp
   * folder — plus that folder for its own outputs, and removes the folder afterwards.
   */
  private async withInput<T>(
    input: VideoInput,
    fn: (path: string, dir: string) => Promise<T>,
  ): Promise<T> {
    const dir = await mkdtemp(join(this.tmpDir, "cpb-ffmpeg-"));
    try {
      let path: string;
      if (typeof input === "string") {
        path = input;
      } else {
        path = join(dir, "input");
        await writeFile(path, input);
      }
      return await fn(path, dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** `ffprobe` on a path, read as `unknown` and parsed; `unsupported` for anything but a video. */
  private async probePath(path: string): Promise<ProbeResult> {
    let probed: { stdout: string };
    try {
      probed = await exec(
        this.ffprobe,
        ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        this.logger,
      );
    } catch (error) {
      if (error instanceof ToolExitError) throw new UnsupportedError(CANNOT_READ, { cause: error });
      throw error;
    }
    const result = readProbe(parseJson(probed.stdout));
    if (result === undefined) throw new UnsupportedError(CANNOT_READ);
    return result;
  }

  /**
   * One JPEG frame of `path` at `at` seconds, scaled like the clip and written full-range
   * (a phone's limited-range video is not what the JPEG encoder takes as is); `null`,
   * logged at `warn`, when extraction fails or lands past the last frame and writes
   * nothing — the clip is kept without a poster (ADR-006).
   */
  private async poster(path: string, at: number, out: string): Promise<Uint8Array | null> {
    try {
      await exec(
        this.ffmpeg,
        ["-y", "-hide_banner", "-v", "error", "-ss", seconds(at), "-i", path, ...POSTER, out],
        this.logger,
      );
      return new Uint8Array(await readFile(out));
    } catch (error) {
      if (!(error instanceof ToolExitError) && !isMissingFile(error)) throw error;
      this.logger?.warn({ at }, "poster extraction failed; clip kept without one");
      return null;
    }
  }
}

/**
 * The probe result in ffprobe's JSON, or `undefined` when it is not a video: no JSON, no
 * video stream, or no duration — a still image probes as one "video" stream without one.
 * The duration is the video stream's own (a container whose audio outruns its picture
 * reports the longer figure at format level), with the format's as the fallback for a
 * container that carries none per stream.
 */
export function readProbe(output: unknown): ProbeResult | undefined {
  const parsed = ProbeOutputSchema.safeParse(output);
  if (!parsed.success) return undefined;
  const { streams, format } = parsed.data;
  const video = streams.find((stream) => stream.codec_type === "video");
  if (video?.width === undefined || video.height === undefined) return undefined;
  const durationSeconds = video.duration ?? format?.duration ?? 0;
  if (durationSeconds <= 0) return undefined;
  return {
    durationSeconds,
    width: video.width,
    height: video.height,
    rotation: rotationOf(video.side_data_list ?? []),
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
  };
}

/** The rotation tag among a stream's side data (a phone's display matrix), or 0. */
function rotationOf(sideData: Array<{ rotation?: number }>): number {
  return sideData.find((data) => data.rotation !== undefined)?.rotation ?? 0;
}

/** ffprobe's stdout as `unknown`, or `undefined` when it is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The real VideoProcessor; the container builds one with the defaults (`ffmpeg`, `ffprobe` on PATH). */
export function createFfmpegVideoProcessor(options: FfmpegOptions = {}): VideoProcessor {
  return new FfmpegVideoProcessor(options);
}
