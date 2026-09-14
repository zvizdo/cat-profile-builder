import { z, type ZodError } from "zod";
import type { ErrorCode } from "../errors";
import type { MediaAsset } from "../media/schema";
import { err, ok, type Result } from "../result";
import {
  BlockInputSchema,
  fieldOf,
  FieldPathSchema,
  FieldValueSchema,
  missingBlock,
  sectionLabel,
} from "./fields";
import { imageSlotOf } from "./image-slots";
import {
  BlockIdSchema,
  MediaIdSchema,
  ProfileDocumentSchema,
  referencedMediaIds,
  ThemeSchema,
  type Block,
  type MediaId,
  type ProfileDocument,
} from "./schema";

// The only vocabulary in which a profile document changes (data-model.md → EditOperation,
// ADR-002, constitution Principle VIII). The builder's own controls and the AI helper both
// go through `applyOperation`, so validation, undo and the "what changed" line are one path.

export { describeOperation, type Description, type Readout } from "./describe";
export { BlockInputSchema, FieldPathSchema, type BlockInput, type FieldPath } from "./fields";

/**
 * Why an operation was not applied. `invalid` is a malformed operation — a path the section
 * does not have, a value that does not fit the field, a slot where none applies. `refused`
 * is a well-formed operation the document cannot accept — a section or media id that is not
 * there, a clip in a photo slot, a second hero, an order that is not a permutation, a slot
 * past the end, or a result that fails the document schema. `reason` is a plain sentence a
 * person can read.
 */
export interface OperationError {
  code: Extract<ErrorCode, "invalid" | "refused">;
  reason: string;
}

const SetFieldTargetSchema = z.union([
  z.strictObject({ kind: z.literal("profile") }),
  z.strictObject({ kind: z.literal("block"), blockId: BlockIdSchema }),
]);

/** What a `set_field` writes to: the profile itself, or one block by id. */
export type SetFieldTarget = z.infer<typeof SetFieldTargetSchema>;

/**
 * Set one field of the profile or of a block. `path` is one of the closed set of paths
 * (`FieldPathSchema`); whether the target has it, and whether `value` fits it, is checked
 * against the document by `applyOperation`.
 */
export const SetFieldOperationSchema = z.strictObject({
  op: z.literal("set_field"),
  target: SetFieldTargetSchema,
  path: FieldPathSchema,
  value: FieldValueSchema,
});

/** Add a block (without an id — the context hands one out) at `index`, or at the end. */
export const AddBlockOperationSchema = z.strictObject({
  op: z.literal("add_block"),
  block: BlockInputSchema,
  index: z.number().int().nonnegative().optional(),
});

/** Remove the block with `blockId`. */
export const RemoveBlockOperationSchema = z.strictObject({
  op: z.literal("remove_block"),
  blockId: BlockIdSchema,
});

/** Put the blocks in the order given, which must name every current id exactly once. */
export const ReorderBlocksOperationSchema = z.strictObject({
  op: z.literal("reorder_blocks"),
  order: z.array(BlockIdSchema),
});

/** Change the theme's preset, warmth or contrast; at least one must be named. */
export const SetThemeOperationSchema = z
  .strictObject({
    op: z.literal("set_theme"),
    preset: ThemeSchema.shape.preset.removeDefault().optional(),
    warmth: ThemeSchema.shape.warmth.removeDefault().optional(),
    contrast: ThemeSchema.shape.contrast.removeDefault().optional(),
  })
  .refine(
    (theme) =>
      theme.preset !== undefined || theme.warmth !== undefined || theme.contrast !== undefined,
    "A theme change names a preset, a warmth or a contrast.",
  );

/**
 * Put `mediaId` in a block's media slot. `slot` is required for a gallery (`0..length`,
 * where `length` appends) and a day section (`0..2`), and must be absent otherwise.
 */
export const ReplaceImageOperationSchema = z.strictObject({
  op: z.literal("replace_image"),
  blockId: BlockIdSchema,
  mediaId: MediaIdSchema,
  slot: z.number().int().nonnegative().optional(),
});

/**
 * The six operations, discriminated on `op` (FR-039). Every member is a strict object, so
 * a key the schema does not know is a parse failure; the helper's edit tools register each
 * member as its input schema.
 */
export const EditOperationSchema = z.discriminatedUnion("op", [
  SetFieldOperationSchema,
  AddBlockOperationSchema,
  RemoveBlockOperationSchema,
  ReorderBlocksOperationSchema,
  SetThemeOperationSchema,
  ReplaceImageOperationSchema,
]);

