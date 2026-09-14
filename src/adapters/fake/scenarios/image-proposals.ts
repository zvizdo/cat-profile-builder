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

// `image-proposals` (F59 browser check / e2e): the non-text half of F58's cards — a
// photo swap and a removal with a face. Turn 1 ("give her a better hero photo"):
// `read_outline` (to find the hero's own block id) then `list_media` (to find a ready
// photo that is not already there) — both browser-answered reads, the way a real model
// would check before proposing anything — then `replace_image` on the hero, which
// `describeOperation` always cards unless the swap is an enhancement pair (never true
// for two freshly uploaded fixtures). Turn 2 (anything else, e.g. "remove the quote"):
// `remove_block` on the page's quote, reusing the outline turn 1 already read — a
// quote's `remove_block` is always destructive (`phone-edits` proves it for one with no
// photo); here the quote carries one, so the card also draws its face.

const HERO_DONE = "That's her hero photo.";
const QUOTE_DONE = "That's the quote gone.";
const NO_HERO = "This cat has no hero photo to swap.";
const NO_SPARE_PHOTO = "There's no other ready photo to put there.";
const NO_QUOTE = "This page doesn't have a quote to remove.";

function readOutlineStep() {
  return scriptedStream([
    STREAM_START,
    callPart("outline-1", "read_outline", {}),
    finishPart(TOOL_CALLS),
  ]);
}

function listMediaStep() {
  return scriptedStream([
    STREAM_START,
    callPart("list-1", "list_media", {}),
    finishPart(TOOL_CALLS),
  ]);
}

function replaceHeroStep(heroId: string, mediaId: string) {
  const op = { op: "replace_image", blockId: heroId, mediaId };
  return scriptedStream([
    STREAM_START,
    callPart("replace-1", "replace_image", op),
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

/** The ready photo id `listing` names that is not `heroId`'s own current photo (block
 * ids and media ids share no characters in common, so a substring check is enough for a
 * scripted fixture), or `undefined` with nothing spare. */
function sparePhotoId(listing: string, heroBlockId: string): string | undefined {
  for (const line of listing.split("\n")) {
    const match = /^([a-z2-7]{8}) photo /.exec(line);
    if (match?.[1] === undefined || line.includes(heroBlockId)) continue;
    return match[1];
  }
  return undefined;
}

/** A hero `replace_image` card on the first request, a quote `remove_block` card on the
 * next — one card per turn, the way `phone-edits` and `text-proposals` are written. */
export function imageProposals(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "image-proposals",
    doStream: async ({ prompt }) => {
      if (userTurnCount(prompt) === 1) {
        if (!hasResult(prompt, "read_outline")) return { stream: readOutlineStep() };
        const heroId = outlineBlockId(resultText(prompt, "read_outline"), "hero");
        if (heroId === undefined) return { stream: textStep("no-hero", NO_HERO) };
        if (!hasResult(prompt, "list_media")) return { stream: listMediaStep() };
        if (hasResult(prompt, "replace_image")) return { stream: textStep("hero-done", HERO_DONE) };
        const mediaId = sparePhotoId(resultText(prompt, "list_media"), heroId);
        if (mediaId === undefined) return { stream: textStep("no-spare", NO_SPARE_PHOTO) };
        return { stream: replaceHeroStep(heroId, mediaId) };
      }
      if (hasResult(prompt, "remove_block")) return { stream: textStep("quote-done", QUOTE_DONE) };
      const quoteId = outlineBlockId(resultText(prompt, "read_outline"), "quote");
      if (quoteId === undefined) return { stream: textStep("no-quote", NO_QUOTE) };
      return { stream: removeQuoteStep(quoteId) };
    },
  });
}
