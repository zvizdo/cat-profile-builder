import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { finishPart, scriptedStream, STOP, STREAM_START, textParts } from "./_shared";

// `markdown-reply` (F31 browser check): a single scripted reply exercising every element of
// the Markdown subset `systemPrompt` tells the model it may use — a heading, bold, italic, a
// bulleted list, a numbered list and a link — plus a literal `<img onerror>` tag no
// volunteer asked for, so the escape (`src/ui/helper/Markdown.tsx`, ADR-017) is visible in
// the running app and not only in a test fixture. Stateless: it always replies with the same
// text, once, then stops.

export const MARKDOWN_REPLY_TEXT = [
  "### A quick update",
  "",
  "I gave the bio a **friendlier** opening and tucked in a note about her being *shy at " +
    "first*. Here's what changed:",
  "",
  "- Softened the first line",
  "- Added a line about her favourite windowsill",
  "",
  "What you might want next:",
  "",
  "1. Add a photo of her outside",
  "2. Pick a warmer background",
  "",
  "Read more about shy cats on the [ASPCA site](https://www.aspca.org).",
  "",
  "<img src=x onerror=alert(1)>",
].join("\n");

/** A model that always replies with `MARKDOWN_REPLY_TEXT`, once, then stops. */
export function markdownReply(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "markdown-reply",
    doStream: async () => ({
      stream: scriptedStream([
        STREAM_START,
        ...textParts("1", MARKDOWN_REPLY_TEXT),
        finishPart(STOP),
      ]),
    }),
  });
}