/** One of the six edit operations. See {@link EditOperationSchema}. */
export type EditOperation = z.infer<typeof EditOperationSchema>;
export type SetFieldOperation = z.infer<typeof SetFieldOperationSchema>;
export type AddBlockOperation = z.infer<typeof AddBlockOperationSchema>;
export type RemoveBlockOperation = z.infer<typeof RemoveBlockOperationSchema>;
export type ReorderBlocksOperation = z.infer<typeof ReorderBlocksOperationSchema>;
export type SetThemeOperation = z.infer<typeof SetThemeOperationSchema>;
export type ReplaceImageOperation = z.infer<typeof ReplaceImageOperationSchema>;

/**
 * What the operations need to know about a media record: its id, whether it is a photo or
 * a clip, and what it was enhanced from. A full `MediaAsset` is assignable.
 */
export type MediaRef = Pick<MediaAsset, "id" | "kind" | "enhancement">;

/** What `applyOperation` is given beside the document. */
export interface ApplyContext {
  /** The media this profile owns; an id outside it is refused (FR-040). */
  assets: readonly MediaRef[];
  /** A fresh 12-character block id for `add_block`. */
  newBlockId: () => string;
}

type Change = Result<unknown, OperationError>;

function issuePaths(error: ZodError): string {
  return error.issues.map((issue) => issue.path.join(".")).join(", ");
}

/**
 * Applies one operation to `doc` and returns the new document, or the error naming what was
 * refused. Pure: `doc` is never mutated and the result shares no object with it. The
 * operation is validated first (a typed but malformed one is `invalid`), then applied, then
 * the result is validated against `ProfileDocumentSchema` and `refused` if it fails — so a
 * document that comes out of here is always a legal one (Principle VIII, FR-040). Every
 * media id an operation newly places must be in `ctx.assets`, a clip for a video section
 * and a photo anywhere else, or the operation is `refused` rather than landing as missing
 * media; an id a gallery already holds is not re-checked, so a photo the library has lost
 * can still be moved or removed. A second hero is refused (FR-021).
 */
export function applyOperation(
  doc: ProfileDocument,
  op: EditOperation,
  ctx: ApplyContext,
): Result<ProfileDocument, OperationError> {
  const parsed = EditOperationSchema.safeParse(op);
  if (!parsed.success) {
    const paths = issuePaths(parsed.error);
    const at = paths === "" ? "" : ` at ${paths}`;
    return err({ code: "invalid", reason: `That edit isn't well formed${at}.` });
  }
  const candidate = change(doc, parsed.data, ctx);
  if (!candidate.ok) return candidate;
  const next = ProfileDocumentSchema.safeParse(candidate.value);
  if (!next.success) {
    const reason = `The page can't take that change (${issuePaths(next.error)}).`;
    return err({ code: "refused", reason });
  }
  return ok(next.data);
}

function change(doc: ProfileDocument, op: EditOperation, ctx: ApplyContext): Change {
  switch (op.op) {
    case "set_field":
      return setField(doc, op, ctx);
    case "add_block":
      return addBlock(doc, op, ctx);
    case "remove_block":
      return removeBlock(doc, op);
    case "reorder_blocks":
      return reorderBlocks(doc, op);
    case "set_theme":
      return ok(setTheme(doc, op));
    case "replace_image":
      return replaceImage(doc, op, ctx);
  }
}

/**
 * Every id in `ids` must be owned and of `kind`, or the first problem is returned.
 * `where` names the slot in the sentence (`the gallery`).
 */
function checkMedia(
  ctx: ApplyContext,
  ids: readonly MediaId[],
  kind: MediaRef["kind"],
  where: string,
): OperationError | undefined {
  for (const id of ids) {
    const asset = ctx.assets.find((candidate) => candidate.id === id);
    if (!asset) {
      return { code: "refused", reason: `No photo or clip with id "${id}" is in the library.` };
    }
    if (asset.kind !== kind) {
      const reason =
        kind === "photo"
          ? `"${id}" is a clip, and ${where} takes photos.`
          : `"${id}" is a photo, and ${where} takes a clip.`;
      return { code: "refused", reason };
    }
  }
  return undefined;
}

