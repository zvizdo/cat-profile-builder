import { blockById, fieldLabel, fieldOf, sectionLabel, type FieldSpec } from "./fields";
import { imageSlotOf } from "./image-slots";
import type {
  EditOperation,
  MediaRef,
  ReplaceImageOperation,
  SetFieldOperation,
  SetThemeOperation,
} from "./operations";
import { plainText } from "./rich-text";
import { referencedMediaIds, type Block, type ProfileDocument, type Theme } from "./schema";

// The sentence the proposal card shows and the "what changed" line afterwards (FR-038,
// FR-042, FR-043), and whether the edit is destructive per data-model.md: replacing text
// the volunteer wrote, dropping a gallery id or a written card, removing a section, or
// replacing a placed photo that is not the other's enhancement.

/**
 * A before → after pair the proposal card's ledger shows beside the sentence (F26, audit
 * §3.5): `41 → 9 words`, `4 → 2`, `Paper → Sand`. `unit` is said once, after the pair. A
 * theme's readout also carries the two themes themselves — data, from which a surface can
 * paint a swatch for each side — never a colour, which is the surface's to resolve.
 */
export interface Readout {
  before: string;
  after: string;
  unit?: string;
  themes?: { before: Theme; after: Theme };
}

/** What `describeOperation` answers: the sentence, whether the edit loses something, and
 * (when it does) the consequence notice's own body text. */
export interface Description {
  /** One or two plain sentences; the second names what will be lost when `destructive`. */
  summary: string;
  destructive: boolean;
  /** The consequence notice's body (CONTENT.md → Helper, Consequence) when `destructive`;
   * `""` for a neutral or additive edit, which never shows a notice at all. */
  detail: string;
  /** The measurable pair, where the edit has one (F26); absent for an add or a removal. */
  readout?: Readout;
  /** The edit would leave the document exactly as it is (F42): a `set_field` to the value
   * the field already holds. Never destructive; the reducer answers it at once and lists
   * it nowhere, since there is nothing to undo. */
  noop?: true;
}

/** CONTENT.md → Helper, Consequence: the universal reassurance every destructive card
 * carries. The bio's own authored-text loss additionally carries CONTENT.md's verbatim
 * lead-in — the one case both CONTENT.md and the hi-fi actually specify text for; every
 * other destructive branch (a photo, a gallery id, a card, another text field) keeps the
 * reassurance alone rather than guessing wording CONTENT.md never gave it. */
const RECOVERABLE = "The original is recoverable with one undo, and only one.";
const BIO_TEXT_DETAIL = `You wrote that paragraph. ${RECOVERABLE}`;

const MISSING: Description = {
  summary: "Change a section that is no longer on the page.",
  destructive: false,
  detail: "",
};

const ADD_SUMMARY: Record<Exclude<Block["type"], "day" | "needs">, string> = {
  hero: "Add a hero.",
  bio: "Add a bio.",
  photo: "Add a photo section.",
  gallery: "Add a gallery.",
  video: "Add a video section.",
  quote: "Add a quote.",
};

/** `ADD_SUMMARY[type]`, with the day and needs sections named in the cat's own pronoun. */
function addSummary(type: Block["type"], sex: ProfileDocument["sex"]): string {
  if (type === "day") return `Add an ${sectionLabel("day", sex)}.`;
  if (type === "needs") return `Add a ${sectionLabel("needs", sex)}.`;
  return ADD_SUMMARY[type];
}

/** How each theme preset reads in a sentence a person reads (shared with the helper reducer's `turnSummary`). */
export const PRESET_NAME: Record<Theme["preset"], string> = {
  paper: "Paper",
  card: "Card",
  night: "Night",
  sand: "Sand",
};

