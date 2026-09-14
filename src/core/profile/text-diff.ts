import type { RichText } from "./rich-text";

// F58: the word-level diff the proposal card draws for the bio — what a proposed
// rewrite strikes out and what it puts in, as prose. Written here rather than installed
// (constitution: a dependency for one call site is rejected; `@tiptap/pm/changeset` is
// barred from core and diffs editor steps, not two documents). A longest common
// subsequence (LCS — the standard "what stayed the same" pass) over word tokens, each
// token a run of non-space characters with the whitespace after it, so the parts re-join
// to either text verbatim: `same` + `ins` is `after`, `same` + `del` is `before`.

/** One run of the diff: unchanged, removed from `before`, or added in `after`. */
export interface DiffPart {
  kind: "same" | "del" | "ins";
  text: string;
}

/** One paragraph's parts; paragraphs are paired in order (see {@link diffParagraphs}). */
export interface ParagraphDiff {
  parts: readonly DiffPart[];
}

/**
 * Above this many tokens on either side the pairing is skipped and the two texts are
 * stacked whole (`[del, ins]`): the table is `n × m` cells, and 1 500² is a few
 * milliseconds while the bio schema allows far more in theory.
 */
export const DIFF_TOKEN_GUARD = 1500;

/** Runs of non-space plus the whitespace after them, or leading whitespace on its own. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** The word of a token, without the whitespace after it: what two tokens are paired by,
 * so `sit.` at the end of one text still matches `sit. ` mid-sentence in the other. */
function word(token: string): string {
  return token.trimEnd();
}

/** Appends `text` as `kind`, merging into the last part when it is the same kind. */
function push(parts: DiffPart[], kind: DiffPart["kind"], text: string): void {
  if (text === "") return;
  const last = parts[parts.length - 1];
  if (last !== undefined && last.kind === kind) {
    parts[parts.length - 1] = { kind, text: last.text + text };
  } else {
    parts.push({ kind, text });
  }
}

/** The LCS length of `a[i..]` and `b[j..]`, for every `i` and `j` up to the two ends. */
type Suffixes = (i: number, j: number) => number;

/** The suffix table of `a` against `b`, filled from the ends back. The cells past
 * either end stay 0; `|| 0` (not `??`) because a 0 cell is 0 either way, and a read can
 * never fall outside the table. */
function suffixTable(a: readonly string[], b: readonly string[]): Suffixes {
  const width = b.length + 1;
  const cells = new Uint16Array((a.length + 1) * width);
  const at: Suffixes = (i, j) => cells[i * width + j] || 0;
  const wordsA = a.map(word);
  const wordsB = b.map(word);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      cells[i * width + j] =
        wordsA[i] === wordsB[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  return at;
}

/** A matched pair of tokens as parts: the word as `same`, and where only the whitespace
 * after it differs, that whitespace as `del` and `ins` so both texts still re-join. */
function matched(parts: DiffPart[], x: string, y: string): void {
  const same = word(x);
  push(parts, "same", same);
  push(parts, "del", x.slice(same.length));
  push(parts, "ins", y.slice(same.length));
}

/** Walks the two token lists from the start, emitting parts: a match (by word) is
 * `same`; otherwise whichever side keeps the longer common suffix gives way — `a`'s
 * token as `del` on a tie, so a removal always comes before the addition beside it. */
function walk(a: readonly string[], b: readonly string[], lcs: Suffixes): DiffPart[] {
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  for (;;) {
    const x = a[i];
    const y = b[j];
    if (x === undefined || y === undefined) break;
    if (x === y) {
      push(parts, "same", x);
      i++;
      j++;
    } else if (word(x) === word(y)) {
      matched(parts, x, y);
      i++;
      j++;
    } else if (lcs(i + 1, j) >= lcs(i, j + 1)) {
      push(parts, "del", x);
      i++;
    } else {
      push(parts, "ins", y);
      j++;
    }
  }
  push(parts, "del", a.slice(i).join(""));
  push(parts, "ins", b.slice(j).join(""));
  return parts;
}

/**
 * The word-level diff of `before` → `after`. Identical texts are one `same` part; an
 * empty side is one `del` or `ins`; where a removal and an addition meet, the removal
 * comes first. Adjacent parts of one kind are merged.
 */
export function diffWords(before: string, after: string): readonly DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length > DIFF_TOKEN_GUARD || b.length > DIFF_TOKEN_GUARD) {
    const parts: DiffPart[] = [];
    push(parts, "del", before);
    push(parts, "ins", after);
    return parts;
  }
  return walk(a, b, suffixTable(a, b));
}

