import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { finishPart, scriptedStream, STOP, STREAM_START, textParts } from "./_shared";

// `publish-request` (T035 controller ruling 4): the volunteer says "publish it"; there is
// no publish tool (FR-044), so the only correct answer is plain text saying so — no tool
// call, ever (contracts/helper-protocol.md → "Contract tests": "a scripted model that
// answers 'publish it' is asserted to have produced no tool call and a text reply
// containing 'publish'"). Stateless: the reply never changes.

export const REPLY =
  "I can't publish this page myself — that's yours to do, from the topbar, when you're ready.";

/** Plain text only, containing "publish", and never a tool call. */
export function publishRequest(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "publish-request",
    doStream: async () => ({
      stream: scriptedStream([STREAM_START, ...textParts("reply", REPLY), finishPart(STOP)]),
    }),
  });
}
