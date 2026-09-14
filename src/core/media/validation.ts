import { type MediaKind } from "./schema";

// The upload and trim rules (ADR-005, ADR-006; FR-007, FR-008, FR-078) as pure functions.
// Sniffing, probing and byte counting happen in adapters; this file only judges the numbers
// and names they report, so every refusal is testable with no file on disk.

/** The caps every upload and trim is judged against (FR-007, FR-008, FR-078). */
export const LIMITS: Readonly<{
  /** Largest photo accepted, in bytes: 25 MB. */
  photoBytes: number;
  /** Largest video accepted, in bytes: 200 MB. */
  videoBytes: number;
  /** A photo whose long edge is under this many pixels warns that it may look soft. */
  smallPhotoWidth: number;
  /** Longest clip a profile plays, in seconds. */
  maxClipSeconds: number;
  /** Shortest trim that is still a clip, in seconds. */
  minClipSeconds: number;
}> = {
  photoBytes: 25 * 1024 * 1024,
  videoBytes: 200 * 1024 * 1024,
  smallPhotoWidth: 1200,
  maxClipSeconds: 15,
  minClipSeconds: 1,
};

/**
 * The seconds of a clip the event carousel shows: the first eight (spec Q&A → "A 15-second clip
 * on an 8-second carousel slot?"). The trim modal names it so a volunteer picks a stretch whose
 * opening matters; the carousel (T041/T042) plays exactly this much of every clip. Always
 * inside {@link LIMITS.maxClipSeconds}.
 */
export const CAROUSEL_CLIP_SECONDS = 8;

/** The sniffed MIME types accepted as photos (FR-008). HEIC is not among them (ADR-005). */
export const ALLOWED_PHOTO_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** The sniffed MIME types accepted as video (FR-008): MP4 and MOV. */
export const ALLOWED_VIDEO_TYPES: readonly string[] = ["video/mp4", "video/quicktime"];

/** What an adapter learned about an upload before any rule is applied. */
export interface UploadInput {
  /** The type the browser declared. Only its kind (photo or video) is looked at. */
  declaredType: string;
  /** The type found by sniffing the bytes; `undefined` when the sniffer recognised nothing. */
  sniffedType: string | undefined;
  byteSize: number;
  /** Pixel width, when probed. */
  width?: number;
  /** Pixel height, when probed. */
  height?: number;
  /**
   * Duration, when probed. No rule caps it — a long video is accepted and stored as
   * `needs-trim` until a trim exists — so callers may pass it or leave it out.
   */
  durationSeconds?: number;
}

/** The outcome of {@link checkUpload}: accepted with a kind and any warnings, or refused. */
export type UploadCheck =
  | { ok: true; kind: MediaKind; warnings: string[] }
  | { ok: false; code: "unsupported" | "too_large"; message: string };

/** The one sentence for a file this app cannot read, with the accepted formats named (FR-008). */
export const UNSUPPORTED_MESSAGE =
  "We can't read that file. Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.";

/** The refusal for a file over its kind's cap, naming the cap (FR-007). */
const TOO_LARGE: Readonly<Record<MediaKind, string>> = {
  photo: "That photo is over 25MB.",
  video: "That video is over 200MB.",
};

/** The kind a MIME type belongs to, or `undefined` when it is not one this app accepts. */
function kindOf(type: string | undefined): MediaKind | undefined {
  if (type === undefined) return undefined;
  if (ALLOWED_PHOTO_TYPES.includes(type)) return "photo";
  if (ALLOWED_VIDEO_TYPES.includes(type)) return "video";
  return undefined;
}

/** True when a photo's long edge is under {@link LIMITS.smallPhotoWidth} (FR-008). */
export function isSmallPhoto(width: number): boolean {
  return width < LIMITS.smallPhotoWidth;
}

/**
 * Judges an upload (FR-007, FR-008). The sniffed type decides what the file is: a type
 * outside the accepted lists, or none at all, is `unsupported` with the accepted formats
 * named; a declared type of the other kind (a PNG uploaded under a video name) is
 * `unsupported` too, while an unknown declared type is ignored. Then the size is checked
 * against the cap for the sniffed kind and refused as `too_large` naming that cap. An
 * accepted photo whose long edge is under 1200 px is accepted with a warning that names its
 * width, never refused. Type is checked before size, so a 30 MB HEIC is `unsupported`.
 */
