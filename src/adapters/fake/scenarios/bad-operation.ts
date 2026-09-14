import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "./_shared";

// `bad-operation` (T035 controller ruling 4): a `reorder_blocks` whose `order` is missing
// ids — well-formed enough to pass the tool's own input schema (a list of block ids), but
// not a permutation of the page's current blocks, so `applyOperation` refuses it
// (contracts/helper-protocol.md → "Contract tests": "a non-conforming input … is rejected,
// document unchanged, reason names the problem"). Once the browser answers `rejected`, the
// model apologises in plain text rather than trying again unprompted (FR-046/047: nothing
// is retried on its own).

const BAD_ORDER = { op: "reorder_blocks" as const, order: ["baaaaaaaaaab"] };

const APOLOGY = "Sorry — that reorder didn't take. Tell me where you'd like things instead.";

/** One malformed `reorder_blocks`, then an apology once it comes back rejected. */
export function badOperation(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "bad-operation",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "reorder_blocks")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("bad-reorder", "reorder_blocks", BAD_ORDER),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("apology", APOLOGY), finishPart(STOP)]),
      };
    },
  });
}
