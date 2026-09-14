import { type MediaAsset, type MediaKind } from "../media/schema";
import { LIMITS } from "../media/validation";
import { needsPhrase, sectionStrings } from "./pronouns";
import { plainText } from "./rich-text";
import { type Block, type MediaId, type ProfileDocument } from "./schema";
import { passesContrast } from "./theme";

// Publish readiness (data-model.md → Publish readiness; FR-060, FR-074, FR-081): every
// reason a profile cannot go public yet, as sentences a volunteer can act on, in document
// order and with no repeats. "Wait for the helper to finish." is builder state and lives
// with the Publish button, not here. F1 (Checkpoint 2): publishing now also requires an
// age, a sex and the hero's photo — the hero is always `blocks[0]`, so its own problems
// (from the block loop below) still land right after age and sex. F1 also means every
// document has at least the hero: `doc.blocks.length === 0` can never validate, so the
// former "Add at least one section." problem was unreachable and is gone (removed after
// F1's review, constitution: dead code goes in the change that orphans it).

/** What `checkReadiness` found: `problems` block publishing, `warnings` do not. */
export type Readiness = { problems: string[]; warnings: string[] };

/** Where a problem lives on the page: the name field, a facts field, or one block. */
export type ReadinessTarget =
  { kind: "name" } | { kind: "facts"; field: "age" | "sex" } | { kind: "block"; blockId: string };

/** One problem sentence with the place on the page a builder can scroll to. */
export interface ReadinessProblem {
  message: string;
  target: ReadinessTarget;
}

/** `checkReadiness` with each problem addressed; the sentences are the same, in the same order. */
export type ReadinessWithTargets = { problems: ReadinessProblem[]; warnings: string[] };

const NO_NAME = "Give the cat a name.";
const MISSING_MEDIA = "A photo or clip is missing from the library.";
const CONTRAST_WARNING = "The text may be hard to read on this background.";

/** `Add her age.` / `Add his age.` / `Add their age.` — the sex the document already has. */
const AGE_SENTENCE: Readonly<Record<"female" | "male" | "unknown", string>> = {
  female: "Add her age.",
  male: "Add his age.",
  unknown: "Add their age.",
};

/**
 * `Say whether she's female or male.` (data-model.md → Publish readiness) is the sentence's
 * general shape, but it is unreachable here: this problem exists exactly when the sex is
 * not recorded as female or male, so there is never a pronoun to use it with — the sentence
 * always falls to its neutral form.
 */
const NO_SEX = "Say whether the cat is female or male.";

const EMPTY_SLOT: Readonly<Record<"hero" | "photo" | "video" | "quote", string>> = {
  hero: "The hero has no photo.",
  photo: "The photo section has no photo.",
  video: "The video section has no clip.",
  quote: "The quote has no photo.",
};

/** Every problem with one referenced asset, for a slot that expects `expected`. */
function assetProblems(asset: MediaAsset, expected: MediaKind): string[] {
  const out: string[] = [];
  if (asset.kind !== expected) {
    out.push(
      expected === "video"
        ? `${asset.fileName} is a photo, but the video section needs a clip.`
        : `${asset.fileName} is a clip, but this section needs a photo.`,
    );
  }
  if (asset.status === "processing") out.push(`${asset.fileName} is still processing.`);
  if (asset.alt === null) out.push(`Write a description for ${asset.fileName}.`);
  // `MediaAssetSchema` guarantees a stored trim is ≤ 15 s and that an untrimmed original
  // over 15 s is `needs-trim`, so the status alone says whether a clip is too long.
  if (asset.status === "needs-trim") {
    out.push(`Trim ${asset.fileName} to ${LIMITS.maxClipSeconds} seconds or less.`);
  }
  return out;
}

/** One media reference and the kind of file its slot expects. */
type Slot = { id: MediaId; expected: MediaKind };

/** Media slots in the block's own order; empty slots skipped. Only a video slot wants a clip. */
function slotsOf(block: Block): Slot[] {
  switch (block.type) {
    case "gallery":
      return block.mediaIds.map((id) => ({ id, expected: "photo" }));
    case "day":
      return block.scenes.flatMap((scene) =>
        scene.mediaId === null ? [] : [{ id: scene.mediaId, expected: "photo" }],
      );
    case "bio":
    case "needs":
      return [];
    case "video":
      return block.mediaId === null ? [] : [{ id: block.mediaId, expected: "video" }];
    default:
      return block.mediaId === null ? [] : [{ id: block.mediaId, expected: "photo" }];
  }
}

