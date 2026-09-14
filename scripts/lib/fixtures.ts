import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Step 1 of `clip-2s.mp4`: re-encode the first 2 s small, with `-noautorotate` so the
 * source pixels stay in their original (landscape) orientation instead of being physically
 * rotated. This intermediate has no rotation side data yet — step 2
 * (`buildClip2sRotateRemuxArgs`) attaches it — because ffmpeg 8.1's mov muxer does not
 * synthesize a Display Matrix from a `-metadata rotate=` tag, or from `-display_rotation`,
 * during a transcode (verified empirically: both are silently no-ops there). Written to a
 * temp path; `-fflags +bitexact` etc. keep it byte-identical across runs.
 */
export function buildClip2sTranscodeArgs(inputPath: string, tmpOutputPath: string): string[] {
  return [
    "-y",
    "-noautorotate",
    "-ss",
    "0",
    "-t",
    "2",
    "-i",
    inputPath,
    "-map_metadata",
    "-1",
    "-c:v",
    "libx264",
    "-crf",
    "28",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    tmpOutputPath,
  ];
}

/**
 * Step 2 of `clip-2s.mp4`: remux the step-1 intermediate with `-c copy` (no re-encode) while
 * overriding the read rotation via the input option `-display_rotation -90`. Unlike during a
 * transcode, `-display_rotation` on a `-c copy` remux *does* get written into the output as a
 * real container-level Display Matrix — `ffprobe -show_entries stream_side_data=rotation`
 * reports `rotation=-90`, matching what a real phone video carries and what ffmpeg's
 * autorotate (T020) reads. This is what makes `clip-2s.mp4` the portrait/rotation fixture.
 */
export function buildClip2sRotateRemuxArgs(tmpInputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-display_rotation",
    "-90",
    "-i",
    tmpInputPath,
    "-map_metadata",
    "-1",
    "-c",
    "copy",
    "-fflags",
    "+bitexact",
    outputPath,
  ];
}

/**
 * The `ffmpeg` argv for `clip-20s.mp4`: the first 20 seconds of the over-cap source,
 * downscaled to 720p and re-encoded small enough to stay under the 4 MB fixture budget.
 * No rotation handling here — this fixture's job is to be long enough to trip the
 * `needs-trim` rule, not to exercise orientation (that is `clip-2s.mp4`'s job).
 */
export function buildClip20sArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-ss",
    "0",
    "-t",
    "20",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-vf",
    "scale=-2:720",
    "-c:v",
    "libx264",
    "-crf",
    "30",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-map_metadata",
    "-1",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    outputPath,
  ];
}

/** sharp resize options shared by every JPEG fixture derived from a source photo. */
export interface FixtureResizeOptions {
  width: number;
  fit: "inside";
  withoutEnlargement: true;
}

/**
 * Resize plan for a fixture JPEG: constrains the longest edge to `longestEdge` without
 * upscaling or cropping (`fit: "inside"`), matching how the real upload pipeline (T019)
 * produces its "clean" derivative. Height is left to sharp so aspect ratio is preserved.
 */
export function resizePlan(longestEdge: number): FixtureResizeOptions {
  return { width: longestEdge, fit: "inside", withoutEnlargement: true };
}

/**
 * The `sharp().linear(a, b)` arguments for a -1 EV (exposure value) darken: halving every
 * RGB sample (`a = 0.5`) with no offset (`b = 0`). This is `dim.jpg`'s whole reason to
 * exist — it is the fixture the "enhance" pipeline's brighten step is exercised against.
 */
export function darkenOneStopLinear(): [number, number] {
  return [0.5, 0];
}

/** Sha-256 of a buffer, hex-encoded — the unit `make-fixtures` uses for CHECKSUMS.sha256. */
export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Renders a `CHECKSUMS.sha256` body (the format `shasum -a 256 -c` reads) from a list of
 * `{ relativePath, hex }` pairs. Sorted by path so re-runs produce a stable diff instead of
 * one that reorders on directory-listing order.
 */
export function renderChecksumsFile(entries: Array<{ relativePath: string; hex: string }>): string {
  const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return sorted.map((entry) => `${entry.hex}  ${entry.relativePath}\n`).join("");
}

// --- Structural shape checks for the hand-written maximal-*.json fixtures ---
//
// These are deliberately NOT the canonical ProfileDocument/MediaAsset schemas (those are
// T006/T012's job, in src/core/profile/schema.ts and src/core/media/schema.ts, per
// contracts/profile-document.md guarantee 1: "no other file declares a profile type"). This
// is a narrow, local sanity check so a broken hand-edit of the fixture fails the fixture
// build loudly, before T006 exists to catch it via the real schema.

const blockTypes = ["hero", "bio", "photo", "gallery", "video", "day", "needs", "quote"] as const;

const maximalBlockShape = z.object({
  id: z.string(),
  type: z.enum(blockTypes),
  mediaIds: z.array(z.string()).optional(),
  scenes: z.array(z.unknown()).optional(),
  cards: z.array(z.unknown()).optional(),
});

