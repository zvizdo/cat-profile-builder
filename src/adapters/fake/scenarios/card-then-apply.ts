import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
  resultStatus,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "./_shared";

// `card-then-apply` (F42): the shape of the step that stalled the deployed build, cut to
// its two halves — one destructive `set_field` on the cat's (already filled) name, which
// cards, and in the *same* step an additive `add_block` of an empty bio, which applies at
// once. Before F42 the applied edit dismissed the waiting card and the model's call was
// never answered; now the card stands beside the new bio block, and Apply or Not this
// sends the step's last answer, after which the model closes with one line that names
// what happened to the name.

/** The name the scenario proposes — destructive on any page whose cat is not called this. */
export const PROPOSED_NAME = "Marmalade";

const EMPTY_BIO = { type: "bio" as const, content: { paragraphs: [] } };

/** The closing line, by how the volunteer answered the card. */
export const CLOSING: Record<string, string> = {
  applied: "Renamed her Marmalade and added an empty bio to fill in.",
  declined: "Kept the name as it was and added an empty bio to fill in.",
  rejected: "Left the name alone and added an empty bio to fill in.",
};

function editStep() {
  return scriptedStream([
    STREAM_START,
    callPart("name-1", "set_field", {
      op: "set_field",
      target: { kind: "profile" },
      path: "name",
      value: PROPOSED_NAME,
    }),
    callPart("bio-1", "add_block", { op: "add_block", block: EMPTY_BIO }),
    finishPart(TOOL_CALLS),
  ]);
}

function closingStep(status: string) {
  const text = CLOSING[status] ?? CLOSING.declined ?? "";
  return scriptedStream([STREAM_START, ...textParts("closing", text), finishPart(STOP)]);
}

/** A card and an applied edit in one step, then a closing line once both are answered. */
export function cardThenApply(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "card-then-apply",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) return { stream: editStep() };
      return { stream: closingStep(resultStatus(prompt, "set_field")) };
    },
  });
}