function setField(doc: ProfileDocument, op: SetFieldOperation, ctx: ApplyContext): Change {
  const field = fieldOf(doc, op.target, op.path);
  if (!field.ok) return field;
  const spec = field.value;
  // `null` clears a field back to unset (F10) — but only `sex` goes back to "not set" at
  // any time; everywhere else a field's own schema never accepts `null` (it is a shape
  // `FieldValueSchema` allows generally, settled here per field), so it is invalid.
  if (op.value === null) {
    if (op.target.kind === "profile" && op.path === "sex") return ok(spec.set(undefined));
    return err({ code: "invalid", reason: `That value doesn't fit the ${spec.label}.` });
  }
  const value = spec.schema.safeParse(op.value);
  if (!value.success) {
    return err({ code: "invalid", reason: `That value doesn't fit the ${spec.label}.` });
  }
  if (spec.kind === "mediaIds") {
    // Only ids new to the list are checked: one the library has since lost stays where it
    // is and can still be moved or taken out, so a gallery is never stuck on a missing photo.
    const added = spec.schema.parse(op.value).filter((id) => !spec.current.includes(id));
    const problem = checkMedia(ctx, added, "photo", "the gallery");
    if (problem) return err(problem);
  }
  return ok(spec.set(value.data));
}

function addBlock(doc: ProfileDocument, op: AddBlockOperation, ctx: ApplyContext): Change {
  // `blocks[0]` is always the hero (F1: mandatory, fixed at the top), so this is really
  // "a hero always exists" — kept as an explicit check so the refusal names the reason.
  if (op.block.type === "hero") {
    return err({ code: "refused", reason: "There is already a hero." });
  }
  const count = doc.blocks.length;
  const index = op.index ?? count;
  // `blocks[0]` is always the hero (F1), so index 0 would always displace it — named
  // plainly rather than left to the generic schema refusal `applyOperation` falls back to.
  if (index === 0) {
    return err({ code: "refused", reason: "The hero stays at the top." });
  }
  if (index > count) {
    const reason = `The page has ${count} sections, so a new one can go at 0 to ${count}.`;
    return err({ code: "invalid", reason });
  }
  const block: Block = { id: ctx.newBlockId(), ...op.block };
  const kind = block.type === "video" ? "video" : "photo";
  const ids = referencedMediaIds({ ...doc, blocks: [block] });
  const problem = checkMedia(ctx, ids, kind, `the ${sectionLabel(block.type, doc.sex)}`);
  if (problem) return err(problem);
  const blocks = [...doc.blocks.slice(0, index), block, ...doc.blocks.slice(index)];
  return ok({ ...doc, blocks });
}

function removeBlock(doc: ProfileDocument, op: RemoveBlockOperation): Change {
  if (!doc.blocks.some((block) => block.id === op.blockId)) return err(missingBlock(op.blockId));
  if (doc.blocks[0]?.id === op.blockId) {
    const reason = "The hero stays; replace its photo instead.";
    return err({ code: "refused", reason });
  }
  return ok({ ...doc, blocks: doc.blocks.filter((block) => block.id !== op.blockId) });
}

function reorderBlocks(doc: ProfileDocument, op: ReorderBlocksOperation): Change {
  const current = new Map(doc.blocks.map((block) => [block.id, block]));
  const isPermutation =
    op.order.length === current.size &&
    new Set(op.order).size === op.order.length &&
    op.order.every((id) => current.has(id));
  if (!isPermutation) {
    const reason = "The new order must name every section on the page exactly once.";
    return err({ code: "refused", reason });
  }
  if (op.order[0] !== doc.blocks[0]?.id) {
    return err({ code: "refused", reason: "The hero stays at the top." });
  }
  return ok({ ...doc, blocks: op.order.map((id) => current.get(id)) });
}

function setTheme(doc: ProfileDocument, op: SetThemeOperation): unknown {
  return {
    ...doc,
    theme: {
      preset: op.preset ?? doc.theme.preset,
      warmth: op.warmth ?? doc.theme.warmth,
      contrast: op.contrast ?? doc.theme.contrast,
    },
  };
}

function replaceImage(doc: ProfileDocument, op: ReplaceImageOperation, ctx: ApplyContext): Change {
  const slot = imageSlotOf(doc, op.blockId, op.slot);
  if (!slot.ok) return slot;
  const problem = checkMedia(ctx, [op.mediaId], slot.value.kind, slot.value.label);
  if (problem) return err(problem);
  return ok(slot.value.set(op.mediaId));
}
