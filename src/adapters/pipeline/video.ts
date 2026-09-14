import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Container } from "@/adapters/container";
import { NotFoundError, UnsupportedError } from "@/core/errors";
import type { MediaAsset } from "@/core/media/schema";
import { LIMITS } from "@/core/media/validation";

// What producing a clip takes, shared by finalize (a short original, whole), trim (a
// range of the original) and clear-trim (a short original, whole again) — ADR-006, FR-077,
// FR-079: spool the private original to a temp path once, transcode, store web and poster
// under their content revs, describe the finished web clip and nothing else.

/** What producing a clip takes from the container. */
export type ClipDeps = Pick<Container, "mediaStore" | "videoProcessor" | "describer" | "logger">;

/** The 404 when there is no original under the id. */
export const NOTHING_UPLOADED = "Nothing was uploaded.";

/**
 * The one sentence for a transcode ffmpeg gave up on (ADR-006), naming the file; the
 * processor's error rides along as `cause` so the log can say what ffmpeg said.
 */
export function cannotProcess(fileName: string, cause: unknown): UnsupportedError {
  return new UnsupportedError(`We couldn't process ${fileName}. Nothing was added.`, { cause });
}

/** True when an original of this length must be trimmed before anything is produced (FR-078). */
export function needsTrim(originalDurationSeconds: number): boolean {
  return originalDurationSeconds > LIMITS.maxClipSeconds;
}

/**
 * Streams the private original of `mid` to a file in a fresh temp folder, gives `fn` the
 * path, and removes the folder afterwards whatever happened. `not_found` when no upload
 * has landed. The processor takes a path, so a 200 MB original is never held in memory.
 */
export async function withSpooledOriginal<T>(
  store: ClipDeps["mediaStore"],
  pid: string,
  mid: string,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const stream = await store.readOriginal(pid, mid);
  if (stream === null) throw new NotFoundError(NOTHING_UPLOADED);
  const dir = await mkdtemp(join(tmpdir(), "cpb-original-"));
  try {
    const path = join(dir, "original");
    // The web stream is the same object under Node's own name for it.
    await pipeline(Readable.fromWeb(stream as NodeReadableStream), createWriteStream(path));
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The fields a finished clip sets on the record. */
export type ClipFields = Pick<
  MediaAsset,
  "durationSeconds" | "width" | "height" | "revisions" | "alt" | "descriptionStatus"
>;

/**
 * Runs the describer on the finished web clip — by its `gs://` URI, never the original
 * (FR-079) — and answers the description fields: the model's text, or none and `failed`,
 * logged at `warn` with the short reason, so the builder asks the volunteer (FR-073).
 */
async function describeClip(
  deps: ClipDeps,
  pid: string,
  mid: string,
  webRev: string,
): Promise<Pick<MediaAsset, "alt" | "descriptionStatus">> {
  const result = await deps.describer.describeVideo(deps.mediaStore.gsUri(pid, mid, "web", webRev));
  if ("failed" in result) {
    deps.logger.warn({ pid, mid, reason: result.failed }, "describer failed");
    return { alt: null, descriptionStatus: "failed" };
  }
  return { alt: { text: result.text, source: "model" }, descriptionStatus: "ready" };
}

/**
 * Transcodes the original at `path` — whole, or the given `trim` — stores the web clip and
 * (when extraction succeeded) the poster under new revs, and describes the web clip. Old
 * revs are never touched (ADR-015). A transcode the processor refuses is `unsupported`
 * naming the file; a missing poster alone is not a failure (ADR-006).
 */
export async function produceClip(
  deps: ClipDeps,
  target: { pid: string; mid: string; fileName: string },
  path: string,
  trim?: { start: number; end: number },
): Promise<ClipFields> {
  const { pid, mid } = target;
  let made;
  try {
    made = await deps.videoProcessor.transcode(path, trim ? { trim } : {});
  } catch (error) {
    if (error instanceof UnsupportedError) throw cannotProcess(target.fileName, error);
    throw error;
  }
  const web = await deps.mediaStore.writeDerived(pid, mid, "web", made.web);
  const revisions: MediaAsset["revisions"] = { web };
  if (made.poster !== null) {
    revisions.poster = await deps.mediaStore.writeDerived(pid, mid, "poster", made.poster);
  }
  const described = await describeClip(deps, pid, mid, web);
  return {
    durationSeconds: made.durationSeconds,
    width: made.width,
    height: made.height,
    revisions,
    ...described,
  };
}
