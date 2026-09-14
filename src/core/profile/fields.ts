import { z, type ZodType } from "zod";
import { err, ok, type Result } from "../result";
import type { OperationError, SetFieldTarget } from "./operations";
import { needsPhrase, sectionStrings } from "./pronouns";
import { type RichText } from "./rich-text";
import {
  BlockSchema,
  FIELD_LIMITS,
  ProfileDocumentSchema,
  type Block,
  type MediaId,
  type ProfileDocument,
} from "./schema";

// The path grammar of `set_field` and the slot grammar of `replace_image` (data-model.md →
// EditOperation): which paths a section has, the schema each field is checked against, what
// it holds now and how to write it. Every schema here is drawn from the block schema, never
// redefined. `applyOperation` and `describeOperation` both read this table, so the two can
// never disagree about what a field is.

const [
  HeroBlockSchema,
  BioBlockSchema,
  PhotoBlockSchema,
  GalleryBlockSchema,
  VideoBlockSchema,
  DayBlockSchema,
  NeedsBlockSchema,
  QuoteBlockSchema,
] = BlockSchema.options;

/**
 * A block as `add_block` receives it: the block without its `id`, which the builder hands
 * out. Day scenes and needs cards carry no ids of their own, so nothing else changes.
 *
 * Each variant carries a one-line description (F52). The description is the one part of
 * a variant that reaches the model intact — the provider drops `additionalProperties`,
 * `maxLength` and `pattern` on the way to Gemini — so it is where "a gallery has no
 * caption" and the text limits get said, with the limits read from `FIELD_LIMITS` rather
 * than retyped.
 */
export const BlockInputSchema = z.discriminatedUnion("type", [
  HeroBlockSchema.omit({ id: true }).describe(
    "The hero. It is already on every page and cannot be added again.",
  ),
  BioBlockSchema.omit({ id: true }).describe(
    'The bio: `content` is rich text — `{ "paragraphs": [{ "runs": [{ "text": "…" }] }] }`, ' +
      'or `{ "paragraphs": [] }` for an empty bio.',
  ),
  PhotoBlockSchema.omit({ id: true }).describe(
    `One photo in \`mediaId\`, with an optional \`caption\` (${FIELD_LIMITS.caption} characters or fewer).`,
  ),
  GalleryBlockSchema.omit({ id: true }).describe(
    `A gallery: \`mediaIds\`, up to ${FIELD_LIMITS.galleryPhotos} photo ids, and nothing else — a gallery has no caption.`,
  ),
  VideoBlockSchema.omit({ id: true }).describe("One clip in `mediaId`, and nothing else."),
  DayBlockSchema.omit({ id: true }).describe(
    `"A day in her life": exactly three \`scenes\`, each \`{ "mediaId", "caption" }\` (caption ${FIELD_LIMITS.sceneCaption} characters or fewer).`,
  ),
  NeedsBlockSchema.omit({ id: true }).describe(
    `"What she needs": one to three \`cards\`, each \`{ "title", "text" }\` (${FIELD_LIMITS.cardTitle} and ${FIELD_LIMITS.cardText} characters or fewer).`,
  ),
  QuoteBlockSchema.omit({ id: true }).describe(
    `A quote: \`text\` (${FIELD_LIMITS.quoteText} characters or fewer), \`mediaId\` (a photo id, or null for none) and an optional \`attribution\` (${FIELD_LIMITS.attribution} or fewer).`,
  ),
]);

/** A block without its `id`. See {@link BlockInputSchema}. */
export type BlockInput = z.infer<typeof BlockInputSchema>;

const ProfileFieldPathSchema = z.enum(["name", "age", "sex", "tagline"]);

const BlockFieldPathSchema = z.enum([
  "content",
  "caption",
  "mediaIds",
  "text",
  "attribution",
  "cards",
  "scenes.0.caption",
  "scenes.1.caption",
  "scenes.2.caption",
  "cards.0.title",
  "cards.0.text",
  "cards.1.title",
  "cards.1.text",
  "cards.2.title",
  "cards.2.text",
]);

