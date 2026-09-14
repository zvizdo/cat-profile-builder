import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { createHelperStream, helperUIMessageStream } from "@/adapters/vertex/helper-stream";
import { memoryLogger } from "../../fakes/logger";

// A scripted `/api/helper/chat` for these component tests: not a hand-rolled UI message
// stream (an early draft built one directly with `createUIMessageStream`, but without
// `streamText`'s own step/message bookkeeping it mis-shaped multi-request turns — a
// `finishReason: "tool-calls"` reply's answered tool call kept reappearing in every
// message after it, so `lastAssistantMessageIsCompleteWithToolCalls` never went false and
// the chat auto-continued forever). This instead runs the real
// `createHelperStream` (`src/adapters/vertex/helper-stream.ts`, the same function
// `POST /api/helper/chat` calls) over a scripted `MockLanguageModelV3`, so every response
// is shaped exactly as the real server's `streamText().toUIMessageStream()` shapes it —
// the same guarantee `tests/contract/helper-protocol.stream.test.ts` already leans on.

/** A `fetch` replacement that answers every request through `createHelperStream`. */
export function fakeChatFetch(model: LanguageModelV3) {
  return async (_url: string, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { messages: UIMessage[] };
    const result = await createHelperStream({
      model,
      system: "You are the cat profile helper, under test.",
      messages: body.messages,
      assets: [],
      readPhoto: async () => null,
      loadSkill: async () => ({ error: "No skills in this test." }),
      logger: memoryLogger(),
      profileId: "abcdefgh",
      surface: "full",
    });
    return createUIMessageStreamResponse({ stream: helperUIMessageStream(result) });
  };
}