/** A paragraph's runs joined as plain text; marks are not part of the diff. */
function paragraphText(rt: RichText, index: number): string {
  return rt.paragraphs[index]?.runs.map((run) => run.text).join("") ?? "";
}

/**
 * The diff of two rich texts, paragraph by paragraph in order: a paragraph `before` has
 * and `after` lacks is all `del`, one only `after` has is all `ins`. A split or a merge
 * shows as a removal and an addition, which is honest. Paragraphs empty on both sides
 * are dropped.
 */
export function diffParagraphs(before: RichText, after: RichText): readonly ParagraphDiff[] {
  const count = Math.max(before.paragraphs.length, after.paragraphs.length);
  const diff: ParagraphDiff[] = [];
  for (let index = 0; index < count; index++) {
    const parts = diffWords(paragraphText(before, index), paragraphText(after, index));
    if (parts.length > 0) diff.push({ parts });
  }
  return diff;
}

/** How many characters the diff draws — struck, underlined and plain together. */
export function diffLength(diff: readonly ParagraphDiff[]): number {
  return diff.reduce(
    (total, paragraph) => total + paragraph.parts.reduce((n, part) => n + part.text.length, 0),
    0,
  );
}

/** The index of the last whitespace character in `text`, or -1. */
function lastSpace(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (/\s/.test(text.charAt(i))) return i;
  }
  return -1;
}

/** `part` cut to `text`, with an ellipsis marking that it goes on. */
function cut(part: DiffPart, text: string): DiffPart {
  return { kind: part.kind, text: `${text.trimEnd()}…` };
}

/** `parts` with its last one marked as going on (unchanged when there is none). */
function endingEarly(parts: readonly DiffPart[]): readonly DiffPart[] {
  const last = parts[parts.length - 1];
  return last === undefined ? parts : [...parts.slice(0, -1), cut(last, last.text)];
}

/**
 * `shown` with the paragraph in which the fold lands: `kept` so far, then `part` cut at
 * the last word boundary inside `room` with an ellipsis. When no whole word fits, the
 * ellipsis goes on the last kept part instead; when the fold lands at a later
 * paragraph's very start, on the paragraph before it; when nothing at all has been kept
 * yet, the part's first word is kept, so the fold is never an empty card.
 */
function foldAt(
  shown: readonly ParagraphDiff[],
  kept: readonly DiffPart[],
  part: DiffPart,
  room: number,
): readonly ParagraphDiff[] {
  const head = part.text.slice(0, room);
  const space = lastSpace(head);
  if (space > 0) return [...shown, { parts: [...kept, cut(part, head.slice(0, space))] }];
  if (kept.length > 0) return [...shown, { parts: endingEarly(kept) }];
  const previous = shown[shown.length - 1];
  if (previous === undefined) {
    return [{ parts: [cut(part, part.text.replace(/^(\s*\S+)[\s\S]*$/, "$1"))] }];
  }
  return [...shown.slice(0, -1), { parts: endingEarly(previous.parts) }];
}

/**
 * The first `budget` characters of `diff`, for the card's fold: whole parts while they
 * fit, then the part that crosses the budget cut at a word boundary with an ellipsis
 * ({@link foldAt}). `folded` is `false` when the whole diff fits.
 */
export function foldDiff(
  diff: readonly ParagraphDiff[],
  budget: number,
): { shown: readonly ParagraphDiff[]; folded: boolean } {
  let room = budget;
  const shown: ParagraphDiff[] = [];
  for (const paragraph of diff) {
    const kept: DiffPart[] = [];
    for (const part of paragraph.parts) {
      if (part.text.length > room) return { shown: foldAt(shown, kept, part, room), folded: true };
      kept.push(part);
      room -= part.text.length;
    }
    shown.push({ parts: kept });
  }
  return { shown, folded: false };
}
