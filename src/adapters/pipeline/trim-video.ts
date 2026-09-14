import "server-only";
import { z } from "zod";
import { safeError } from "@/adapters/log-error";
import { NotFoundError, parseOrThrow, RefusedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema, type MediaAsset } from "@/core/media/schema";
import { checkTrim } from "@/core/media/validation";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";
import { needsTrim, produceClip, withSpooledOriginal, type ClipDeps } from "./video";

// Trimming a clip and taking the trim off again (ADR-006, ADR-015; FR-077, FR-078, FR-079).
// The rule — 1 to 15 seconds, inside the original — is `checkTrim`'s alone; this file only
// carries its answer. An accepted trim regenerates web, poster and alt from the clip and
// nothing else, under new revs; the previous files stay where they are. A failed transcode
// changes nothing: the record is written once, at the end, so the previous revisions are
// current until the new ones exist.

/** The clip the action is about. */
const TargetSchema = z.strictObject({ profileId: ProfileIdSchema, mediaId: MediaIdSchema });

/** What `trimVideo` takes: seconds into the original. The rule itself is checked in core. */
export const TrimVideoInputSchema = TargetSchema.extend({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
});

export type TrimVideoInput = z.infer<typeof TrimVideoInputSchema>;

/** What `clearTrim` takes. */
export const ClearTrimInputSchema = TargetSchema;

export type ClearTrimInput = z.infer<typeof ClearTrimInputSchema>;

/** What both take from the container. */
export type TrimVideoDeps = ClipDeps;

/** The 404 for a media id with no record. */
const NO_SUCH_MEDIA = "There's no photo or clip with that id.";

/** The refusal for a trim on a photo. */
const NOT_A_CLIP = "Only a clip can be trimmed.";

/** `asset` without its trim-dependent fields, ready for the next state. */
function withoutTrim(asset: MediaAsset): Omit<MediaAsset, "trim" | "durationSeconds"> {
  const copy = { ...asset };
  delete copy.trim;
  delete copy.durationSeconds;
  return copy;
}

/** A video record with the field the schema guarantees a video has. */
type VideoAsset = MediaAsset & { kind: "video"; originalDurationSeconds: number };

/** The stored record of `mid`, which must be a video: `not_found` or `refused` otherwise. */
async function readVideo(deps: TrimVideoDeps, target: ClearTrimInput): Promise<VideoAsset> {
  const stored = await deps.mediaStore.readAsset(target.profileId, target.mediaId);
  if (stored === null) throw new NotFoundError(NO_SUCH_MEDIA);
  const asset = loadAsset(stored);
  if (asset.kind !== "video" || asset.originalDurationSeconds === undefined) {
    throw new RefusedError(NOT_A_CLIP);
  }
  return { ...asset, kind: "video", originalDurationSeconds: asset.originalDurationSeconds };
}

/**
 * Produces the clip — the whole original, or `trim` — and writes the record as `ready`
 * with the new revs, duration, dimensions and description. `trim` absent means the
 * record's trim is removed.
 */
async function reproduce(
  deps: TrimVideoDeps,
  pid: string,
  asset: VideoAsset,
  trim: { start: number; end: number } | undefined,
): Promise<{ asset: MediaAsset }> {
  const { id: mid, fileName } = asset;
  const clip = await withSpooledOriginal(deps.mediaStore, pid, mid, (path) =>
    produceClip(deps, { pid, mid, fileName }, path, trim),
  );
  const next = parseOrThrow(MediaAssetSchema, {
    ...withoutTrim(asset),
    ...clip,
    ...(trim === undefined ? {} : { trim }),
    status: "ready",
  });
  await deps.mediaStore.writeAsset(pid, mid, next);
  return { asset: next };
}

/**
 * Trims the clip to `start`–`end` seconds of the original (FR-078). `not_found` for an
 * unknown id; `refused` for a photo, or for a range `checkTrim` refuses — in its words,
 * with no transcode attempted. On ok: web, poster and alt are regenerated from the trimmed
 * clip only (FR-079), stored under new revs beside the old ones (ADR-015), and the record
 * is `ready`. A transcode failure is `unsupported`, naming the file, and the previous
 * revisions stay current.
 *
 * The transcode this runs can take ten-plus seconds with nothing else on the wire (ffmpeg,
 * then the describer), so a Cloud Run log carries `info` at the start and at the end (ids
 * and durations only — never a path or URL) and a `warn` naming the failure when the job
 * throws after starting — the only way to tell, from logs alone, that a trim ran, how long
 * it took, or that it failed. The failure is logged through {@link safeError}, never the
 * caught error itself: a real transcode failure's `cause` chain bottoms out in `ffmpeg`'s
 * own rejection, whose `message` is the full command line (an absolute temp-file path
 * included) and its stderr — and this app's logger walks `.cause` on any `Error` it is
 * given, at any field, so passing the error itself would put both in the log line this
 * exists to make safe to read. A refusal `checkTrim` catches before any work starts logs
 * nothing: it is a normal refusal, not a job.
 */
export async function trimVideo(
  deps: TrimVideoDeps,
  input: TrimVideoInput,
): Promise<{ asset: MediaAsset }> {
  const asset = await readVideo(deps, input);
  const trim = { start: input.start, end: input.end };
  const check = checkTrim({ ...trim, originalDurationSeconds: asset.originalDurationSeconds });
  if (!check.ok) throw new RefusedError(check.message);
  const { profileId: pid, mediaId: mid } = input;
  deps.logger.info({ pid, mid, start: trim.start, end: trim.end }, "trim started");
  try {
    const result = await reproduce(deps, pid, asset, trim);
    deps.logger.info(
      { pid, mid, durationSeconds: result.asset.durationSeconds ?? null },
      "trim finished",
    );
    return result;
  } catch (error) {
    deps.logger.warn({ pid, mid, err: safeError(error) }, "trim failed");
    throw error;
  }
}

/**
 * Removes the trim. A clip with none is answered unchanged. An original over 15 s goes
 * back to `needs-trim`: no web clip, no poster, no duration and no description — the old
 * files stay on disk but the record no longer points at them, and the next trim writes a
 * description of the clip a visitor will actually see (FR-079). A shorter original is
 * transcoded whole again, exactly as finalize did.
 */
export async function clearTrim(
  deps: TrimVideoDeps,
  input: ClearTrimInput,
): Promise<{ asset: MediaAsset }> {
  const asset = await readVideo(deps, input);
  if (asset.trim === undefined) return { asset };
  if (!needsTrim(asset.originalDurationSeconds)) {
    return reproduce(deps, input.profileId, asset, undefined);
  }
  const next = parseOrThrow(MediaAssetSchema, {
    ...withoutTrim(asset),
    status: "needs-trim",
    revisions: {},
    alt: null,
    descriptionStatus: "pending",
  });
  await deps.mediaStore.writeAsset(input.profileId, input.mediaId, next);
  return { asset: next };
}
