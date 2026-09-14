import type { LanguageModelV3, LanguageModelV3FinishReason } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

// The `noop` scenario: a model that says one short sentence and stops. It is the default
// when `MODEL=fake` and no scripted conversation is asked for, and the smoke check that the
// helper's plumbing works end to end. T035 adds the scripted drafting scenarios beside it.

/** What the noop model always says. */
export const NOOP_TEXT = "I can help once there is a photo.";

const USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: undefined };

/** A fresh model each call, because a stream can be read once. */
export function noop(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "noop",
    doGenerate: async () => ({
      content: [{ type: "text", text: NOOP_TEXT }],
      finishReason: STOP,
      usage: USAGE,
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "1" },
          { type: "text-delta", id: "1", delta: NOOP_TEXT },
          { type: "text-end", id: "1" },
          { type: "finish", finishReason: STOP, usage: USAGE },
        ],
      }),
    }),
  });
}