/** The empty-section problems of one block (FR-060), scenes and cards numbered from 1;
 * the day and needs sentences quote the section in the cat's own recorded pronoun. */
function emptinessProblems(block: Block, sex: ProfileDocument["sex"]): string[] {
  switch (block.type) {
    case "bio":
      return plainText(block.content).trim() === "" ? ["The bio is empty."] : [];
    case "gallery":
      return block.mediaIds.length === 0 ? ["The gallery has no photos."] : [];
    case "day":
      return block.scenes.flatMap((scene, i) =>
        scene.mediaId === null || scene.caption.trim() === ""
          ? [`Scene ${i + 1} of '${sectionStrings(sex).day}' needs a photo and a caption.`]
          : [],
      );
    case "needs":
      return block.cards.flatMap((card, i) =>
        card.text.trim() === "" ? [`Card ${i + 1} of '${needsPhrase(sex)}' is empty.`] : [],
      );
    default:
      return block.mediaId === null ? [EMPTY_SLOT[block.type]] : [];
  }
}

function blockProblems(
  block: Block,
  library: ReadonlyMap<MediaId, MediaAsset>,
  sex: ProfileDocument["sex"],
): string[] {
  const media = slotsOf(block).flatMap(({ id, expected }) => {
    const asset = library.get(id);
    return asset === undefined ? [MISSING_MEDIA] : assetProblems(asset, expected);
  });
  return [...emptinessProblems(block, sex), ...media];
}

/** The name, age and sex problems, in that order. */
function factsProblems(doc: ProfileDocument): Array<[string, ReadinessTarget]> {
  const problems: Array<[string, ReadinessTarget]> = [];
  if (doc.name.trim() === "") problems.push([NO_NAME, { kind: "name" }]);
  if ((doc.age ?? "").trim() === "") {
    problems.push([AGE_SENTENCE[doc.sex ?? "unknown"], { kind: "facts", field: "age" }]);
  }
  if (doc.sex !== "female" && doc.sex !== "male") {
    problems.push([NO_SEX, { kind: "facts", field: "sex" }]);
  }
  return problems;
}

/**
 * Judges whether a profile can be published (FR-060, FR-074), with each problem addressed
 * to the place on the page it is about, so a builder can scroll to the first gap. The
 * sentences, their order and their de-duplication are exactly {@link checkReadiness}'s; a
 * sentence two blocks would both raise is kept once, pointing at the first of them.
 */
export function readinessTargets(
  doc: ProfileDocument,
  assets: readonly MediaAsset[],
): ReadinessWithTargets {
  const library = new Map(assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  const problems: ReadinessProblem[] = [];
  const add = (message: string, target: ReadinessTarget) => {
    if (seen.has(message)) return;
    seen.add(message);
    problems.push({ message, target });
  };
  for (const [message, target] of factsProblems(doc)) add(message, target);
  for (const block of doc.blocks) {
    for (const message of blockProblems(block, library, doc.sex)) {
      add(message, { kind: "block", blockId: block.id });
    }
  }
  const warnings = passesContrast(doc.theme) ? [] : [CONTRAST_WARNING];
  return { problems, warnings };
}

const COUNT_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/**
 * The one sentence a refused publish reports (CONTENT.md → Publish validation): the count
 * in words — `One thing missing:` / `Two things missing:` — then the problems in order. The
 * count is spelled out up to twelve and written as digits beyond that.
 */
export function readinessSummary(problems: readonly string[]): string {
  const count = problems.length;
  const word = COUNT_WORDS[count] ?? String(count);
  const noun = count === 1 ? "thing" : "things";
  return `${word} ${noun} missing: ${problems.join(" ")}`;
}

/**
 * Judges whether a profile can be published (FR-060, FR-074). `problems` is every reason
 * it cannot, as plain sentences from data-model.md, in document order — the name and the
 * block count first, then each block's own problems in block order, with empty-section
 * problems before media problems within a block — and with no sentence repeated, so a
 * photo used twice is named once. Media problems name the file. `warnings` holds what the
 * volunteer may publish over: only the theme's text contrast falling under 4.5:1
 * (FR-031, Waiver 3). Empty `problems` means publishable.
 */
export function checkReadiness(doc: ProfileDocument, assets: readonly MediaAsset[]): Readiness {
  const { problems, warnings } = readinessTargets(doc, assets);
  return { problems: problems.map((problem) => problem.message), warnings };
}