/**
 * Every path `set_field` can name: the four profile fields and the block fields per type
 * (data-model.md → EditOperation). A path is a closed literal — `scenes.5.caption` or `foo`
 * fails to parse — and whether a given section has it is decided by {@link fieldOf}.
 */
export const FieldPathSchema = z.union([ProfileFieldPathSchema, BlockFieldPathSchema]);

/** One of the paths in {@link FieldPathSchema}. */
export type FieldPath = z.infer<typeof FieldPathSchema>;

/** A needs card, as the block schema defines it. */
type NeedsCard = z.infer<typeof NeedsBlockSchema.shape.cards.element>;

/**
 * The five shapes a `set_field` value can take: a string, `null`, the bio's rich text, a
 * gallery's list of media ids, or the whole list of needs cards. Only the shape is settled
 * here — the lists are unbounded — so that whether a value fits its field, including the
 * gallery's twelve and the cards' one to three, is checked against the field's own schema
 * by `applyOperation` and refused as "That value doesn't fit the gallery photos.", never
 * as a malformed edit. `null` is the one shape no field schema itself accepts: it means
 * "clear this field back to unset", which `applyOperation` honours only for `sex` (F10) —
 * everywhere else a `null` value parses here but is refused by `applyOperation`.
 */
export const FieldValueSchema = z.union([
  z.string(),
  z.null(),
  BioBlockSchema.shape.content,
  z.array(GalleryBlockSchema.shape.mediaIds.element),
  z.array(NeedsBlockSchema.shape.cards.element),
]);

/** What a `set_field` may carry. See {@link FieldValueSchema}. */
export type FieldValue = z.infer<typeof FieldValueSchema>;

/**
 * How each section is named in a sentence a person reads. `SECTION_LABEL` itself is the
 * fallback shape every consumer used before F41 — kept as-is, `her`, because
 * `src/ui/builder/use-document.ts` still reads it directly for its own "Duplicate the X."
 * sentence and does not carry the cat's sex to this module. {@link sectionLabel} is the one
 * every other caller uses instead: the same words, except the day and needs sections read
 * with the cat's own recorded pronoun.
 */
export const SECTION_LABEL: Record<Block["type"], string> = {
  hero: "hero",
  bio: "bio",
  photo: "photo section",
  gallery: "gallery",
  video: "video section",
  day: '"A day in her life" section',
  needs: '"What she needs" section',
  quote: "quote",
};

/** `SECTION_LABEL[type]`, with the day and needs sections read in the cat's own pronoun. */
export function sectionLabel(type: Block["type"], sex: ProfileDocument["sex"]): string {
  if (type === "day") return `"${sectionStrings(sex).day}" section`;
  if (type === "needs") return `"${needsPhrase(sex)}" section`;
  return SECTION_LABEL[type];
}

/**
 * How each field is named in a sentence a person reads. `FIELD_LABEL` is the fallback
 * shape kept for the same reason as {@link SECTION_LABEL}; every field but `cards` is
 * ungendered, so only {@link fieldLabel}'s one special case ever differs from it.
 */
export const FIELD_LABEL: Record<FieldPath, string> = {
  name: "name",
  age: "age",
  sex: "sex",
  tagline: "tagline",
  content: "bio",
  caption: "caption",
  mediaIds: "gallery photos",
  text: "quote",
  attribution: "attribution",
  cards: '"What she needs" cards',
  "scenes.0.caption": "caption of scene 1",
  "scenes.1.caption": "caption of scene 2",
  "scenes.2.caption": "caption of scene 3",
  "cards.0.title": "title of card 1",
  "cards.0.text": "text of card 1",
  "cards.1.title": "title of card 2",
  "cards.1.text": "text of card 2",
  "cards.2.title": "title of card 3",
  "cards.2.text": "text of card 3",
};

