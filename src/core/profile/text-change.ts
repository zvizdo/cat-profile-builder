import { LITERAL_READOUT_MAX } from "./describe";
import { fieldOf, type FieldSpec } from "./fields";
import type { EditOperation } from "./operations";
import type { RichText } from "./rich-text";
import type { ProfileDocument } from "./schema";
import { diffParagraphs, type ParagraphDiff } from "./text-diff";

// F58 (user feedback 2026-09-13: "you Apply or deny but you don't really know what you
// are applying"): the before → after a proposal card shows for a `set_field`, read the
// way `describeOperation` reads — the field's current value from the document through
// `fieldOf`, the proposed one from the operation — so the card itself never reaches into
// `fields.ts`. Computed once per card against the live document, which is what Apply
// will change (the document cannot move under a card: every editor is locked while it
// waits).

/** A needs card as the block schema has it. */
type NeedsCard = Extract<FieldSpec, { kind: "cards" }>["current"][number];

/**
 * The two values a card can show: a text field's strings, the bio's rich text with its
 * word diff already taken, or the whole needs list. `label` is the field's name in a
 * sentence (`tagline`, `caption of scene 1`, `"What she needs" cards`).
 */
export type TextChange =
  | { kind: "text"; label: string; before: string; after: string }
  | {
      kind: "richText";
      label: string;
      before: RichText;
      after: RichText;
      diff: readonly ParagraphDiff[];
    }
  | { kind: "cards"; label: string; before: readonly NeedsCard[]; after: readonly NeedsCard[] };

/**
 * About eight lines of the card's 13px column at the docked panel's width (~46
 * characters a line): past it the bio's diff folds behind `Show the full text`. The fold
 * is the only thing this decides; on the phone any card that draws a change block opens
 * the drawer to Full (`PhoneBuilder.tsx`), since even two lines put Apply under the Half
 * sheet's fold at 390×664.
 */
export const FOLD_CHARS = 360;

/**
 * The before → after of `op` against `doc` for a `set_field` on a text, rich text or
 * cards path; `null` for a gallery's ids, a value that does not fit the field, a section
 * that is no longer on the page, and every other kind of operation.
 */
export function textChange(doc: ProfileDocument, op: EditOperation): TextChange | null {
  if (op.op !== "set_field") return null;
  const field = fieldOf(doc, op.target, op.path);
  return field.ok ? changeOf(field.value, op.value) : null;
}

/** `spec`'s pair against the proposed `value`, once the value has passed its schema. */
function changeOf(spec: FieldSpec, value: unknown): TextChange | null {
  const { label } = spec;
  switch (spec.kind) {
    case "text": {
      const parsed = spec.schema.safeParse(value);
      if (!parsed.success) return null;
      return { kind: "text", label, before: spec.current, after: parsed.data ?? "" };
    }
    case "richText": {
      const parsed = spec.schema.safeParse(value);
      if (!parsed.success) return null;
      const diff = diffParagraphs(spec.current, parsed.data);
      return { kind: "richText", label, before: spec.current, after: parsed.data, diff };
    }
    case "cards": {
      const parsed = spec.schema.safeParse(value);
      if (!parsed.success) return null;
      return { kind: "cards", label, before: spec.current, after: parsed.data };
    }
    case "mediaIds":
      return null;
  }
}

/**
 * Whether the pair is short enough to read on the ledger's own line (`Charlotte →
 * Marmalade`) — the same cut `describeOperation`'s readout makes — so the card draws
 * no block under it. Only a text pair ever is.
 */
export function readsInline(change: TextChange): boolean {
  return (
    change.kind === "text" &&
    change.before.length <= LITERAL_READOUT_MAX &&
    change.after.length <= LITERAL_READOUT_MAX
  );
}

/**
 * Whether the card draws a change block for `change` — everything but the one-line pair.
 * On the phone such a card opens the drawer to Full: the Half sheet at 390×664 has room
 * for the ledger line and the notice, not for two more lines and Apply under them.
 */
export function drawsBlock(change: TextChange | null): change is TextChange {
  return change !== null && !readsInline(change);
}
