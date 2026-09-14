import { z } from "zod";
import { REV_PATTERN } from "./public-path";
import { MediaIdSchema } from "../profile/schema";
import { checkTrim, LIMITS } from "./validation";

// The single definition of the media record (data-model.md → MediaAsset; ADR-005, ADR-015,
// ADR-016; contracts/profile-document.md guarantee 7). Ids and the manifest entry shape come
// from the profile schema — nothing here redefines them.

export { ResolvedMediaSchema, type ResolvedMedia } from "../profile/schema";

/** What a media file is, decided by sniffing its bytes, never by its name. */
const MediaKindSchema = z.enum(["photo", "video"]);

/** `"photo"` or `"video"`. */
export type MediaKind = z.infer<typeof MediaKindSchema>;

/**
 * The content-hash revision of a derived file (ADR-015): the first 10 hex characters of
 * the SHA-256 of its bytes, as `revOf` computes it. Fixed-alphabet and fixed-length, so a
 * rev can only ever name a file inside its own media folder. Anchored from `REV_PATTERN`
 * (`core/media/public-path.ts`) — the one definition of the character class, not a second
 * literal that happens to agree with it.
 */
export const RevSchema = z
  .string()
  .regex(new RegExp(`^${REV_PATTERN}$`), "Revisions are the first 10 hex characters of a SHA-256.");

const FocalSchema = z.strictObject({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

const AltSchema = z.strictObject({
  text: z.string().min(1).max(300),
  source: z.enum(["model", "volunteer"]),
});

const TrimSchema = z.strictObject({
  start: z.number(),
  end: z.number(),
});

const EnhancementSchema = z.strictObject({
  sourceMediaId: MediaIdSchema,
  recipe: z.literal("auto-v1"),
});

const RevisionsSchema = z.strictObject({
  clean: RevSchema.optional(),
  web: RevSchema.optional(),
  poster: RevSchema.optional(),
});

const MediaAssetShape = z.strictObject({
  schemaVersion: z.literal(1),
  id: MediaIdSchema,
  kind: MediaKindSchema,
  fileName: z.string().max(200),
  mimeType: z.string(),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive().optional(),
  focal: FocalSchema.default({ x: 50, y: 50 }),
  status: z.enum(["processing", "needs-trim", "ready"]),
  alt: AltSchema.nullable(),
  descriptionStatus: z.enum(["ready", "failed", "pending"]),
  originalDurationSeconds: z.number().positive().optional(),
  trim: TrimSchema.optional(),
  enhancement: EnhancementSchema.optional(),
  revisions: RevisionsSchema,
  createdAt: z.iso.datetime(),
});

type MediaAssetFields = z.infer<typeof MediaAssetShape>;

const VIDEO_ONLY: ReadonlyArray<"durationSeconds" | "originalDurationSeconds" | "trim"> = [
  "durationSeconds",
  "originalDurationSeconds",
  "trim",
];

function checkPhotoRules(asset: MediaAssetFields, ctx: z.RefinementCtx): void {
  for (const field of VIDEO_ONLY) {
    if (asset[field] !== undefined) {
      ctx.addIssue({ code: "custom", path: [field], message: `Only a video has ${field}.` });
    }
  }
  if (asset.status === "needs-trim") {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Only a video needs a trim." });
  }
}

function checkVideoRules(asset: MediaAssetFields, ctx: z.RefinementCtx): void {
  if (asset.enhancement !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["enhancement"],
      message: "Only a photo can be enhanced.",
    });
  }
  const original = asset.originalDurationSeconds;
  if (original === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["originalDurationSeconds"],
      message: "A video records the length of its original.",
    });
    return;
  }
  const untrimmedLong = original > LIMITS.maxClipSeconds && asset.trim === undefined;
  if (asset.status === "needs-trim" && !untrimmedLong) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: `Only a video over ${LIMITS.maxClipSeconds} seconds with no trim needs a trim.`,
    });
  }
  if (untrimmedLong && asset.status !== "needs-trim") {
    ctx.addIssue({
      code: "custom",
      path: ["trim"],
      message: `A video over ${LIMITS.maxClipSeconds} seconds needs a trim first.`,
    });
  }
  if (asset.trim !== undefined) {
    const trim = checkTrim({ ...asset.trim, originalDurationSeconds: original });
    if (!trim.ok) {
      ctx.addIssue({ code: "custom", path: ["trim"], message: trim.message });
    }
  }
}

/**
 * The record kept beside every uploaded or enhanced file (data-model.md → MediaAsset),
 * stored as `profiles/{pid}/media/{mid}/asset.json` and read back as `unknown`. Strict at
 * every level, so an unknown key is rejected rather than carried along. Beyond the field
 * bounds it guarantees: `durationSeconds`, `originalDurationSeconds` and `trim` appear only
 * on a video, and a video always has `originalDurationSeconds`; `enhancement` appears only
 * on a photo; `status: "needs-trim"` is possible only for a video whose original is over
 * 15 s and that has no trim, and such a video must be `needs-trim` — an untrimmed long
 * original can never be `ready` (FR-078); a `trim` passes `checkTrim` (1–15 s, inside the
 * original).
 * `focal` defaults to the centre. `schemaVersion` is a literal `1`; `migrateAsset` is the
 * only thing that changes a version. `revisions` hold revs, never paths, so a record cannot
 * point outside its own folder (ADR-015).
 */
export const MediaAssetSchema = MediaAssetShape.superRefine((asset, ctx) => {
  if (asset.kind === "photo") {
    checkPhotoRules(asset, ctx);
  } else {
    checkVideoRules(asset, ctx);
  }
});

/** A media record as stored. See {@link MediaAssetSchema}. */
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