/** `FIELD_LABEL[path]`, with the needs cards' bulk field read in the cat's own pronoun. */
export function fieldLabel(path: FieldPath, sex: ProfileDocument["sex"]): string {
  return path === "cards" ? `"${needsPhrase(sex)}" cards` : FIELD_LABEL[path];
}

interface FieldBase {
  /** The field's name in a sentence, from {@link FIELD_LABEL}. */
  label: string;
  /** The document with the field set to `value`, which MUST have passed `schema` first. */
  set: (value: unknown) => unknown;
}

/**
 * One field of the document, resolved against a concrete document: its schema (drawn from
 * the block schema), what it holds now, and a writer. `kind` says which of the four value
 * shapes the field takes; `current` is typed to match. A text field that is unset reads as
 * `""`.
 */
export type FieldSpec = FieldBase &
  (
    | { kind: "text"; schema: ZodType<string | undefined>; current: string }
    | { kind: "richText"; schema: ZodType<RichText>; current: RichText }
    | { kind: "mediaIds"; schema: ZodType<MediaId[]>; current: MediaId[] }
    | { kind: "cards"; schema: ZodType<NeedsCard[]>; current: NeedsCard[] }
  );

type FieldResult = Result<FieldSpec, OperationError>;

/** The block with `id`, or `undefined` when the page has no such section. */
export function blockById(doc: ProfileDocument, id: string): Block | undefined {
  return doc.blocks.find((block) => block.id === id);
}

/** `doc` with the block `id` replaced by `block` (a plain object the document parse types). */
export function withBlock(doc: ProfileDocument, id: string, block: unknown): unknown {
  return { ...doc, blocks: doc.blocks.map((current) => (current.id === id ? block : current)) };
}

function noField(section: string, path: string): FieldResult {
  return err({ code: "invalid", reason: `The ${section} has no field called "${path}".` });
}

function textField(
  path: FieldPath,
  schema: ZodType<string | undefined>,
  current: string | undefined,
  set: (value: unknown) => unknown,
): FieldSpec {
  return { kind: "text", label: FIELD_LABEL[path], schema, current: current ?? "", set };
}

/**
 * The profile-level field at `path`, or `invalid` for a block path: `name`, `age`, `sex`
 * and `tagline` are the only fields the profile itself has.
 */
function profileFieldOf(doc: ProfileDocument, path: FieldPath): FieldResult {
  const parsed = ProfileFieldPathSchema.safeParse(path);
  if (!parsed.success) return noField("profile", path);
  const key = parsed.data;
  const schema = ProfileDocumentSchema.shape[key];
  return ok(textField(key, schema, doc[key], (value) => ({ ...doc, [key]: value })));
}

const SCENE_CAPTION = /^scenes\.([0-2])\.caption$/;
const CARD_FIELD = /^cards\.([0-2])\.(title|text)$/;

type DayBlock = Extract<Block, { type: "day" }>;
type NeedsBlock = Extract<Block, { type: "needs" }>;
type QuoteBlock = Extract<Block, { type: "quote" }>;

function quoteField(doc: ProfileDocument, block: QuoteBlock, path: FieldPath): FieldResult {
  if (path === "text") {
    const set = (text: unknown) => withBlock(doc, block.id, { ...block, text });
    return ok(textField(path, QuoteBlockSchema.shape.text, block.text, set));
  }
  if (path === "attribution") {
    const set = (attribution: unknown) => withBlock(doc, block.id, { ...block, attribution });
    return ok(textField(path, QuoteBlockSchema.shape.attribution, block.attribution, set));
  }
  return noField(SECTION_LABEL.quote, path);
}

function dayField(doc: ProfileDocument, block: DayBlock, path: FieldPath): FieldResult {
  const match = SCENE_CAPTION.exec(path);
  if (!match) return noField(sectionLabel("day", doc.sex), path);
  const index = Number(match[1]);
  const set = (caption: unknown) =>
    withBlock(doc, block.id, {
      ...block,
      scenes: block.scenes.map((scene, i) => (i === index ? { ...scene, caption } : scene)),
    });
  const schema = DayBlockSchema.shape.scenes.element.shape.caption;
  return ok(textField(path, schema, block.scenes.map((scene) => scene.caption)[index], set));
}

