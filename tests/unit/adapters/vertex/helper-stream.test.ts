import type {
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import type { UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  callPart,
  hasResult,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
  USAGE,
} from "@/adapters/fake/scenarios/_shared";
import { createHelperStream, helperUIMessageStream } from "@/adapters/vertex/helper-stream";
import { memoryLogger } from "../../../fakes/logger";

// F42 (build-stall-investigation.md, side finding 4): Cloud Run had nothing to say about
// a stalled build — only the request log and the autosave timing told the story. One
// `info` line per request now says what the turn did: how many steps, which tools in
// order, how it finished and what it cost. Names and ids only — never an input, an
// output, a message's text or a photo (constitution: logs carry ids only).

const SECRET = "SECRET-VOLUNTEER-TEXT";

function userMessage(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** `load_skill` (server-executed, so both steps happen in one request), then text. */
function twoStepModel(): MockLanguageModelV3 {
  const usage: LanguageModelV3Usage = {
    inputTokens: { ...USAGE.inputTokens, total: 10 },
    outputTokens: { ...USAGE.outputTokens, total: 5 },
  };
  const finish = (finishReason: LanguageModelV3FinishReason): LanguageModelV3StreamPart => ({
    type: "finish",
    finishReason,
    usage,
  });
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "two-steps",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "load_skill")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("s1", "load_skill", { name: "write-bio" }),
            finish(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([
          STREAM_START,
          ...textParts("t", `Here is the ${SECRET}.`),
          finish(STOP),
        ]),
      };
    },
  });
}

async function drain(stream: ReadableStream<unknown>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

describe("createHelperStream — the per-turn log (F42)", () => {
  it("writes exactly one `helper turn` info line per request, with the listed keys and nothing else", async () => {
    const logger = memoryLogger();
    const result = await createHelperStream({
      model: twoStepModel(),
      system: "system",
      messages: [userMessage("u1", `Write a bio: ${SECRET}`)],
      assets: [],
      readPhoto: async () => null,
      loadSkill: async () => ({ error: "No skills in this test." }),
      logger,
      profileId: "abcdefgh",
      surface: "phone",
    });
    await drain(helperUIMessageStream(result));

    const turns = logger.entries.filter((entry) => entry.msg === "helper turn");
    expect(turns).toHaveLength(1);
    const [turn] = turns;
    expect(turn?.level).toBe("info");
    expect(turn?.fields).toEqual({
      profileId: "abcdefgh",
      surface: "phone",
      steps: 2,
      toolCalls: ["load_skill"],
      finishReason: "stop",
      aborted: false,
      errored: false,
      durationMs: expect.any(Number),
      inputTokens: 20,
      outputTokens: 10,
    });
    expect(Object.keys(turn?.fields ?? {}).sort()).toEqual(
      [
        "aborted",
        "durationMs",
        "errored",
        "finishReason",
        "inputTokens",
        "outputTokens",
        "profileId",
        "steps",
        "surface",
        "toolCalls",
      ].sort(),
    );
    // No log line of any level carries a message's text, an input or an output.
    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain("write-bio");
    expect(dump).not.toMatch(/"(input|output|data)"/);
  });

  it("a stream that errors logs one warn with `errored: true`, and any info line says errored too", async () => {
    const logger = memoryLogger();
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "errors",
      doStream: async () => ({
        stream: scriptedStream([
          STREAM_START,
          { type: "error", error: new Error(`provider said ${SECRET}`) },
        ]),
      }),
    });
    const result = await createHelperStream({
      model,
      system: "system",
      messages: [userMessage("u1", "hi")],
      assets: [],
      readPhoto: async () => null,
      loadSkill: async () => ({ error: "none" }),
      logger,
      profileId: "abcdefgh",
      surface: "full",
    });
    await drain(helperUIMessageStream(result));
    const turns = logger.entries.filter((entry) => entry.msg === "helper turn");
    const warns = turns.filter((entry) => entry.level === "warn");
    expect(warns).toHaveLength(1);
    expect(warns[0]?.fields).toMatchObject({
      profileId: "abcdefgh",
      surface: "full",
      errored: true,
    });
    // The SDK follows an in-stream error with `onFinish` (finishReason "error"): at most
    // one info line, and it must not claim the turn went well.
    const infos = turns.filter((entry) => entry.level === "info");
    expect(infos.length).toBeLessThanOrEqual(1);
    for (const info of infos) expect(info.fields).toMatchObject({ errored: true });
  });
});
