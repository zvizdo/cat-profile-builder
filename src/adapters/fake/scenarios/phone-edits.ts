import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
  outlineBlockId,
  resultText,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
  userTurnCount,
} from "./_shared";

// `phone-edits` (T040 browser check): a populated cat, two separate turns from the phone
// tree, where the volunteer has no way to add or remove a section by hand (FR-091) —
// everything here has to be the helper's own doing. Turn 1: "add a section about her
// favourite box" — an additive `add_block` (a photo section is never destructive per
// `describeOperation`), so it lands on the read-only preview at once, no card. Turn 2:
// "remove the quote" — `remove_block` is always destructive, so it cards and waits for
// Apply. No existing scenario produces this pair (T040 report): `edit-proposals` reorders
// and shortens a bio, `build-proposal`/`abort-mid-turn`/`truncated` are build-phase only, and
// none adds a photo section or removes a quote specifically.
//
// Written the same way `edit-proposals` is (T035 controller ruling 4): a pure function of
// the whole conversation's `prompt`, since a fresh `MockLanguageModelV3` is built per HTTP
// request under `MODEL=fake` (chat.ts's `x-fake-scenario`) — nothing here is a closure
// counter. `userTurnCount` is what tells turn 1's closing text apart from turn 2's opening
// `read_outline`, since both would otherwise look like "no more results yet" once
// `add_block` has already resolved.

const ADDED_SUMMARY = "Added a photo section about her favourite box.";
const REMOVED_SUMMARY = "Removed the quote.";
const NO_PHOTO = "This cat doesn't have a photo yet, so there's nothing to use for that section.";
const NO_QUOTE = "This page doesn't have a quote to remove.";

function listMediaStep() {
  return scriptedStream([
    STREAM_START,
    callPart("list-1", "list_media", {}),
    finishPart(TOOL_CALLS),
  ]);
}

/** The first `id … photo …` line `listMedia` printed, or `undefined` with no photo at all. */
function firstPhotoId(listing: string): string | undefined {
  return /^([a-z2-7]{8}) photo /m.exec(listing)?.[1];
}

function addBoxSectionStep(photoId: string) {
  const block = {
    type: "photo" as const,
    mediaId: photoId,
    caption: "Her favourite box, right by the window.",
  };
  return scriptedStream([
    STREAM_START,
    callPart("add-1", "add_block", { op: "add_block", block }),
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

function removeQuoteStep(quoteId: string) {
  return scriptedStream([
    STREAM_START,
    callPart("remove-1", "remove_block", { op: "remove_block", blockId: quoteId }),
    finishPart(TOOL_CALLS),
  ]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** Adds a photo section about the cat's favourite box, then — asked again — removes the
 * page's quote, proposed as a card. */
export function phoneEdits(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "phone-edits",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "list_media")) return { stream: listMediaStep() };
      if (!hasResult(prompt, "add_block")) {
        const photoId = firstPhotoId(resultText(prompt, "list_media"));
        if (photoId === undefined) return { stream: textStep("no-photo", NO_PHOTO) };
        return { stream: addBoxSectionStep(photoId) };
      }
      if (userTurnCount(prompt) === 1) return { stream: textStep("added", ADDED_SUMMARY) };
      if (!hasResult(prompt, "read_outline")) return { stream: readOutlineStep() };
      if (!hasResult(prompt, "remove_block")) {
        const outline = resultText(prompt, "read_outline");
        const quoteId = outlineBlockId(outline, "quote");
        if (quoteId === undefined) return { stream: textStep("no-quote", NO_QUOTE) };
        return { stream: removeQuoteStep(quoteId) };
      }
      return { stream: textStep("removed", REMOVED_SUMMARY) };
    },
  });
}
