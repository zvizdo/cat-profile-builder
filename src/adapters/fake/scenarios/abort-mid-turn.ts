import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { callPart, scriptedStream, STREAM_START } from "./_shared";

// `abort-mid-turn` (T035 controller ruling 4): two `add_block`s land, then the stream
// itself fails — exercising `helperReducer`'s `streamEnded` error path (contracts/
// helper-protocol.md → "Client state": whatever was applied stays, saved, under the
// turn's history entry). The failure is the same on every call — there is nothing to
// branch on, since the whole point is that it goes wrong the first time it is asked.

const BLOCKS = [
  { type: "bio" as const, content: { paragraphs: [] } },
  { type: "gallery" as const, mediaIds: [] },
];

/** Two `add_block` tool calls, then a stream error (no `finish` part ever arrives). */
export function abortMidTurn(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "abort-mid-turn",
    doStream: async () => ({
      stream: scriptedStream([
        STREAM_START,
        ...BLOCKS.map((block, i) =>
          callPart(`abort-${i}`, "add_block", { op: "add_block", block }),
        ),
        { type: "error", error: new Error("The connection dropped.") },
      ]),
    }),
  });
}
