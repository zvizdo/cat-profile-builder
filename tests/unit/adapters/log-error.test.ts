import { describe, expect, it } from "vitest";
import { safeError } from "@/adapters/log-error";
import { ToolExitError } from "@/adapters/ffmpeg/video-processor";
import { createLogger, type LogSink } from "@/adapters/logger";
import { RefusedError, UnsupportedError } from "@/core/errors";

// `safeError` (F40 review, Important finding 1): this app's logger turns any `Error` value,
// at any field, into pino's own shape — which walks `.cause` all the way down. A real trim
// failure's chain bottoms out in `execFile`'s own rejection, whose `message` is the full
// ffmpeg command line (an absolute temp-file path) plus ffmpeg's raw stderr, and pino's
// serialiser repeats every level's message and stack. These tests build that exact chain —
// the one `cannotProcess`/the ffmpeg adapter's `exec` actually produce — through the real
// logger (not the memory fake), so the assertion is against what pino actually writes.

/** Collects every line pino writes so a test can read the JSON back. */
function sink(): LogSink & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(line: string) {
      lines.push(line);
    },
  };
}

const TEMP_PATH = "/tmp/cpb-original-8f3a1c2d/original";
const FFMPEG_STDERR = `${TEMP_PATH}: Invalid data found when processing input\n`;

/** The exact four-level chain a real transcode failure produces, ending in this leak. */
function realisticTrimFailure(): UnsupportedError {
  const execRejection = new Error(
    `Command failed: ffmpeg -y -hide_banner -v error -i ${TEMP_PATH} -c:v libx264 ` +
      `/tmp/cpb-ffmpeg-9b7e0a11/web.mp4\n${FFMPEG_STDERR}`,
  );
  const toolExit = new ToolExitError("ffmpeg", 1, { cause: execRejection });
  const adapterFailure = new UnsupportedError("We couldn't process that video.", {
    cause: toolExit,
  });
  return new UnsupportedError("We couldn't process clip.mp4. Nothing was added.", {
    cause: adapterFailure,
  });
}

describe("safeError", () => {
  it("keeps an AppError's own name, message and code, and drops its cause", () => {
    const error = new RefusedError("A clip must be at least 1 second.");
    expect(safeError(error)).toEqual({
      name: "RefusedError",
      message: "A clip must be at least 1 second.",
      code: "refused",
    });
  });

  it("never reads a message off anything that isn't an AppError", () => {
    expect(safeError(new Error(`reading ${TEMP_PATH}`))).toEqual({
      name: "Error",
      message: "unknown",
    });
    expect(safeError("a thrown string")).toEqual({ name: "Error", message: "unknown" });
    // `ToolExitError` (the ffmpeg adapter's own error) is an `Error`, not an `AppError`: its
    // message ("ffmpeg exited with 1.") happens to be safe, but nothing here should rely on
    // that — only an `AppError`'s message is a promise this codebase makes.
    const toolExit = new ToolExitError("ffmpeg", 1, { cause: new Error(TEMP_PATH) });
    expect(safeError(toolExit)).toEqual({ name: "ToolExitError", message: "unknown" });
  });

  it("logs a real 3-level transcode failure's cause chain through the real logger with no path and no stderr", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    const error = realisticTrimFailure();

    // What a raw error would do, if this bug were still here: prove the chain really does
    // carry the path and the stderr three levels down, so the assertion below is against a
    // real leak, not a straw one.
    const adapterFailure = error.cause as Error;
    const toolExit = adapterFailure.cause as Error;
    expect(String(toolExit.cause)).toContain(TEMP_PATH);
    expect(String(toolExit.cause)).toContain(FFMPEG_STDERR.trim());

    logger.warn({ pid: "abcdefgh", mid: "mmmmmmm2", err: safeError(error) }, "trim failed");

    const [line] = out.lines;
    expect(line).toBeDefined();
    expect(line).not.toContain("/tmp");
    expect(line).not.toContain(TEMP_PATH);
    expect(line).not.toContain("Invalid data found");
    expect(line).not.toContain("Command failed");
    const parsed = JSON.parse(line ?? "{}") as { err?: unknown };
    expect(parsed.err).toEqual({
      name: "UnsupportedError",
      message: "We couldn't process clip.mp4. Nothing was added.",
      code: "unsupported",
    });
  });
});
