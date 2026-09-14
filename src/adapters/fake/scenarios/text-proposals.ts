import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  lastUserText,
  outlineBlockId,
  resultCount,
  resultText,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
  userTurnCount,
} from "./_shared";

// `text-proposals` (F58 browser check): two text edits that card, one per request, so
// the proposal card's before → after can be seen on both surfaces. A request that
// mentions the tagline proposes a new tagline (a destructive `set_field` on a filled
// tagline — the two-line form: the old struck, the new under it); any other request
// reads the outline and proposes a two-paragraph bio in place of whatever bio the page
// has (the word-diff form, which folds and opens the phone drawer to Full once the bio
// it replaces is long enough). Written like `phone-edits`: a pure function of the
// prompt, one card per user turn, so the same scenario answers a second request.

/** The tagline the scenario proposes — 57 characters, over the one-line readout's cut. */
export const PROPOSED_TAGLINE = "Follows you room to room, then settles on the nearest lap";

/** The bio the scenario proposes, in two paragraphs. */
export const PROPOSED_BIO = {
  paragraphs: [
    {
      runs: [
        {
          text: "Charlotte is a tabby who follows you from room to room and curls up on your lap the second you sit.",
        },
      ],
    },
    { runs: [{ text: "She ignores the dog and does not scratch the sofa." }] },
  ],
};

const TAGLINE_DONE = "That's the tagline settled.";
const BIO_DONE = "That's the bio settled.";
const NO_BIO = "This page doesn't have a bio yet, so there's nothing to rewrite.";

function taglineStep() {
  const op = {
    op: "set_field",
    target: { kind: "profile" },
    path: "tagline",
    value: PROPOSED_TAGLINE,
  };
  return scriptedStream([
    STREAM_START,
    callPart("tagline-1", "set_field", op),
    finishPart(TOOL_CALLS),
  ]);
}

function readOutlineStep() {
  return scriptedStream([
    STREAM_START,
    callPart("outline-1", "read_outline", {}),
    finishPart(TOOL_CALLS),
  ]);
}

function bioStep(bioId: string) {
  const op = {
    op: "set_field",
    target: { kind: "block", blockId: bioId },
    path: "content",
    value: PROPOSED_BIO,
  };
  return scriptedStream([STREAM_START, callPart("bio-1", "set_field", op), finishPart(TOOL_CALLS)]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** A tagline card for a request that names the tagline; a bio card for any other. */
export function textProposals(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "text-proposals",
    doStream: async ({ prompt }) => {
      const turns = userTurnCount(prompt);
      const tagline = /tagline/i.test(lastUserText(prompt));
      const answered = resultCount(prompt, "set_field") >= turns;
      if (answered) return { stream: textStep("done", tagline ? TAGLINE_DONE : BIO_DONE) };
      if (tagline) return { stream: taglineStep() };
      if (resultCount(prompt, "read_outline") < turns) return { stream: readOutlineStep() };
      const bioId = outlineBlockId(resultText(prompt, "read_outline"), "bio");
      if (bioId === undefined) return { stream: textStep("no-bio", NO_BIO) };
      return { stream: bioStep(bioId) };
    },
  });
}
