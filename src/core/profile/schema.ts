import { z } from "zod";
import { MEDIA_ID_PATTERN, PUBLIC_MEDIA_PATH } from "../media/public-path";
import { HttpUrlSchema, RichTextSchema } from "./rich-text";

// The single definition of the profile document (contracts/profile-document.md, guarantee
// 1; data-model.md → ProfileDocument, Block, Theme). Every type below is inferred from its
// schema; no other file declares a profile shape.

/**
 * The id of an uploaded or enhanced media file: 8 chars of `[a-z2-7]` (base32, no 0/1/8/9).
 * Anchored from `MEDIA_ID_PATTERN` (`core/media/public-path.ts`) — the one definition of
 * the character class, not a second literal that happens to agree with it.
 */
export const MediaIdSchema = z
  .string()
  .regex(new RegExp(`^${MEDIA_ID_PATTERN}$`), "Media ids are 8 characters.");

/** A media id as stored in a document. See {@link MediaIdSchema}. */
export type MediaId = z.infer<typeof MediaIdSchema>;

/** A profile's id: 8 chars of `[a-z2-7]`, immutable, the trailing part of the public URL. */
export const ProfileIdSchema = z.string().regex(/^[a-z2-7]{8}$/, "Profile ids are 8 characters.");

/** A block's id: 12 chars of `[a-z2-7]`, unique within its document. */
export const BlockIdSchema = z.string().regex(/^[a-z2-7]{12}$/, "Block ids are 12 characters.");

/**
 * The length caps of every text the volunteer types and the gallery's size, in characters
 * and photos (data-model.md → Block, ProfileDocument). The schemas below are the only place
 * these are enforced; the builder reads the same numbers for an input's `maxLength` and a
 * `{n}/80` counter, so the two can never disagree.
 */
export const FIELD_LIMITS = {
  name: 60,
  age: 30,
  tagline: 80,
  caption: 200,
  sceneCaption: 120,
  cardTitle: 60,
  cardText: 240,
  quoteText: 200,
  attribution: 60,
  galleryPhotos: 12,
} as const;

/** A media slot that may still be empty in a draft; `null` blocks publishing. */
const MediaSlotSchema = MediaIdSchema.nullable();

const HeroBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("hero"),
  mediaId: MediaSlotSchema,
});

const BioBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("bio"),
  content: RichTextSchema,
});

const PhotoBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("photo"),
  mediaId: MediaSlotSchema,
  caption: z.string().max(FIELD_LIMITS.caption).optional(),
});

const GalleryBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("gallery"),
  mediaIds: z.array(MediaIdSchema).max(FIELD_LIMITS.galleryPhotos),
});

const VideoBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("video"),
  mediaId: MediaSlotSchema,
});

const DaySceneSchema = z.strictObject({
  mediaId: MediaSlotSchema,
  caption: z.string().max(FIELD_LIMITS.sceneCaption),
});

const DayBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("day"),
  scenes: z.array(DaySceneSchema).length(3),
});

const NeedsCardSchema = z.strictObject({
  title: z.string().max(FIELD_LIMITS.cardTitle),
  text: z.string().max(FIELD_LIMITS.cardText),
});

const NeedsBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("needs"),
  cards: z.array(NeedsCardSchema).min(1).max(3),
});

const QuoteBlockSchema = z.strictObject({
  id: BlockIdSchema,
  type: z.literal("quote"),
  mediaId: MediaSlotSchema,
  text: z.string().max(FIELD_LIMITS.quoteText),
  attribution: z.string().max(FIELD_LIMITS.attribution).optional(),
});

/**
 * One section of a profile, discriminated on `type`. Media is referenced by id only —
 * nothing about a file is ever copied into the document — and every block object is
 * strict, so a key the schema does not know is a validation error, not silently kept.
 */
export const BlockSchema = z.discriminatedUnion("type", [
  HeroBlockSchema,
  BioBlockSchema,
  PhotoBlockSchema,
  GalleryBlockSchema,
  VideoBlockSchema,
  DayBlockSchema,
  NeedsBlockSchema,
  QuoteBlockSchema,
]);

/** One section of a profile. See {@link BlockSchema}. */
export type Block = z.infer<typeof BlockSchema>;

/**
 * The volunteer's look choices (data-model.md → Theme). A document never stores a colour;
 * `resolveTheme` turns these three values into hex strings. Every preset passes AA at the
 * defaults, and `warmth` / `contrast` are bounded so the sliders can only drift a little.
 */
export const ThemeSchema = z.strictObject({
  preset: z.enum(["paper", "card", "night", "sand"]).default("paper"),
  warmth: z.number().min(0).max(1).default(0.5),
  contrast: z.number().min(0).max(1).default(0.5),
});

/** A profile's theme. See {@link ThemeSchema}. */
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * Every media id the blocks reference, unique and in document order: hero, photo, video
 * and quote slots, gallery lists and day scenes, with empty (`null`) slots skipped. This is
 * the set the publish manifest must cover and the set a readiness check inspects.
 */
export function referencedMediaIds(doc: ProfileDocument): MediaId[] {
  const ids = doc.blocks.flatMap(mediaIdsOf);
  return [...new Set(ids)];
}

function mediaIdsOf(block: Block): MediaId[] {
  switch (block.type) {
    case "gallery":
      return block.mediaIds;
    case "day":
      return block.scenes.flatMap((scene) => (scene.mediaId === null ? [] : [scene.mediaId]));
    case "bio":
    case "needs":
      return [];
    default:
      return block.mediaId === null ? [] : [block.mediaId];
  }
}