const maximalDocumentShape = z.object({
  schemaVersion: z.literal(1),
  id: z.string().length(8),
  blocks: z.array(maximalBlockShape).length(30),
  theme: z.object({ preset: z.string(), warmth: z.number(), contrast: z.number() }),
});

type MaximalBlock = z.infer<typeof maximalBlockShape>;

/** Every block type from the brief must appear at least once. */
function checkEveryBlockTypePresent(blocks: MaximalBlock[]): void {
  const presentTypes = new Set(blocks.map((block) => block.type));
  const missingTypes = blockTypes.filter((type) => !presentTypes.has(type));
  if (missingTypes.length > 0) {
    throw new Error(`maximal-document.json is missing block type(s): ${missingTypes.join(", ")}`);
  }
}

/** Exactly one gallery, with the 12 ids the brief asks for. */
function checkGallery(blocks: MaximalBlock[]): void {
  const galleries = blocks.filter((block) => block.type === "gallery");
  if (galleries.length !== 1 || galleries[0]?.mediaIds?.length !== 12) {
    throw new Error("maximal-document.json must have exactly one gallery block with 12 mediaIds");
  }
}

/** Exactly one day block, with exactly 3 scenes (data-model.md: "exactly 3"). */
function checkDay(blocks: MaximalBlock[]): void {
  const days = blocks.filter((block) => block.type === "day");
  if (days.length !== 1 || days[0]?.scenes?.length !== 3) {
    throw new Error("maximal-document.json must have exactly one day block with 3 scenes");
  }
}

/** Exactly one needs block, with 1-3 cards (data-model.md: "1..3"). */
function checkNeeds(blocks: MaximalBlock[]): void {
  const needsBlocks = blocks.filter((block) => block.type === "needs");
  const cardCount = needsBlocks[0]?.cards?.length ?? 0;
  if (needsBlocks.length !== 1 || cardCount < 1 || cardCount > 3) {
    throw new Error("maximal-document.json must have exactly one needs block with 1-3 cards");
  }
}

/**
 * Checks `maximal-document.json` parses and matches the counts the T005 brief promises: 30
 * blocks covering every block type, one 12-photo gallery, one 3-scene day block. Throws with
 * a plain message (via Zod/assert) naming what is wrong — this runs at fixture-build time,
 * not in application code, so a thrown error is the right failure mode.
 */
export function validateMaximalDocumentShape(json: unknown): void {
  const doc = maximalDocumentShape.parse(json);
  checkEveryBlockTypePresent(doc.blocks);
  checkGallery(doc.blocks);
  checkDay(doc.blocks);
  checkNeeds(doc.blocks);
}

const maximalAssetShape = z.object({
  schemaVersion: z.literal(1),
  id: z.string().length(8),
  kind: z.enum(["photo", "video"]),
  alt: z.object({ text: z.string(), source: z.enum(["model", "volunteer"]) }).nullable(),
  focal: z.object({ x: z.number(), y: z.number() }),
  status: z.enum(["processing", "needs-trim", "ready"]),
  revisions: z.object({
    clean: z.string().optional(),
    web: z.string().optional(),
    poster: z.string().optional(),
  }),
  enhancement: z.object({ sourceMediaId: z.string(), recipe: z.literal("auto-v1") }).optional(),
  trim: z.object({ start: z.number(), end: z.number() }).optional(),
});

type MaximalAsset = z.infer<typeof maximalAssetShape>;

/** The optional fields each maximal asset fixture must populate, by kind (data-model.md). */
const REQUIRED_OPTIONALS: Record<
  MaximalAsset["kind"],
  Array<{ name: string; present: (asset: MaximalAsset) => boolean }>
> = {
  photo: [
    { name: "alt", present: (asset) => asset.alt !== null },
    { name: "enhancement", present: (asset) => asset.enhancement !== undefined },
    { name: "revisions.clean", present: (asset) => asset.revisions.clean !== undefined },
  ],
  video: [
    { name: "alt", present: (asset) => asset.alt !== null },
    { name: "trim", present: (asset) => asset.trim !== undefined },
    { name: "revisions.web", present: (asset) => asset.revisions.web !== undefined },
    { name: "revisions.poster", present: (asset) => asset.revisions.poster !== undefined },
  ],
};

/**
 * Checks one `maximal-asset-{kind}.json` parses, is of `kind`, and has every optional field
 * of that kind populated: a non-null `alt` for both; `enhancement` and a clean revision for
 * the photo; `trim` and web + poster revisions for the video (data-model.md → MediaAsset
 * forbids `enhancement` on a video and `trim` on a photo, hence two fixtures). Throws on
 * drift.
 */
export function validateMaximalAssetShape(json: unknown, kind: MaximalAsset["kind"]): void {
  const asset = maximalAssetShape.parse(json);
  if (asset.kind !== kind) {
    throw new Error(`maximal-asset-${kind}.json has kind "${asset.kind}"`);
  }
  const missing = REQUIRED_OPTIONALS[kind]
    .filter((field) => !field.present(asset))
    .map((field) => field.name);
  if (missing.length > 0) {
    throw new Error(
      `maximal-asset-${kind}.json is missing optional field(s): ${missing.join(", ")}`,
    );
  }
}