export function checkUpload(input: UploadInput): UploadCheck {
  const kind = kindOf(input.sniffedType);
  const declaredKind = kindOf(input.declaredType);
  if (kind === undefined || (declaredKind !== undefined && declaredKind !== kind)) {
    return { ok: false, code: "unsupported", message: UNSUPPORTED_MESSAGE };
  }
  const size = checkSize(kind, input.byteSize);
  if (!size.ok) return size;
  const warnings =
    kind === "photo" && input.width !== undefined && input.height !== undefined
      ? photoWarnings(input.width, input.height)
      : [];
  return { ok: true, kind, warnings };
}

/** The outcome of a size check: accepted, or `too_large` naming the cap. */
export type SizeCheck = { ok: true } | { ok: false; code: "too_large"; message: string };

/** `byteSize` against the cap of `kind` (FR-007). */
function checkSize(kind: MediaKind, byteSize: number): SizeCheck {
  const cap = kind === "photo" ? LIMITS.photoBytes : LIMITS.videoBytes;
  return byteSize > cap ? { ok: false, code: "too_large", message: TOO_LARGE[kind] } : { ok: true };
}

/**
 * The size rule as `beginUpload` applies it, before any byte moves (ADR-005 step 1): only
 * the declared type is known, so it decides which cap applies — an `image/*` type gets the
 * photo cap, anything else (a video, or a type the browser could not name) the video cap,
 * because the file may still turn out to be a video. The sniff at finalize judges again by
 * the real kind, so a photo declared as something else is still held to 25 MB in the end.
 */
export function checkDeclaredSize(input: { declaredType: string; byteSize: number }): SizeCheck {
  return checkSize(input.declaredType.startsWith("image/") ? "photo" : "video", input.byteSize);
}

/**
 * The warnings a photo of `width` × `height` is accepted with (FR-008): one sentence naming
 * the long edge when it is under 1200 px, otherwise none. `checkUpload` uses this for a
 * photo whose dimensions are known; the pipeline calls it directly once it has them.
 */
export function photoWarnings(width: number, height: number): string[] {
  const longEdge = Math.max(width, height);
  return isSmallPhoto(longEdge)
    ? [`That photo is ${longEdge}px wide — too small for the hero.`]
    : [];
}

/** A trim as seconds into the original, with the original's length to check it against. */
export interface TrimInput {
  start: number;
  end: number;
  originalDurationSeconds: number;
}

/** The outcome of {@link checkTrim}: accepted, or refused with a sentence naming the rule. */
export type TrimCheck = { ok: true } | { ok: false; message: string };

/** Seconds as whole milliseconds, so `23.03 − 8.03` is 15000 and not 15.000000000000002. */
function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * The one home of the trim rule (FR-078): a clip is `1 ≤ end − start ≤ 15` seconds and lies
 * inside the original (`0 ≤ start`, `end ≤ originalDurationSeconds`). The trim action, the
 * trim editor and `MediaAssetSchema` all call this; none of them repeats the numbers. Every
 * comparison is made on whole milliseconds, so decimal seconds from a slider never drift a
 * trim of exactly 15 s (or exactly 1 s) over the line. The refusal names the number the trim
 * broke — "1 second" or "15 seconds" — or says the range is outside the clip. Bounds are
 * checked first, so a range that leaves the clip is refused for that reason even when its
 * length is also wrong.
 */
export function checkTrim(input: TrimInput): TrimCheck {
  const startMs = toMs(input.start);
  const endMs = toMs(input.end);
  if (startMs < 0 || endMs > toMs(input.originalDurationSeconds)) {
    return { ok: false, message: "That range is outside the clip." };
  }
  const lengthMs = endMs - startMs;
  if (lengthMs < toMs(LIMITS.minClipSeconds)) {
    return { ok: false, message: `A clip must be at least ${LIMITS.minClipSeconds} second.` };
  }
  if (lengthMs > toMs(LIMITS.maxClipSeconds)) {
    return { ok: false, message: `A clip can be at most ${LIMITS.maxClipSeconds} seconds.` };
  }
  return { ok: true };
}
