import { describe, expect, it } from "vitest";
import type { RichText } from "@/core/profile/rich-text";
import {
  diffLength,
  diffParagraphs,
  diffWords,
  DIFF_TOKEN_GUARD,
  foldDiff,
  type DiffPart,
  type ParagraphDiff,
} from "@/core/profile/text-diff";

// F58: the proposal card's word-level diff, written rather than installed (constitution:
// a dependency for one function is rejected). Two invariants hold for every pair: the
// `same` + `ins` parts re-join to `after` exactly, and the `same` + `del` parts re-join to
// `before` exactly — so what the card strikes and underlines is the text itself, never a
// paraphrase of it.

function rejoin(parts: readonly DiffPart[], keep: "del" | "ins"): string {
  return parts
    .filter((part) => part.kind === "same" || part.kind === keep)
    .map((part) => part.text)
    .join("");
}

function rt(...paragraphs: string[]): RichText {
  return { paragraphs: paragraphs.map((text) => ({ runs: [{ text }] })) };
}

/** Every paragraph's invariant, for both sides. */
function expectInvariant(diff: readonly ParagraphDiff[], before: RichText, after: RichText) {
  const befores = diff.map((p) => rejoin(p.parts, "del")).filter((text) => text !== "");
  const afters = diff.map((p) => rejoin(p.parts, "ins")).filter((text) => text !== "");
  expect(befores).toEqual(before.paragraphs.map((p) => p.runs.map((r) => r.text).join("")));
  expect(afters).toEqual(after.paragraphs.map((p) => p.runs.map((r) => r.text).join("")));
}

