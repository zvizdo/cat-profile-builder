import type { LanguageModelV3, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { DESCRIBE_PROMPT, createVertexDescriber } from "@/adapters/vertex/describer";
import { RefusedError } from "@/core/errors";
import { memoryLogger } from "../../../fakes/logger";

// The Vertex Describer over a `MockLanguageModelV3` (ADR-001): what it sends, how it reads
// the answer, and that a provider failure becomes `{ failed }` with the provider's words in
// the log and never in the result (constitution, Principles II and VI).

const WEB_URI = "gs://public-bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4";
const PROVIDER_MESSAGE = "Vertex says: quota exceeded for project shelter-123";

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function answer(
  text: string,
  finish: LanguageModelV3GenerateResult["finishReason"]["unified"] = "stop",
): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: finish, raw: undefined },
    usage: USAGE,
    warnings: [],
  };
}

/** A mock that, like the Vertex model, accepts `gs://` URLs so the SDK passes them through. */
function mockModel(doGenerate: LanguageModelV3["doGenerate"] | LanguageModelV3GenerateResult) {
  return new MockLanguageModelV3({
    provider: "fake-vertex",
    modelId: "described-by-env",
    supportedUrls: { "*": [/^gs:\/\/.*$/] },
    doGenerate,
  });
}

function build(doGenerate: LanguageModelV3["doGenerate"] | LanguageModelV3GenerateResult) {
  const model = mockModel(doGenerate);
  const logger = memoryLogger();
  return { model, logger, describer: createVertexDescriber({ model, logger }) };
}

/** The user message of the one call the describer made. */
function sentContent(model: MockLanguageModelV3) {
  expect(model.doGenerateCalls).toHaveLength(1);
  const [call] = model.doGenerateCalls;
  const [message] = call?.prompt ?? [];
  expect(message?.role).toBe("user");
  return message?.role === "user" ? message.content : [];
}

describe("DESCRIBE_PROMPT", () => {
  it("asks for alternative text for a screen reader, not a caption", () => {
    expect(DESCRIBE_PROMPT).toMatch(/alternative text/i);
    expect(DESCRIBE_PROMPT).toMatch(/screen reader/i);
    expect(DESCRIBE_PROMPT).toMatch(/one or two/i);
    expect(DESCRIBE_PROMPT).not.toMatch(/caption/i);
  });

  // F54: the same describer wrote "gray and white" for a cat's photos and "a tabby" for
  // every one of its clip descriptions (same prompt, same model). "Tabby" alone is a
  // pattern label, not a colour — the prompt now asks for the actual colours seen, not a
  // pattern word on its own, and to leave the coat out rather than guess when unclear.
  it("asks for the coat's actual colours, not a pattern word alone, or to leave it out", () => {
    expect(DESCRIBE_PROMPT).toMatch(/actual colours/i);
    expect(DESCRIBE_PROMPT).toMatch(/not\s+only a pattern word/i);
    expect(DESCRIBE_PROMPT).toMatch(/leave the coat out rather than guess/i);
  });
});

