import { readFileSync } from "node:fs";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { UIMessage, UIMessageChunk } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  callPart,
  finishPart,
  hasResult,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "@/adapters/fake/scenarios/_shared";
import { createHelperStream, helperUIMessageStream } from "@/adapters/vertex/helper-stream";
import { getSkill } from "@/core/helper/skills";
import type { MediaAsset } from "@/core/media/schema";
import { photoAsset } from "../unit/core/media/builders";
import { PHOTO_A, PHOTO_B } from "../unit/core/profile/operations.helpers";
import { memoryLogger } from "../fakes/logger";

// F42 (build-stall-investigation.md, side findings 1 and 2): what the *browser* receives
// from `createHelperStream` — the UI message stream `POST /api/helper/chat` writes — as
// opposed to what the model receives (helper-protocol.stream.test.ts). Two things are
// rewritten on the way out: a `view_photos` result loses its photo bytes (the browser was
// storing ~300 KB of base64 per request and resending it on every turn, for the server to
// strip again), and an invalid tool input gets an error text that names the failing
// fields instead of the SDK's "An error occurred." — the text the model reads back on the
// next request.

const SMALL_JPEG = new Uint8Array(readFileSync(new URL("../fixtures/small.jpg", import.meta.url)));

function userMessage(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

async function noPhoto(): Promise<null> {
  return null;
}

/** Every chunk of the UI stream, drained. */
async function chunksOf(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

function toolResultsOf(prompt: LanguageModelV3Prompt) {
  return prompt
    .filter((message) => message.role === "tool")
    .flatMap((message) => message.content)
    .filter((part) => part.type === "tool-result");
}

/** Looks at two photos, then says so — one request, two model steps. */
function viewPhotosModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "view-then-text",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "view_photos")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("v1", "view_photos", { ids: [PHOTO_A, PHOTO_B] }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("t", "Lovely."), finishPart(STOP)]),
      };
    },
  });
}

const TWO_PHOTOS: MediaAsset[] = [photoAsset({ id: PHOTO_A }), photoAsset({ id: PHOTO_B })];

describe("F42: the UI stream carries no photo bytes", () => {
  it("a view_photos step's tool-output-available chunk is { shown, refused } with no data, while the model's live call still gets image parts", async () => {
    const model = viewPhotosModel();
    const result = await createHelperStream({
      model,
      system: "system",
      messages: [userMessage("u1", "look at her photos")],
      assets: TWO_PHOTOS,
      readPhoto: async () => ({ bytes: SMALL_JPEG, mediaType: "image/jpeg" }),
      loadSkill: async (name) => getSkill(name),
      logger: memoryLogger(),
      profileId: "abcdefgh",
      surface: "full",
    });
    const chunks = await chunksOf(helperUIMessageStream(result));

    const output = chunks.find((chunk) => chunk.type === "tool-output-available");
    expect(output).toBeDefined();
    expect(output?.type === "tool-output-available" ? output.output : undefined).toEqual({
      shown: [PHOTO_A, PHOTO_B],
      refused: [],
    });
    // Nothing base64-sized anywhere in what the browser receives.
    expect(JSON.stringify(chunks)).not.toMatch(/[A-Za-z0-9+/]{80,}={0,2}/);

    // The second model call — the same request's next step — still saw the images.
    const live = model.doStreamCalls[1];
    if (live === undefined) throw new Error("expected a second model step");
    const viewed = toolResultsOf(live.prompt).find((part) => part.toolName === "view_photos");
    expect(viewed?.output.type).toBe("content");
    const images =
      viewed?.output.type === "content"
        ? viewed.output.value.filter((part) => part.type === "image-data")
        : [];
    expect(images).toHaveLength(2);
  });

  it("a stored { shown, refused } result on a later turn is redacted to 'shown earlier' refusals, with no image part", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "text-only",
      doStream: async () => ({
        stream: scriptedStream([STREAM_START, ...textParts("r", "Noted."), finishPart(STOP)]),
      }),
    });
    const messages: UIMessage[] = [
      userMessage("u1", "look at her photos"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-view_photos",
            toolCallId: "v1",
            state: "output-available",
            input: { ids: [PHOTO_A, PHOTO_B] },
            output: { shown: [PHOTO_A], refused: [{ id: PHOTO_B, error: "not a photo" }] },
          },
        ],
      },
      userMessage("u2", "and now?"),
    ];
    const result = await createHelperStream({
      model,
      system: "system",
      messages,
      assets: TWO_PHOTOS,
      readPhoto: noPhoto,
      loadSkill: async (name) => getSkill(name),
      logger: memoryLogger(),
      profileId: "abcdefgh",
      surface: "full",
    });
    await result.text;
    const call = model.doStreamCalls[0];
    if (call === undefined) throw new Error("expected the model to have been called");
    const viewed = toolResultsOf(call.prompt).find((part) => part.toolName === "view_photos");
    expect(viewed?.output.type).toBe("content");
    const parts = viewed?.output.type === "content" ? viewed.output.value : [];
    expect(parts.some((part) => part.type === "image-data")).toBe(false);
    expect(parts.map((part) => (part.type === "text" ? part.text : ""))).toEqual([
      expect.stringMatching(new RegExp(`^${PHOTO_A}: .*[Ss]hown earlier`)),
    ]);
  });
});