function checkBlockRules(blocks: readonly Block[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  let heroSeen = false;
  blocks.forEach((block, index) => {
    if (seen.has(block.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["blocks", index, "id"],
        message: `Block id "${block.id}" is used more than once.`,
      });
    }
    seen.add(block.id);
    if (block.type === "hero") {
      if (heroSeen) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks", index],
          message: "A profile has at most one hero.",
        });
      }
      heroSeen = true;
    }
  });
  if (blocks[0]?.type !== "hero") {
    ctx.addIssue({
      code: "custom",
      path: ["blocks", 0],
      message: "The first section must be the hero.",
    });
  }
}

/**
 * The durable asset (data-model.md → ProfileDocument): what the builder edits, the store
 * persists and every surface reads. Strict at the top level, so an unknown key is rejected
 * rather than carried along. Beyond the per-field bounds it guarantees that block ids are
 * unique within the document, that there is at most one hero, and that the first block is
 * always the hero (F1: the hero is mandatory and fixed at the top of every profile — it can
 * be neither removed nor moved off index 0; a v1 rule — no stored document predates it, so
 * this ships as a refinement of the existing schema rather than a schema version bump, per
 * the Checkpoint 2 waiver of constitution Principle VI recorded in F1's commit).
 * `schemaVersion` is a literal `1` — a document without it, or with any other value, is
 * invalid; `migrate` is the only thing that changes a version.
 */
export const ProfileDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: ProfileIdSchema,
    name: z.string().max(FIELD_LIMITS.name),
    age: z.string().max(FIELD_LIMITS.age).optional(),
    sex: z.enum(["female", "male", "unknown"]).optional(),
    tagline: z.string().max(FIELD_LIMITS.tagline).optional(),
    blocks: z.array(BlockSchema).max(30),
    theme: ThemeSchema,
    updatedAt: z.iso.datetime(),
  })
  .superRefine((doc, ctx) => checkBlockRules(doc.blocks, ctx));

/** A profile as edited and stored. See {@link ProfileDocumentSchema}. */
export type ProfileDocument = z.infer<typeof ProfileDocumentSchema>;

/**
 * A URL a public surface may load media from: an `http:`/`https:` URL (so it parses) that
 * is in fact `https:`. The published page and the carousel never load over plain `http:`.
 */
export const HttpsUrlSchema = HttpUrlSchema.refine(
  (value) => value.startsWith("https://"),
  "Media URLs must start with https://.",
);

/**
 * Where a manifest entry may point: a root-relative `/media/…` path in the layout's own
 * grammar — what every store answers, since this app serves the derived files itself (F23) —
 * or an `https:` URL, kept only for a manifest published before F23 that names the bucket.
 * A plain `http:` URL and any other path are rejected.
 */
export const PublicMediaUrlSchema = z.union([
  HttpsUrlSchema,
  z.string().regex(PUBLIC_MEDIA_PATH, "Media paths must be /media/profiles/{pid}/media/{mid}/…"),
]);

/**
 * One entry of the publish manifest (data-model.md → ResolvedMedia, ADR-015): everything a
 * public surface needs to show a photo or clip, resolved at publish time so it never reads
 * the private media record. `src` and `poster` carry the content-hash revision in their
 * name and so never change meaning.
 */
export const ResolvedMediaSchema = z.strictObject({
  kind: z.enum(["photo", "video"]),
  src: PublicMediaUrlSchema,
  poster: PublicMediaUrlSchema.optional(),
  alt: z.string(),
  focal: z.strictObject({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive().optional(),
});

/** One resolved manifest entry. See {@link ResolvedMediaSchema}. */
export type ResolvedMedia = z.infer<typeof ResolvedMediaSchema>;

/**
 * The published copy (contracts/profile-document.md, guarantee 6): the draft shape plus
 * `publishedAt`, a cosmetic `slug` and the media manifest. Guarantees that every media id
 * the blocks reference is a key of `media`, so a public page can never meet an id it cannot
 * resolve, and that a video section's entry is of kind `video` (data-model.md → Block).
 * Every draft rule still applies.
 */
export const PublishedDocumentSchema = ProfileDocumentSchema.extend({
  publishedAt: z.iso.datetime(),
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/, "Slugs are 1–40 chars of a-z, 0-9 and -."),
  media: z.record(MediaIdSchema, ResolvedMediaSchema),
}).superRefine(checkManifest);

type ManifestDocument = ProfileDocument & { media: Record<string, ResolvedMedia> };

function checkManifest(doc: ManifestDocument, ctx: z.RefinementCtx): void {
  for (const id of referencedMediaIds(doc)) {
    if (!Object.hasOwn(doc.media, id)) {
      ctx.addIssue({
        code: "custom",
        path: ["media", id],
        message: `The manifest has no entry for media "${id}", which a block references.`,
      });
    }
  }
  for (const block of doc.blocks) {
    if (block.type === "video" && block.mediaId !== null) {
      const entry = doc.media[block.mediaId];
      if (entry && entry.kind !== "video") {
        ctx.addIssue({
          code: "custom",
          path: ["media", block.mediaId],
          message: `Media "${block.mediaId}" is used by a video section but is not a video.`,
        });
      }
    }
  }
}

/** A published profile with its media manifest. See {@link PublishedDocumentSchema}. */
export type PublishedDocument = z.infer<typeof PublishedDocumentSchema>;