describe("createVertexDescriber → describePhoto", () => {
  it("sends the fixed prompt and the bytes as one JPEG part, bounded and cool", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const { model, describer } = build(
      answer("  A grey tabby cat curled up on a striped blanket.  "),
    );

    expect(await describer.describePhoto(bytes)).toEqual({
      text: "A grey tabby cat curled up on a striped blanket.",
    });

    const content = sentContent(model);
    expect(content).toEqual([
      { type: "text", text: DESCRIBE_PROMPT },
      {
        type: "file",
        mediaType: "image/jpeg",
        data: bytes,
        filename: undefined,
        providerOptions: undefined,
      },
    ]);
    const [call] = model.doGenerateCalls;
    expect(call?.maxOutputTokens).toBe(120);
    expect(call?.temperature).toBe(0.2);
  });

  it("keeps the given media type when the bytes are not a recognisable image", async () => {
    const { model, describer } = build(answer("A cat."));
    await describer.describePhoto(new Uint8Array([1]));
    expect(sentContent(model)[1]).toMatchObject({ type: "file", mediaType: "image/jpeg" });
  });

  it("maps a thrown provider error to { failed: 'model' }, logging the message but never returning it", async () => {
    const { logger, describer } = build(async () => {
      throw new Error(PROVIDER_MESSAGE);
    });

    const result = await describer.describePhoto(new Uint8Array([1]));
    expect(result).toEqual({ failed: "model" });
    expect(JSON.stringify(result)).not.toContain("quota");

    const warned = logger.entries.filter((entry) => entry.level === "warn");
    expect(warned).toHaveLength(1);
    expect(warned[0]?.msg).toBe("describer failed");
    expect((warned[0]?.fields.err as Error).message).toBe(PROVIDER_MESSAGE);
  });

  it("fails on an empty answer", async () => {
    const { logger, describer } = build(answer("   "));
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ failed: "model" });
    expect(logger.entries.some((entry) => entry.level === "warn")).toBe(true);
  });

  it("fails on an answer over 300 characters", async () => {
    const { describer } = build(answer("A cat. ".repeat(60)));
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ failed: "model" });
  });

  it("fails on a truncated answer instead of passing off a cut sentence as complete", async () => {
    const { logger, describer } = build(answer("A tabby cat sitting on a", "length"));
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ failed: "model" });
    expect(logger.entries.find((entry) => entry.level === "warn")?.fields).toMatchObject({
      finishReason: "length",
    });
  });

  it("fails when the provider's content filter stopped the answer", async () => {
    const { describer } = build(answer("", "content-filter"));
    expect(await describer.describePhoto(new Uint8Array([1]))).toEqual({ failed: "model" });
  });

  it("logs the model id and the text at debug, never the bytes", async () => {
    const { logger, describer } = build(answer("A cat."));
    await describer.describePhoto(new Uint8Array([9, 9, 9]));
    const debug = logger.entries.filter((entry) => entry.level === "debug");
    expect(debug).toHaveLength(1);
    expect(debug[0]?.fields).toMatchObject({ modelId: "described-by-env", text: "A cat." });
    expect(JSON.stringify(debug[0]?.fields)).not.toContain("9,9,9");
  });
});

describe("createVertexDescriber → describeVideo", () => {
  it("sends the fixed prompt and the gs:// clip as one video/mp4 file part", async () => {
    const { model, describer } = build(answer("A black cat walks across a wooden floor."));

    expect(await describer.describeVideo(WEB_URI)).toEqual({
      text: "A black cat walks across a wooden floor.",
    });

    const content = sentContent(model);
    expect(content[0]).toEqual({ type: "text", text: DESCRIBE_PROMPT });
    expect(content[1]).toMatchObject({ type: "file", mediaType: "video/mp4" });
    const data = content[1]?.type === "file" ? content[1].data : undefined;
    expect(data).toBeInstanceOf(URL);
    expect(String(data)).toBe(WEB_URI);
  });

  it.each([
    "gs://private-bucket/profiles/abcdefgh/media/mmmmmmm2/original",
    "gs://public-bucket/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mov",
    "gs://public-bucket/profiles/abcdefgh/other/mmmmmmm2/web.0123456789.mp4",
    "https://cdn.test/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4",
  ])("refuses anything but the finished web clip before touching the model: %s", async (uri) => {
    const { model, describer } = build(answer("never"));
    await expect(describer.describeVideo(uri)).rejects.toBeInstanceOf(RefusedError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("answers { failed } for a web clip that is not in Cloud Storage (STORE=fs), without a call", async () => {
    const { model, logger, describer } = build(answer("never"));
    const local = "file:///srv/data/public/profiles/abcdefgh/media/mmmmmmm2/web.0123456789.mp4";
    expect(await describer.describeVideo(local)).toEqual({ failed: "not-in-cloud-storage" });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(logger.entries.find((entry) => entry.level === "warn")?.msg).toBe("describer failed");
  });

  it("maps a thrown provider error to { failed: 'model' } for clips too", async () => {
    const { describer } = build(async () => {
      throw new Error(PROVIDER_MESSAGE);
    });
    expect(await describer.describeVideo(WEB_URI)).toEqual({ failed: "model" });
  });
});
