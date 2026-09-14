import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { cleanPhoto } from "@/adapters/sharp/clean";
import { downscaleForModel } from "@/adapters/sharp/downscale";
import { readImageMetadata } from "@/adapters/sharp/metadata";
import {
  needsTrim,
  NOTHING_UPLOADED,
  produceClip,
  withSpooledOriginal,
} from "@/adapters/pipeline/video";
import { SNIFF_BYTES, sniffType } from "@/adapters/sniff";
import {
  NotFoundError,
  parseOrThrow,
  RefusedError,
  TooLargeError,
  UnsupportedError,
} from "@/core/errors";
import { MediaAssetSchema, type MediaAsset, type MediaKind } from "@/core/media/schema";
import { checkUpload, photoWarnings, UNSUPPORTED_MESSAGE } from "@/core/media/validation";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";
import type { ProbeResult } from "@/core/ports";

// Steps 3–5 of an upload (ADR-005, ADR-006; FR-008, FR-009, FR-011, FR-073, FR-078): sniff
// the bytes, judge type and size, clean the photo or probe and transcode the video, write
// the record, describe it. Nothing is written until every check has passed, and every
// refusal deletes the uploaded object, so an upload never half-applies. The original is
// read once, here, and never sent to a model. An id that already has a record is refused
// before anything is read: a finalize is not re-runnable, so a live page's files, and a
// volunteer's own description, can never be replaced by a second call (FR-075, FR-076).

/** What `finalizeUpload` takes: the ids and what the browser told `beginUpload`. */
export const FinalizeUploadInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  mediaId: MediaIdSchema,
  fileName: z.string().min(1).max(200),
  declaredType: z.string().max(100),
});

export type FinalizeUploadInput = z.infer<typeof FinalizeUploadInputSchema>;

/** The finished record and anything the volunteer should hear but may ignore (FR-008). */
export interface FinalizeUploadResult {
  asset: MediaAsset;
  warnings: string[];
}

/** What `finalizeUpload` takes from the container. */
export type FinalizeUploadDeps = Pick<
  Container,
  "mediaStore" | "videoProcessor" | "describer" | "clock" | "logger"
>;

/** The refusal for a second finalize of the same id (409). */
const ALREADY_ADDED = "This file was already added.";

/** The whole original as bytes; the store hands it over as a stream. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The byte count and the sniffable head of the original, or `not_found`. */
async function readHead(
  store: FinalizeUploadDeps["mediaStore"],
  pid: string,
  mid: string,
): Promise<{ byteSize: number; head: Uint8Array }> {
  const byteSize = await store.originalSize(pid, mid);
  if (byteSize === null) throw new NotFoundError(NOTHING_UPLOADED);
  const head = await store.readRange(pid, mid, { start: 0, end: SNIFF_BYTES - 1 });
  if (head === null) throw new NotFoundError(NOTHING_UPLOADED);
  return { byteSize, head };
}

/**
 * The sniffed type and kind of an upload that passes the type and size rules
 * (`checkUpload`, FR-007/008), or the refusal: `unsupported` when the bytes announce
 * nothing or a type outside the accepted lists, `too_large` over the cap of the real kind.
 */
async function judge(
  declaredType: string,
  byteSize: number,
  head: Uint8Array,
): Promise<{ mimeType: string; kind: MediaKind }> {
  const mimeType = await sniffType(head);
  if (mimeType === undefined) throw new UnsupportedError(UNSUPPORTED_MESSAGE);
  const check = checkUpload({ declaredType, sniffedType: mimeType, byteSize });
  if (!check.ok) {
    throw check.code === "too_large"
      ? new TooLargeError(check.message)
      : new UnsupportedError(check.message);
  }
  return { mimeType, kind: check.kind };
}

/**
 * The first record written, before the describer runs: `processing`, undescribed, with
 * its clean revision. Validated so a malformed record can never land.
 */
function processingRecord(
  input: FinalizeUploadInput,
  facts: { mimeType: string; byteSize: number; width: number; height: number; rev: string },
  createdAt: string,
): MediaAsset {
  return parseOrThrow(MediaAssetSchema, {
    schemaVersion: 1,
    id: input.mediaId,
    kind: "photo",
    fileName: input.fileName,
    mimeType: facts.mimeType,
    bytes: facts.byteSize,
    width: facts.width,
    height: facts.height,
    focal: { x: 50, y: 50 },
    status: "processing",
    alt: null,
    descriptionStatus: "pending",
    revisions: { clean: facts.rev },
    createdAt,
  });
}

/**
 * Runs the describer on the model-sized copy of the clean photo and answers the fields the
 * final record gets: the model's text, or no text and `failed` — logged at `warn` with the
 * short reason — so the builder asks the volunteer for one (FR-073). Never the original.
 */
async function describe(
  deps: FinalizeUploadDeps,
  input: FinalizeUploadInput,
  clean: Uint8Array,
): Promise<Pick<MediaAsset, "alt" | "descriptionStatus">> {
  const result = await deps.describer.describePhoto(await downscaleForModel(clean));
  if ("failed" in result) {
    const { profileId: pid, mediaId: mid } = input;
    deps.logger.warn({ pid, mid, reason: result.failed }, "describer failed");
    return { alt: null, descriptionStatus: "failed" };
  }
  return { alt: { text: result.text, source: "model" }, descriptionStatus: "ready" };
}