describe("F42: an invalid tool input tells the model which fields were wrong", () => {
  const BAD_ADD = { op: "add_block", block: { type: "gallery" } };
  /** Sends the bad add_block, then a non-tool the model invented, then stops. */
  function badInputModel(): MockLanguageModelV3 {
    return new MockLanguageModelV3({
      provider: "fake",
      modelId: "bad-input",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "add_block")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              callPart("bad-1", "add_block", BAD_ADD),
              callPart("bad-2", "publish_profile", {}),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return {
          stream: scriptedStream([STREAM_START, ...textParts("t", "Sorry."), finishPart(STOP)]),
        };
      },
    });
  }

  async function badInputChunks() {
    const logger = memoryLogger();
    const result = await createHelperStream({
      model: badInputModel(),
      system: "system",
      messages: [userMessage("u1", "add a gallery")],
      assets: [],
      readPhoto: noPhoto,
      loadSkill: async (name) => getSkill(name),
      logger,
      profileId: "abcdefgh",
      surface: "full",
    });
    return { chunks: await chunksOf(helperUIMessageStream(result)), logger };
  }

  it("the tool-input-error and tool-output-error chunks name the tool and the Zod paths, never the SDK's own message", async () => {
    const { chunks } = await badInputChunks();
    const texts = chunks
      .filter(
        (chunk) =>
          (chunk.type === "tool-input-error" || chunk.type === "tool-output-error") &&
          chunk.toolCallId === "bad-1",
      )
      .map((chunk) => ("errorText" in chunk ? chunk.errorText : ""));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).toContain("add_block");
      expect(text).toContain("block.mediaIds");
      expect(text).not.toContain("Type validation failed");
      expect(text).not.toContain("Value:");
      expect(text).not.toBe("An error occurred.");
    }
    // Both chunks carry the same text: what the browser persists is what the model reads back.
    expect(new Set(texts).size).toBe(1);
  });

  it("a tool name that does not exist is named as such, with the tools that do", async () => {
    const { chunks } = await badInputChunks();
    const text = chunks
      .filter((chunk) => chunk.type === "tool-output-error" && chunk.toolCallId === "bad-2")
      .map((chunk) => ("errorText" in chunk ? chunk.errorText : ""))[0];
    expect(text).toContain("publish_profile");
    expect(text).toMatch(/no such tool|is not a tool/i);
    expect(text).toContain("add_block");
  });

  it("the server logs the tool name and the paths at info — no values", async () => {
    const { logger } = await badInputChunks();
    const lines = logger.entries.filter((entry) => entry.msg === "helper invalid tool input");
    expect(lines.map((entry) => entry.level)).toEqual(["info", "info"]);
    expect(lines[0]?.fields).toEqual({ toolName: "add_block", paths: ["block.mediaIds"] });
    expect(lines[1]?.fields).toEqual({ toolName: "publish_profile", paths: [] });
    expect(JSON.stringify(lines)).not.toContain("gallery");
  });
});
