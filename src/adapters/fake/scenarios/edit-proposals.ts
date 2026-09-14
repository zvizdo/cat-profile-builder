import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
  outlineBlockId,
  outlineBlockIds,
  resultText,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "./_shared";

// `edit-proposals` (T035 controller ruling 4): reads the outline to find the page's own
// block ids, reverses their order (an additive `reorder_blocks` — applies at once, no
// card), then shortens the bio it just saw (a destructive `set_field` — a card, per
// `describeOperation`). Demonstrates the one-applied-one-carded shape of a turn.

const SHORT_BIO = { paragraphs: [{ runs: [{ text: "A calm, curious cat who loves a lap." }] }] };

const SUMMARY = "Reordered the sections and shortened the bio — take a look at the card.";
const NO_BIO = "This page doesn't have a bio yet, so there's nothing to shorten.";

function readOutlineStep() {
  return scriptedStream([
    STREAM_START,
    callPart("outline-1", "read_outline", {}),
    finishPart(TOOL_CALLS),
  ]);
}

// The hero is always first in the outline and `applyOperation` refuses any order that
// doesn't keep it there (F1: mandatory, fixed at the top) — reversing the *whole* list, as
// an earlier version of this step did, put the hero last and made every "move the video
// up" turn silently rejected before it ever reached the card. Only the sortable blocks
// (everything after the hero) reverse.
function reorderStep(outline: string) {
  const [heroId, ...sortable] = outlineBlockIds(outline);
  const order = heroId === undefined ? sortable : [heroId, ...sortable.reverse()];
  return scriptedStream([
    STREAM_START,
    callPart("reorder-1", "reorder_blocks", { op: "reorder_blocks", order }),
    finishPart(TOOL_CALLS),
  ]);
}

function shortenBioStep(bioId: string) {
  const op = {
    op: "set_field" as const,
    target: { kind: "block" as const, blockId: bioId },
    path: "content" as const,
    value: SHORT_BIO,
  };
  return scriptedStream([
    STREAM_START,
    callPart("shorten-1", "set_field", op),
    finishPart(TOOL_CALLS),
  ]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** Reorders the page, then proposes shortening whatever bio it finds — a card, not a write. */
export function editProposals(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "edit-proposals",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "read_outline")) return { stream: readOutlineStep() };
      const outline = resultText(prompt, "read_outline");
      if (!hasResult(prompt, "reorder_blocks")) return { stream: reorderStep(outline) };
      const bioId = outlineBlockId(outline, "bio");
      if (bioId === undefined) return { stream: textStep("no-bio", NO_BIO) };
      if (!hasResult(prompt, "set_field")) return { stream: shortenBioStep(bioId) };
      return { stream: textStep("summary", SUMMARY) };
    },
  });
}