function needsField(doc: ProfileDocument, block: NeedsBlock, path: FieldPath): FieldResult {
  if (path === "cards") {
    const set = (cards: unknown) => withBlock(doc, block.id, { ...block, cards });
    const spec: FieldSpec = {
      kind: "cards",
      label: fieldLabel(path, doc.sex),
      schema: NeedsBlockSchema.shape.cards,
      current: block.cards,
      set,
    };
    return ok(spec);
  }
  const match = CARD_FIELD.exec(path);
  if (!match) return noField(sectionLabel("needs", doc.sex), path);
  const index = Number(match[1]);
  const card = block.cards[index];
  if (!card) {
    const reason = `There is no card ${index + 1} in the ${sectionLabel("needs", doc.sex)}.`;
    return err({ code: "refused", reason });
  }
  const isTitle = match[2] === "title";
  const cardShape = NeedsBlockSchema.shape.cards.element.shape;
  const set = (value: unknown) =>
    withBlock(doc, block.id, {
      ...block,
      cards: block.cards.map((current, i) => {
        if (i !== index) return current;
        return isTitle ? { ...current, title: value } : { ...current, text: value };
      }),
    });
  const schema = isTitle ? cardShape.title : cardShape.text;
  return ok(textField(path, schema, isTitle ? card.title : card.text, set));
}

function blockFieldOf(doc: ProfileDocument, block: Block, path: FieldPath): FieldResult {
  switch (block.type) {
    case "bio":
      if (path === "content") {
        const set = (content: unknown) => withBlock(doc, block.id, { ...block, content });
        const schema = BioBlockSchema.shape.content;
        return ok({
          kind: "richText",
          label: FIELD_LABEL[path],
          schema,
          current: block.content,
          set,
        });
      }
      break;
    case "photo":
      if (path === "caption") {
        const set = (caption: unknown) => withBlock(doc, block.id, { ...block, caption });
        return ok(textField(path, PhotoBlockSchema.shape.caption, block.caption, set));
      }
      break;
    case "gallery":
      if (path === "mediaIds") {
        const set = (mediaIds: unknown) => withBlock(doc, block.id, { ...block, mediaIds });
        const schema = GalleryBlockSchema.shape.mediaIds;
        return ok({
          kind: "mediaIds",
          label: FIELD_LABEL[path],
          schema,
          current: block.mediaIds,
          set,
        });
      }
      break;
    case "quote":
      return quoteField(doc, block, path);
    case "day":
      return dayField(doc, block, path);
    case "needs":
      return needsField(doc, block, path);
    default:
      // hero and video hold only a media slot, which `replace_image` fills.
      break;
  }
  return noField(SECTION_LABEL[block.type], path);
}

/**
 * Resolves a `set_field` target and path against `doc`. Returns the field, or `invalid`
 * when the target has no such path (a profile path on a block, `caption` on a bio, …),
 * `refused` when the section is not on the page or the path names a card the section
 * does not have. The path grammar per type is data-model.md's table: `content` (bio),
 * `caption` (photo), `mediaIds` (gallery), `scenes.{0-2}.caption` (day), `cards` or
 * `cards.{0-2}.title|text` (needs), `text` / `attribution` (quote); hero and video have
 * no settable field.
 */
export function fieldOf(
  doc: ProfileDocument,
  target: SetFieldTarget,
  path: FieldPath,
): FieldResult {
  if (target.kind === "profile") return profileFieldOf(doc, path);
  const block = blockById(doc, target.blockId);
  if (!block) return err(missingBlock(target.blockId));
  return blockFieldOf(doc, block, path);
}

/** The `refused` error for a block id the page does not have. */
export function missingBlock(blockId: string): OperationError {
  return { code: "refused", reason: `No section with id "${blockId}" is on the page.` };
}
