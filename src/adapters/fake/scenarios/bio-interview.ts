import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
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

// `bio-interview` (F65): a standalone "Write a bio" the way `write-bio`'s look-then-ask
// section scripts it. Turn 1 loads the skill, reads the outline and the media list, looks
// at up to six photos (skipped when there are none — `view_photos` refuses an empty list),
// and asks one question that points at what it saw. Turn 2 — the volunteer's answer —
// writes the bio: a `set_field` on the page's bio when it has one (neutral while that bio
// is empty, a card once it holds text), an `add_block` when it has none; then re-reads the
// outline and says it's done. Written like `text-proposals`: a pure function of the prompt.

/** The one question turn 1 asks — it names the photos, the way the skill tells a model to. */
export const BIO_QUESTION =
  "I can see her settled on a windowsill in the photos. Is that her favourite spot, and what does she do there?";

/** The bio turn 2 writes, one paragraph. */
export const INTERVIEW_BIO = {
  paragraphs: [
    {
      runs: [
        {
          text: "The windowsill is hers from the first light, and she chirps at every pigeon that lands outside.",
        },
      ],
    },
  ],
};

export const BIO_DONE = "That's the bio written.";

/** How many photos `view_photos` takes in one call (its input schema's `max(6)`). */
const VIEW_LIMIT = 6;

function callStep(id: string, toolName: string, input: unknown) {
  return scriptedStream([STREAM_START, callPart(id, toolName, input), finishPart(TOOL_CALLS)]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** The photo ids on a `list_media`-shaped listing ("<id> photo WxH — …"), in order — the
 * same eight-character id pattern `image-proposals` and `phone-edits` match. */
function photoIds(listing: string): string[] {
  return [...listing.matchAll(/^([a-z2-7]{8}) photo /gm)].map((match) => match[1] ?? "");
}

function writeStep(outline: string) {
  const bioId = outlineBlockId(outline, "bio");
  if (bioId === undefined) {
    const op = { op: "add_block", block: { type: "bio", content: INTERVIEW_BIO } };
    return callStep("bio-add-1", "add_block", op);
  }
  const op = {
    op: "set_field",
    target: { kind: "block", blockId: bioId },
    path: "content",
    value: INTERVIEW_BIO,
  };
  return callStep("bio-set-1", "set_field", op);
}

/** Look, ask one question pointing at the photos, then — on the answer — write and re-read. */
export function bioInterview(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "bio-interview",
    doStream: async ({ prompt }) => {
      if (userTurnCount(prompt) === 1) {
        if (!hasResult(prompt, "load_skill")) {
          return { stream: callStep("skill-1", "load_skill", { name: "write-bio" }) };
        }
        if (!hasResult(prompt, "read_outline")) {
          return { stream: callStep("outline-1", "read_outline", {}) };
        }
        if (!hasResult(prompt, "list_media")) {
          return { stream: callStep("media-1", "list_media", {}) };
        }
        const ids = photoIds(resultText(prompt, "list_media")).slice(0, VIEW_LIMIT);
        if (ids.length > 0 && !hasResult(prompt, "view_photos")) {
          return { stream: callStep("view-1", "view_photos", { ids }) };
        }
        return { stream: textStep("question-1", BIO_QUESTION) };
      }
      const edited = hasResult(prompt, "set_field") || hasResult(prompt, "add_block");
      if (!edited) return { stream: writeStep(resultText(prompt, "read_outline")) };
      if (resultCount(prompt, "read_outline") < 2) {
        return { stream: callStep("outline-2", "read_outline", {}) };
      }
      return { stream: textStep("done", BIO_DONE) };
    },
  });
}