const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** `n` in words up to twelve (a gallery's cap); larger counts fall back to digits. */
function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function photos(n: number): string {
  return `${countWord(n)} photo${n === 1 ? "" : "s"}`;
}

/** `Charlotte's page`, or `the page` while the cat has no name. */
function page(doc: ProfileDocument): string {
  return doc.name === "" ? "the page" : `${doc.name}'s page`;
}

function neutral(summary: string, readout?: Readout): Description {
  return readout === undefined
    ? { summary, destructive: false, detail: "" }
    : { summary, destructive: false, detail: "", readout };
}

/** A `Description` for an edit that changes nothing (F42): neutral, and marked `noop`. */
function unchanged(summary: string): Description {
  return { summary, destructive: false, detail: "", noop: true };
}

/**
 * Structural equality over the JSON-shaped values a field holds (F42): a string, an array
 * of ids, a bio's paragraphs and runs, a needs block's cards. Key order is ignored, so a
 * value the model sent and the one the document holds compare as what they mean. Written
 * here rather than with `JSON.stringify`, whose output depends on key order.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return sameArray(a, b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return sameObject(a as Record<string, unknown>, b as Record<string, unknown>);
}

function sameArray(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, i) => sameValue(item, b[i]));
}

function sameObject(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && sameValue(a[key], b[key]));
}

/** A destructive `Description`, `detail` set to the generic reassurance. */
function destructive(summary: string, readout?: Readout): Description {
  return readout === undefined
    ? { summary, destructive: true, detail: RECOVERABLE }
    : { summary, destructive: true, detail: RECOVERABLE, readout };
}

/** Words in `text`, as a person would count them: runs of non-space characters. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

/** `17 → 8 words`, for text a person wrote and text that replaces it. */
function wordsReadout(before: string, after: string): Readout {
  return { before: String(wordCount(before)), after: String(wordCount(after)), unit: "words" };
}

/** A count pair with its unit: `3 → 2 photos`. */
function countReadout(before: number, after: number, unit: string): Readout {
  return { before: String(before), after: String(after), unit };
}

/** A text field short enough to read both values themselves rather than count them:
 * a name, a tagline, a caption — the card has room for two of these on a line. The same
 * cut decides when the card draws the pair on its ledger line and when it draws the two
 * values in full underneath (F58, `text-change.ts`). */
export const LITERAL_READOUT_MAX = 24;

/** The two values themselves when both are short (`Charlotte → Whiskers`), else counts. */
function textReadout(before: string, after: string): Readout {
  if (before.length <= LITERAL_READOUT_MAX && after.length <= LITERAL_READOUT_MAX) {
    return { before, after };
  }
  return wordsReadout(before, after);
}

/**
 * The sentence for `op` against `doc`, and whether it is destructive. `op` must already
 * have passed `EditOperationSchema` (ADR-002: the reducer parses before it describes), and
 * is meant to be one `applyOperation` accepts; for one it would reject the answer is a
 * plain, non-destructive best effort and never a throw. On an empty page nothing is destructive.
 * `assets` lets a photo swap recognise an enhanced copy (`enhancement.sourceMediaId`) in
 * either direction, which is not destructive (FR-043).
 */
export function describeOperation(
  doc: ProfileDocument,
  op: EditOperation,
  assets: readonly MediaRef[],
): Description {
  switch (op.op) {
    case "set_field":
      return describeSetField(doc, op);
    case "add_block":
      return neutral(addSummary(op.block.type, doc.sex));
    case "remove_block":
      return describeRemove(doc, op.blockId);
    case "reorder_blocks":
      return describeReorder(doc, op.order);
    case "set_theme":
      return neutral(themeSummary(op), themeReadout(doc.theme, op));
    case "replace_image":
      return describeReplace(doc, op, assets);
  }
}

/** Whether `op` clears `sex` back to "not set" (F10): a `set_field` on the profile's own
 * `sex` path carrying `null`. Its own function so `describeSetField`'s one extra case
 * costs it a single branch, not the three conditions this takes to recognise. */
function isClearSex(op: SetFieldOperation): boolean {
  return op.target.kind === "profile" && op.path === "sex" && op.value === null;
}

function describeSetField(doc: ProfileDocument, op: SetFieldOperation): Description {
  if (op.target.kind === "block" && !blockById(doc, op.target.blockId)) return MISSING;
  // Clearing the sex back to "not set" (F10) is its own sentence, never the generic
  // text-field framing ("replaces your text") — an enum going back to unset loses
  // nothing written by hand, so it is not destructive.
  if (isClearSex(op)) return neutral("Clear the sex.");
  const field = fieldOf(doc, op.target, op.path);
  if (!field.ok || !field.value.schema.safeParse(op.value).success) {
    return neutral(`Set the ${fieldLabel(op.path, doc.sex)}.`);
  }
  const spec = field.value;
  switch (spec.kind) {
    case "text":
      return describeText(spec, spec.schema.parse(op.value));
    case "richText":
      return describeBio(spec.current, spec.schema.parse(op.value));
    case "mediaIds":
      return describeGallery(doc, spec.current, spec.schema.parse(op.value));
    case "cards":
      return describeCards(spec.current, spec.schema.parse(op.value), doc.sex);
  }
}

/** `next` is the parsed value: an unset optional field reads as `""`, as `current` does. */
function describeText(
  spec: Extract<FieldSpec, { kind: "text" }>,
  next: string | undefined,
): Description {
  if (spec.current === "") return neutral(`Set the ${spec.label}.`);
  if (spec.current === (next ?? "")) return unchanged(unchangedText(spec.label, spec.current));
  return destructive(
    `Change the ${spec.label}. Changing the ${spec.label} replaces your text.`,
    textReadout(spec.current, next ?? ""),
  );
}

/** `The name is already Vini.` when the value is short enough to read; otherwise
 * `The quote is unchanged.` — the same cut `textReadout` makes. */
function unchangedText(label: string, value: string): string {
  if (value.length <= LITERAL_READOUT_MAX) return `The ${label} is already ${value}.`;
  return `The ${label} is unchanged.`;
}

type RichTextOf = Extract<FieldSpec, { kind: "richText" }>["current"];

function describeBio(current: RichTextOf, next: RichTextOf): Description {
  const before = plainText(current);
  if (before === "") return neutral("Write the bio.");
  if (sameValue(current, next)) return unchanged("The bio is unchanged.");
  const after = plainText(next);
  const [verb, doing] =
    after.length < before.length ? ["Shorten", "Shortening"] : ["Rewrite", "Rewriting"];
  return {
    summary: `${verb} the bio. ${doing} the bio replaces your text.`,
    destructive: true,
    detail: BIO_TEXT_DETAIL,
    readout: wordsReadout(before, after),
  };
}

function describeGallery(
  doc: ProfileDocument,
  current: readonly string[],
  next: readonly string[],
): Description {
  if (sameValue(current, next)) return unchanged("The gallery photos are unchanged.");
  const dropped = current.filter((id) => !next.includes(id)).length;
  const readout = countReadout(current.length, next.length, "photos");
  if (dropped === 0) return neutral("Change the gallery photos.", readout);
  return destructive(
    `Change the gallery photos. Changing the gallery takes ${photos(dropped)} off ${page(doc)}.`,
    readout,
  );
}

type Card = Extract<FieldSpec, { kind: "cards" }>["current"][number];

function isEmptyCard(card: Card): boolean {
  return card.title === "" && card.text === "";
}

function describeCards(
  current: readonly Card[],
  next: readonly Card[],
  sex: ProfileDocument["sex"],
): Description {
  if (sameValue(current, next)) return unchanged(`The ${fieldLabel("cards", sex)} are unchanged.`);
  const lost = current.some(
    (card) =>
      !isEmptyCard(card) &&
      !next.some((kept) => kept.title === card.title && kept.text === card.text),
  );
  const summary = `Change the ${fieldLabel("cards", sex)}.`;
  if (!lost) return neutral(summary);
  return destructive(`${summary} Changing the cards replaces your text.`);
}

function hasText(block: Block): boolean {
  switch (block.type) {
    case "bio":
      return plainText(block.content) !== "";
    case "photo":
      return (block.caption ?? "") !== "";
    case "quote":
      return block.text !== "";
    case "day":
      return block.scenes.some((scene) => scene.caption !== "");
    case "needs":
      return block.cards.some((card) => !isEmptyCard(card));
    default:
      return false;
  }
}

/** `three photos and your text`, `the clip`, `it` — what removing `block` takes away. */
function lossOf(doc: ProfileDocument, block: Block): string {
  const media = referencedMediaIds({ ...doc, blocks: [block] }).length;
  const parts: string[] = [];
  if (media > 0) parts.push(block.type === "video" ? "the clip" : photos(media));
  if (hasText(block)) parts.push("your text");
  return parts.length === 0 ? "it" : parts.join(" and ");
}

function describeRemove(doc: ProfileDocument, blockId: string): Description {
  const block = blockById(doc, blockId);
  if (!block) return MISSING;
  const label = sectionLabel(block.type, doc.sex);
  return destructive(
    `Remove the ${label}. Removing the ${label} takes ${lossOf(doc, block)} off ${page(doc)}.`,
  );
}

/**
 * The sentence for a reorder and, when a section actually moves, its position before and
 * after counted from the top of the page (`4 → 2`; the hero is 1) — the block named in the
 * sentence is the one now at the first position that changed, the same rule the helper
 * reducer's `movedBlockLabel` follows.
 */
function describeReorder(doc: ProfileDocument, order: readonly string[]): Description {
  const changed = doc.blocks.findIndex((current, index) => order[index] !== current.id);
  if (changed === -1) return neutral("Keep the sections in their order.");
  const movedId = order[changed];
  const from = doc.blocks.findIndex((block) => block.id === movedId);
  const moved = doc.blocks[from];
  const displaced = doc.blocks[changed];
  if (moved === undefined || displaced === undefined) return neutral("Reorder the sections.");
  return neutral(
    `Move the ${sectionLabel(moved.type, doc.sex)} above the ${sectionLabel(displaced.type, doc.sex)}.`,
    { before: String(from + 1), after: String(changed + 1) },
  );
}

/** Names every field the change touches: preset, sliders, or both (FR-042). */
function themeSummary(op: SetThemeOperation): string {
  const sliders: string[] = [];
  if (op.warmth !== undefined) sliders.push("warmth");
  if (op.contrast !== undefined) sliders.push("contrast");
  const adjusted = sliders.join(" and ");
  if (op.preset === undefined) return `Adjust the theme's ${adjusted}.`;
  const preset = `Set the theme to ${PRESET_NAME[op.preset]}`;
  return sliders.length === 0 ? `${preset}.` : `${preset} and adjust its ${adjusted}.`;
}

/** A slider value as the rail reads it: two decimals. */
function sliderReading(value: number): string {
  return value.toFixed(2);
}

/**
 * The theme's pair: the two preset names when the preset changes (`Paper → Sand`), one
 * slider's values when only it moves (`0.50 → 0.62 warmth`); both sliders alone have no
 * one pair to read, so the sentence stands by itself. Either way the two themes travel
 * with it, for the swatches.
 */
function themeReadout(current: Theme, op: SetThemeOperation): Readout | undefined {
  const next: Theme = {
    preset: op.preset ?? current.preset,
    warmth: op.warmth ?? current.warmth,
    contrast: op.contrast ?? current.contrast,
  };
  const themes = { before: current, after: next };
  if (op.preset !== undefined) {
    return { before: PRESET_NAME[current.preset], after: PRESET_NAME[next.preset], themes };
  }
  const sliders = (["warmth", "contrast"] as const).filter((slider) => op[slider] !== undefined);
  const [slider] = sliders;
  if (slider === undefined || sliders.length > 1) return undefined;
  return {
    before: sliderReading(current[slider]),
    after: sliderReading(next[slider]),
    unit: slider,
    themes,
  };
}

/** The id the asset `id` was enhanced from, if it is an enhanced copy the cat owns. */
function enhancedFrom(assets: readonly MediaRef[], id: string): string | undefined {
  return assets.find((asset) => asset.id === id)?.enhancement?.sourceMediaId;
}

function describeReplace(
  doc: ProfileDocument,
  op: ReplaceImageOperation,
  assets: readonly MediaRef[],
): Description {
  if (!blockById(doc, op.blockId)) return MISSING;
  const slot = imageSlotOf(doc, op.blockId, op.slot);
  if (!slot.ok) return neutral("Replace a photo.");
  const { kind, label, current } = slot.value;
  const thing = kind === "video" ? "clip" : "photo";
  if (current === null) return neutral(`Add a ${thing} to ${label}.`);
  if (enhancedFrom(assets, op.mediaId) === current) {
    return neutral(`Use the enhanced ${thing} in ${label}.`);
  }
  if (enhancedFrom(assets, current) === op.mediaId) {
    return neutral(`Go back to the original ${thing} in ${label}.`);
  }
  return destructive(
    `Replace the ${thing} in ${label}. The ${thing} in ${label} leaves ${page(doc)}.`,
  );
}