/** Everything after the checks have passed: clean, record, describe, record again. */
async function processPhoto(
  deps: FinalizeUploadDeps,
  input: FinalizeUploadInput,
  original: { mimeType: string; byteSize: number },
): Promise<FinalizeUploadResult> {
  const { profileId: pid, mediaId: mid } = input;
  const stream = await deps.mediaStore.readOriginal(pid, mid);
  if (stream === null) throw new NotFoundError(NOTHING_UPLOADED);
  const bytes = await drain(stream);
  const { width, height } = await readImageMetadata(bytes);
  const clean = await cleanPhoto(bytes);
  const rev = await deps.mediaStore.writeDerived(pid, mid, "clean", clean.bytes);
  const createdAt = deps.clock.now().toISOString();
  const processing = processingRecord(input, { ...original, ...clean, rev }, createdAt);
  await deps.mediaStore.writeAsset(pid, mid, processing);
  const described = await describe(deps, input, clean.bytes);
  const ready = parseOrThrow(MediaAssetSchema, { ...processing, ...described, status: "ready" });
  await deps.mediaStore.writeAsset(pid, mid, ready);
  return { asset: ready, warnings: photoWarnings(width, height) };
}

/**
 * The first video record: `needs-trim` for an original over 15 s, else `processing`;
 * dimensions upright (a ±90° rotation swaps what ffprobe stored); nothing produced yet.
 */
function videoRecord(
  input: FinalizeUploadInput,
  facts: { mimeType: string; byteSize: number; probe: ProbeResult },
  createdAt: string,
): MediaAsset {
  const { probe } = facts;
  const sideways = Math.abs(probe.rotation) % 180 === 90;
  return parseOrThrow(MediaAssetSchema, {
    schemaVersion: 1,
    id: input.mediaId,
    kind: "video",
    fileName: input.fileName,
    mimeType: facts.mimeType,
    bytes: facts.byteSize,
    width: sideways ? probe.height : probe.width,
    height: sideways ? probe.width : probe.height,
    originalDurationSeconds: probe.durationSeconds,
    status: needsTrim(probe.durationSeconds) ? "needs-trim" : "processing",
    alt: null,
    descriptionStatus: "pending",
    revisions: {},
    createdAt,
  });
}

/**
 * The video branch (ADR-006; FR-077, FR-078, FR-079): the original is spooled once and
 * probed; an original over 15 s is recorded as `needs-trim` with nothing produced — no web
 * clip, no poster, no description — until a trim exists; a shorter one is transcoded
 * whole, its web clip and poster stored, and described from the web clip only.
 */
async function processVideo(
  deps: FinalizeUploadDeps,
  input: FinalizeUploadInput,
  original: { mimeType: string; byteSize: number },
): Promise<FinalizeUploadResult> {
  const { profileId: pid, mediaId: mid, fileName } = input;
  return withSpooledOriginal(deps.mediaStore, pid, mid, async (path) => {
    const probe = await deps.videoProcessor.probe(path);
    const createdAt = deps.clock.now().toISOString();
    const record = videoRecord(input, { ...original, probe }, createdAt);
    await deps.mediaStore.writeAsset(pid, mid, record);
    if (record.status === "needs-trim") return { asset: record, warnings: [] };
    const clip = await produceClip(deps, { pid, mid, fileName }, path);
    const ready = parseOrThrow(MediaAssetSchema, { ...record, ...clip, status: "ready" });
    await deps.mediaStore.writeAsset(pid, mid, ready);
    return { asset: ready, warnings: [] };
  });
}

/**
 * Judges the upload and, when it passes, turns it into a photo record with its clean
 * derivative and description, or a video record with its web clip, poster and description
 * (or `needs-trim`, with none of those, for an original over 15 s). The sniffed type
 * decides the kind; the declared type may only contradict it. In order: `not_found` when
 * nothing was uploaded; `unsupported` for a type outside JPEG/PNG/WebP/MP4/MOV (a PNG
 * renamed `.mp4` included), bytes that will not decode, or a video ffmpeg cannot process;
 * `too_large` over the kind's cap; `refused` when the id already has a record, before
 * anything is read or removed. Every refusal of a new upload deletes the object. A small photo is
 * accepted with its warning. The record is written as `processing` with its derivative(s),
 * then as `ready` once the describer has answered — with `alt.source: "model"`, or
 * `descriptionStatus: "failed"`.
 */
export async function finalizeUpload(
  deps: FinalizeUploadDeps,
  input: FinalizeUploadInput,
): Promise<FinalizeUploadResult> {
  const { profileId: pid, mediaId: mid } = input;
  if ((await deps.mediaStore.readAsset(pid, mid)) !== null) {
    throw new RefusedError(ALREADY_ADDED);
  }
  try {
    const { byteSize, head } = await readHead(deps.mediaStore, pid, mid);
    const { mimeType, kind } = await judge(input.declaredType, byteSize, head);
    const original = { mimeType, byteSize };
    return kind === "photo"
      ? await processPhoto(deps, input, original)
      : await processVideo(deps, input, original);
  } catch (error) {
    await discard(deps, pid, mid, error);
    throw error;
  }
}

/**
 * Removes what this request created — a prefix delete over the media folder, which held
 * nothing of anyone else's, since a folder with a record was refused at entry — so no
 * refusal, and no failure part-way, leaves a half-made upload behind. A store that cannot
 * even delete is logged at `error` and the refusal still stands: the caller must hear
 * why the upload was refused, not that the cleanup failed.
 */
async function discard(
  deps: FinalizeUploadDeps,
  pid: string,
  mid: string,
  refusal: unknown,
): Promise<void> {
  try {
    await deps.mediaStore.deleteMedia(pid, mid);
  } catch (error) {
    deps.logger.error({ pid, mid, err: error, refusal }, "cleanup after a refused upload failed");
  }
}
