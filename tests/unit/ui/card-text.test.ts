import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import {
  consequenceHeading,
  ledgerKey,
  notAppliedLine,
  operationsHeader,
  rowSentence,
} from "@/ui/helper/card-text";

// The proposal card's sentence helpers (F58 moved them out of `ProposalCard.tsx`): the
// ledger key per operation, the row's sentence and the notice's heading cut from
// `describeOperation`'s summary, the "Not applied" gerund, the mono header.

const BLOCK = { kind: "block" as const, blockId: "blockaaaaaab" };

describe("ledgerKey", () => {
  it("names what a set_field touches by the first segment of its path", () => {
    const cases: Array<[string, string]> = [
      ["name", "name"],
      ["age", "age"],
      ["sex", "sex"],
      ["tagline", "tagline"],
      ["content", "bio"],
      ["caption", "caption"],
      ["mediaIds", "gallery"],
      ["text", "quote"],
      ["attribution", "quote"],
      ["cards", "cards"],
      ["cards.1.title", "cards"],
      ["scenes.2.caption", "scene"],
      // A path the schema would never let through still gets a word, never a blank key.
      ["nosuch", "field"],
    ];
    for (const [path, key] of cases) {
      const op = { op: "set_field", target: BLOCK, path, value: "x" } as EditOperation;
      expect(ledgerKey(op)).toBe(key);
    }
  });

  it("names the other operations by what they touch", () => {
    const ops: Array<[EditOperation, string]> = [
      [{ op: "add_block", block: { type: "photo", mediaId: null } }, "section"],
      [{ op: "remove_block", blockId: BLOCK.blockId }, "section"],
      [{ op: "reorder_blocks", order: [] }, "order"],
      [{ op: "set_theme", preset: "sand" }, "theme"],
      [{ op: "replace_image", blockId: BLOCK.blockId, slot: 0, mediaId: "media2aa" }, "photo"],
    ];
    for (const [op, key] of ops) expect(ledgerKey(op)).toBe(key);
  });
});

describe("the summary's sentences", () => {
  const summary = "Shorten the bio. Shortening the bio replaces your text.";

  it("cuts the row's sentence and the notice's heading from a two-sentence summary", () => {
    expect(rowSentence(summary, true)).toBe("Shorten the bio.");
    expect(rowSentence(summary, false)).toBe(summary);
    expect(consequenceHeading(summary)).toBe("Shortening the bio replaces your text");
  });

  it("keeps a one-sentence summary whole, and heads a notice with it", () => {
    expect(rowSentence("Move the quote above the bio.", true)).toBe(
      "Move the quote above the bio.",
    );
    expect(consequenceHeading("Remove the quote.")).toBe("Remove the quote");
  });

  it("turns the first sentence's verb into a gerund for the Not applied line", () => {
    expect(notAppliedLine(summary)).toBe("Not applied: shortening the bio.");
    expect(notAppliedLine("Change the tagline. Changing the tagline replaces your text.")).toBe(
      "Not applied: changing the tagline.",
    );
  });

  it("counts the operations in the mono header", () => {
    expect(operationsHeader(1)).toBe("Proposed · 1 operation");
    expect(operationsHeader(2)).toBe("Proposed · 2 operations");
  });
});
