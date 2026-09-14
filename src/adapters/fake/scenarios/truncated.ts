import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { callPart, finishPart, LENGTH, scriptedStream, STREAM_START } from "./_shared";

// `truncated` (T035 controller ruling 4): three `add_block`s land, then the model runs out
// of room — `finishReason: "length"` — exercising `helperReducer`'s truncated state
// (contracts/helper-protocol.md → "Client state": applied edits stay, the panel offers
// undo and retry). Stateless: it always cuts off after the same three blocks.

const BLOCKS = [
  { type: "bio" as const, content: { paragraphs: [] } },
  { type: "gallery" as const, mediaIds: [] },
  { type: "quote" as const, mediaId: null, text: "She purrs like a little engine." },
];

/** Three `add_block` tool calls, then `finishReason: "length"`. */
export function truncated(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "truncated",
    doStream: async () => ({
      stream: scriptedStream([
        STREAM_START,
        ...BLOCKS.map((block, i) =>
          callPart(`truncated-${i}`, "add_block", { op: "add_block", block }),
        ),
        finishPart(LENGTH),
      ]),
    }),
  });
}