describe("diffWords", () => {
  it("marks what stayed, what left and what arrived on a tagline pair", () => {
    const before = "A negotiator, not a complainer";
    const after = "A negotiator, never a complainer";
    const parts = diffWords(before, after);
    expect(parts).toEqual([
      { kind: "same", text: "A negotiator, " },
      { kind: "del", text: "not " },
      { kind: "ins", text: "never " },
      { kind: "same", text: "a complainer" },
    ]);
    expect(rejoin(parts, "del")).toBe(before);
    expect(rejoin(parts, "ins")).toBe(after);
  });

  it("puts the removal before the addition where both happen at once, and merges runs", () => {
    const before = "She came in from a laundromat and never looked back.";
    const after = "She came in from the street and never once looked back.";
    const parts = diffWords(before, after);
    expect(parts).toEqual([
      { kind: "same", text: "She came in from " },
      { kind: "del", text: "a laundromat " },
      { kind: "ins", text: "the street " },
      { kind: "same", text: "and never " },
      { kind: "ins", text: "once " },
      { kind: "same", text: "looked back." },
    ]);
    expect(rejoin(parts, "del")).toBe(before);
    expect(rejoin(parts, "ins")).toBe(after);
  });

  it("pairs a word by its letters, so one side ending on it does not strike and re-add it", () => {
    const before = "the second you sit. She waits.";
    const after = "the second you sit.";
    const parts = diffWords(before, after);
    expect(parts).toEqual([
      { kind: "same", text: "the second you sit." },
      { kind: "del", text: " She waits." },
    ]);
    expect(rejoin(parts, "del")).toBe(before);
    expect(rejoin(parts, "ins")).toBe(after);
    // The other way round the space is an addition; either way both texts re-join.
    const grown = diffWords(after, before);
    expect(grown).toEqual([
      { kind: "same", text: "the second you sit." },
      { kind: "ins", text: " She waits." },
    ]);
    // Only the whitespace differs: it is what changes, the word is not.
    expect(diffWords("a  b", "a b")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "  " },
      { kind: "ins", text: " " },
      { kind: "same", text: "b" },
    ]);
  });

  it("identical texts are one `same` part", () => {
    expect(diffWords("Small, loud, decided.", "Small, loud, decided.")).toEqual([
      { kind: "same", text: "Small, loud, decided." },
    ]);
  });

  it("an empty side is all removal or all addition; two empties are nothing", () => {
    expect(diffWords("", "Now here.")).toEqual([{ kind: "ins", text: "Now here." }]);
    expect(diffWords("Was here.", "")).toEqual([{ kind: "del", text: "Was here." }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("keeps leading and repeated whitespace so the parts re-join verbatim", () => {
    const before = "  two  spaces ";
    const after = " one space";
    const parts = diffWords(before, after);
    expect(rejoin(parts, "del")).toBe(before);
    expect(rejoin(parts, "ins")).toBe(after);
  });

  it("holds the invariant on a wholesale rewrite with nothing in common", () => {
    const before = "Alpha beta gamma.";
    const after = "Delta epsilon.";
    expect(diffWords(before, after)).toEqual([
      { kind: "del", text: "Alpha beta gamma." },
      { kind: "ins", text: "Delta epsilon." },
    ]);
  });

  it("above the token guard it skips the pairing and stacks the two texts whole", () => {
    const before = Array.from({ length: DIFF_TOKEN_GUARD + 500 }, (_, i) => `w${i}`).join(" ");
    const after = `${before} tail`;
    const parts = diffWords(before, after);
    expect(parts).toEqual([
      { kind: "del", text: before },
      { kind: "ins", text: after },
    ]);
    // The guard fires on either side being over it.
    expect(diffWords("short", after)).toEqual([
      { kind: "del", text: "short" },
      { kind: "ins", text: after },
    ]);
    // Exactly at the guard the pairing still runs.
    const atGuard = Array.from({ length: DIFF_TOKEN_GUARD }, (_, i) => `w${i}`).join(" ");
    expect(diffWords(atGuard, atGuard)).toEqual([{ kind: "same", text: atGuard }]);
  });
});

describe("diffParagraphs", () => {
  it("pairs paragraphs in order and diffs each", () => {
    const before = rt("Charlotte is a three-year-old tabby.", "She ignores the dog.");
    const after = rt("Charlotte is a tabby.", "She tolerates the dog.");
    const diff = diffParagraphs(before, after);
    expect(diff).toHaveLength(2);
    expect(diff[0]?.parts).toEqual([
      { kind: "same", text: "Charlotte is a " },
      { kind: "del", text: "three-year-old " },
      { kind: "same", text: "tabby." },
    ]);
    expectInvariant(diff, before, after);
  });

  it("a paragraph removed is all struck; a paragraph added is all new", () => {
    const shorter = rt("Kept as it was.");
    const longer = rt("Kept as it was.", "She waits by the kettle.");
    const removed = diffParagraphs(longer, shorter);
    expect(removed).toEqual([
      { parts: [{ kind: "same", text: "Kept as it was." }] },
      { parts: [{ kind: "del", text: "She waits by the kettle." }] },
    ]);
    const added = diffParagraphs(shorter, longer);
    expect(added).toEqual([
      { parts: [{ kind: "same", text: "Kept as it was." }] },
      { parts: [{ kind: "ins", text: "She waits by the kettle." }] },
    ]);
    expectInvariant(removed, longer, shorter);
    expectInvariant(added, shorter, longer);
  });

  it("identical rich text is all `same`; formatting runs are joined as plain text", () => {
    const text: RichText = {
      paragraphs: [{ runs: [{ text: "A " }, { text: "calm", bold: true }, { text: " cat." }] }],
    };
    expect(diffParagraphs(text, text)).toEqual([
      { parts: [{ kind: "same", text: "A calm cat." }] },
    ]);
  });

  it("drops a paragraph that is empty on both sides, and two empty bios diff to nothing", () => {
    expect(diffParagraphs(rt(""), rt(""))).toEqual([]);
    expect(diffParagraphs({ paragraphs: [] }, { paragraphs: [] })).toEqual([]);
    expect(diffParagraphs({ paragraphs: [] }, rt("New."))).toEqual([
      { parts: [{ kind: "ins", text: "New." }] },
    ]);
  });
});

describe("diffLength and foldDiff", () => {
  const diff: ParagraphDiff[] = [
    {
      parts: [
        { kind: "same", text: "One two three " },
        { kind: "del", text: "four " },
        { kind: "ins", text: "five " },
        { kind: "same", text: "six." },
      ],
    },
    { parts: [{ kind: "ins", text: "Seven eight nine ten." }] },
  ];

  it("counts every character the card would draw, struck and underlined included", () => {
    expect(diffLength(diff)).toBe(
      "One two three four five six.".length + "Seven eight nine ten.".length,
    );
    expect(diffLength([])).toBe(0);
  });

  it("leaves a diff within the budget whole", () => {
    expect(foldDiff(diff, 1000)).toEqual({ shown: diff, folded: false });
    expect(foldDiff(diff, diffLength(diff))).toEqual({ shown: diff, folded: false });
  });

  it("cuts at a word boundary inside the part that crosses the budget, ending in an ellipsis", () => {
    const { shown, folded } = foldDiff(diff, 20);
    expect(folded).toBe(true);
    expect(shown).toEqual([
      {
        parts: [
          { kind: "same", text: "One two three " },
          { kind: "del", text: "four…" },
        ],
      },
    ]);
  });

  it("cuts inside a part at the last word boundary that fits", () => {
    const { shown, folded } = foldDiff(diff, 9);
    expect(folded).toBe(true);
    expect(shown).toEqual([{ parts: [{ kind: "same", text: "One two…" }] }]);
  });

  it("keeps a whitespace-only first part whole when the budget lands inside it", () => {
    const spaced: ParagraphDiff[] = [
      {
        parts: [
          { kind: "same", text: "     " },
          { kind: "ins", text: "x" },
        ],
      },
    ];
    expect(foldDiff(spaced, 2)).toEqual({
      shown: [{ parts: [{ kind: "same", text: "…" }] }],
      folded: true,
    });
  });

  it("a fold that lands at a paragraph's start drops it whole and puts the ellipsis on the paragraph before", () => {
    const { shown, folded } = foldDiff(diff, "One two three four five six.".length);
    expect(folded).toBe(true);
    expect(shown).toEqual([
      {
        parts: [
          { kind: "same", text: "One two three " },
          { kind: "del", text: "four " },
          { kind: "ins", text: "five " },
          { kind: "same", text: "six.…" },
        ],
      },
    ]);
    // A paragraph before it with nothing in it has nowhere to put the ellipsis.
    const empty: ParagraphDiff[] = [{ parts: [] }, { parts: [{ kind: "ins", text: "Later." }] }];
    expect(foldDiff(empty, 0)).toEqual({ shown: [{ parts: [] }], folded: true });
  });

  it("a budget that lands before the first word still shows something, not an empty card", () => {
    const { shown, folded } = foldDiff(diff, 2);
    expect(folded).toBe(true);
    expect(shown).toEqual([{ parts: [{ kind: "same", text: "One…" }] }]);
  });
});
