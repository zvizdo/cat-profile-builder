import { readFileSync } from "node:fs";
import type { LanguageModelV3, LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { UIMessage } from "ai";
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
import { BIO_ID } from "../unit/core/profile/builders";
import { photoAsset } from "../unit/core/media/builders";
import { PHOTO_A } from "../unit/core/profile/operations.helpers";
import {
  browserChat,
  geminiCallParts,
  historyDeps,
  partsOf,
  sendAndSettle,
  type BrowserChat,
} from "./helper-history.helpers";

// F35 (found on Cloud Run 2026-09-13): after one long real-model turn, every later
// `POST /api/helper/chat` was `400` — the client's own persisted history no longer passed
// `chat.ts`'s closed schema. Every case below builds its history the way the browser does
// (`helper-history.helpers.ts`: the AI SDK's `Chat` over the real route handler) from a
// scripted `MockLanguageModelV3`, then sends one more message and asserts the route
// answers 200 — one case per hypothesis the F35 brief names, plus the security surface
// that must stay closed. Nothing here is hand-typed history.

const THOUGHT = { google: { thoughtSignature: "opaque-signature-bytes" } };

const SMALL_JPEG = new Uint8Array(readFileSync(new URL("../fixtures/small.jpg", import.meta.url)));

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** The four browser-answered reads, answered at once; the six edits, applied — never a card. */
function answerEverything(
  chat: BrowserChat["chat"],
  call: { toolCallId: string; toolName: string },
) {
  const reads = new Set(["read_outline", "read_page", "read_blocks", "list_media"]);
  if (reads.has(call.toolName)) {
    void chat.addToolOutput({
      tool: call.toolName,
      toolCallId: call.toolCallId,
      output: "1. blockaaaaaaa hero — Charlotte",
    });
  } else {
    void chat.addToolOutput({
      tool: call.toolName,
      toolCallId: call.toolCallId,
      output: { status: "applied", summary: "Done." },
    });
  }
}

/** Every tool result the model was handed, across every call it received. */
function modelToolResults(model: MockLanguageModelV3) {
  return model.doStreamCalls.flatMap((call) =>
    (call.prompt as LanguageModelV3Prompt)
      .filter((message) => message.role === "tool")
      .flatMap((message) => message.content)
      .filter((part) => part.type === "tool-result"),
  );
}

describe("F35: the helper chat never 400s on its own history", () => {
  // Hypothesis 1 — a card the volunteer never answered: the tool part stays
  // `input-available` and the next message carries it.
  it("an unanswered card (a tool part left `input-available`) is 200 on the next message, and the model sees it as declined", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "unanswered-card",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "remove_block")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              callPart("card-1", "remove_block", { op: "remove_block", blockId: BIO_ID }),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return { stream: textStep("after", "Left as it was.") };
      },
    });
    // The browser leaves the call unanswered — exactly what a pending card is.
    const browser = browserChat({ model, onToolCall: () => undefined });
    await sendAndSettle(browser, "Tidy the page");
    expect(browser.requests.map((r) => r.status)).toEqual([200]);
    const pending = partsOf(browser.chat.messages).find((p) => p.type === "tool-remove_block");
    expect(pending).toMatchObject({ state: "input-available" });

    await sendAndSettle(browser, "Actually, make the bio longer instead");
    expect(browser.requests.map((r) => r.status)).toEqual([200, 200]);
    // The unanswered-card rule (contracts/helper-protocol.md): the model is told `declined`.
    const declined = modelToolResults(model).find((r) => r.toolName === "remove_block");
    expect(declined?.output).toEqual({ type: "json", value: { status: "declined" } });
  });

  // Hypothesis 2 — a tool call the AI SDK itself refused (input off the tool's schema).
  // `streamText` answers the refusal inside the same request (the model gets the error and
  // goes on to its next step), so the client persists a `tool-add_block` part in
  // `output-error` with `rawInput` and `errorText` and no `input` — the same static part
  // whether the provider streamed `tool-input-start` first (Gemini, `geminiCallParts`) or
  // sent only `tool-call` (every scripted fake). It is the *next* message that 400s.
  it.each([
    ["Gemini-shaped", true],
    ["tool-call only", false],
  ])(
    "an invalid tool input (%s: a `tool-add_block` part in `output-error` with `rawInput`) is 200 on the next message",
    async (_label, gemini) => {
      const bad = { op: "add_block", block: { type: "nonsense" } };
      const model = new MockLanguageModelV3({
        provider: "fake",
        modelId: "invalid-input",
        doStream: async ({ prompt }) => {
          if (!hasResult(prompt, "add_block")) {
            const call = gemini
              ? geminiCallParts("bad-1", "add_block", bad)
              : [callPart("bad-1", "add_block", bad)];
            return { stream: scriptedStream([STREAM_START, ...call, finishPart(TOOL_CALLS)]) };
          }
          return { stream: textStep("sorry", "Sorry — let me try that again.") };
        },
      });
      const browser = browserChat({ model, onToolCall: answerEverything });
      await sendAndSettle(browser, "Add a needs section");
      const part = partsOf(browser.chat.messages).find((p) => p.type === "tool-add_block");
      expect(part).toMatchObject({ state: "output-error", errorText: expect.any(String) });
      expect(part).toMatchObject({ rawInput: bad });
      expect(browser.requests.map((r) => r.status)).toEqual([200]);

      await sendAndSettle(browser, "Try again please");
      expect(browser.requests.map((r) => r.status)).toEqual([200, 200]);
      expect(browser.chat.status).toBe("ready");
    },
  );

  it("a tool name the model invented (`tool-publish_profile` in `output-error`) is 200 on the next message, and the model is told it failed", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "invented-tool",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "publish_profile")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              ...geminiCallParts("pub-1", "publish_profile", {}),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return { stream: textStep("cannot", "I can't publish — that's yours to do.") };
      },
    });
    const browser = browserChat({ model, onToolCall: answerEverything });
    await sendAndSettle(browser, "publish it");
    const part = partsOf(browser.chat.messages).find((p) => p.type === "tool-publish_profile");
    expect(part).toMatchObject({ state: "output-error" });
    expect(browser.requests.map((r) => r.status)).toEqual([200]);

    await sendAndSettle(browser, "ok, then what?");
    expect(browser.requests.map((r) => [r.status, r.error?.message])).toEqual([
      [200, undefined],
      [200, undefined],
    ]);
    const told = modelToolResults(model).filter((r) => r.toolName === "publish_profile");
    expect(told.length).toBeGreaterThan(0);
    for (const result of told) expect(result.output.type).toBe("error-text");
  });

  // F42 (side finding 1): the browser no longer receives or resends a viewed photo's
  // bytes — the persisted `tool-view_photos` part holds `{ shown, refused }`, the route
  // accepts it, and the model is told the photo was shown earlier.
  it("a viewed photo persists as { shown, refused } with no bytes, is 200 on the next message, and the model is told it was shown earlier", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "view-photos-small",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "view_photos")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              callPart("view-3", "view_photos", { ids: [PHOTO_A] }),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return { stream: textStep("seen", "A lovely cat.") };
      },
    });
    const deps = historyDeps(model);
    const pid = "abcdefgh";
    const rev = await deps.mediaStore.writeDerived(pid, PHOTO_A, "clean", SMALL_JPEG);
    await deps.mediaStore.writeAsset(
      pid,
      PHOTO_A,
      photoAsset({ id: PHOTO_A, revisions: { clean: rev } }),
    );
    const browser = browserChat({ model, onToolCall: answerEverything, deps });
    await sendAndSettle(browser, "look at her photo");
    expect(browser.requests.map((r) => r.status)).toEqual([200]);
    const part = partsOf(browser.chat.messages).find((p) => p.type === "tool-view_photos");
    expect(part).toMatchObject({
      state: "output-available",
      output: { shown: [PHOTO_A], refused: [] },
    });
    expect(JSON.stringify(browser.chat.messages)).not.toMatch(/[A-Za-z0-9+/]{80,}={0,2}/);

    await sendAndSettle(browser, "and the other one?");
    expect(browser.requests.map((r) => r.status)).toEqual([200, 200]);
    const shown = modelToolResults(model).filter((r) => r.toolName === "view_photos");
    const last = shown[shown.length - 1];
    expect(last?.output.type).toBe("content");
    const value = last?.output.type === "content" ? last.output.value : [];
    expect(value.some((v) => v.type === "image-data")).toBe(false);
    expect(JSON.stringify(value)).toMatch(/[Ss]hown earlier/);
  });

  // Hypothesis 2, server side — `view_photos`'s own `execute` throwing (here: bytes sharp
  // cannot decode) leaves a `tool-view_photos` part in `output-error` with no `output`.
  it("a server-executed tool that errored (`tool-view_photos` in `output-error`, no output) is 200 on the next message", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "view-photos-throws",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "view_photos")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              callPart("view-2", "view_photos", { ids: [PHOTO_A] }),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return { stream: textStep("looked", "I couldn't see that one.") };
      },
    });
    // A garbage "clean" derivative: `readPhoto` finds it, sharp then throws inside `execute`.
    const deps = historyDeps(model);
    const pid = "abcdefgh";
    const rev = await deps.mediaStore.writeDerived(
      pid,
      PHOTO_A,
      "clean",
      new Uint8Array([1, 2, 3]),
    );
    await deps.mediaStore.writeAsset(
      pid,
      PHOTO_A,
      photoAsset({ id: PHOTO_A, revisions: { clean: rev } }),
    );
    const browser = browserChat({ model, onToolCall: answerEverything, deps });
    await sendAndSettle(browser, "look at her photo");
    const part = partsOf(browser.chat.messages).find((p) => p.type === "tool-view_photos");
    expect(part).toMatchObject({ state: "output-error", errorText: expect.any(String) });
    expect(part && "output" in part ? part.output : undefined).toBeUndefined();
    expect(browser.requests.map((r) => r.status)).toEqual([200]);

    await sendAndSettle(browser, "and now?");
    expect(browser.requests.map((r) => r.status)).toEqual([200, 200]);
  });

  // Hypothesis 3 — reasoning, provider metadata, and a multi-step loop with a
  // browser-answered read and an applied edit, all in one message.
  it("reasoning + a multi-step loop (read, then edit, then text, each with provider metadata) is 200 on the next message", async () => {
    const model = new MockLanguageModelV3({
      provider: "fake",
      modelId: "multi-step",
      doStream: async ({ prompt }) => {
        if (!hasResult(prompt, "read_outline")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              { type: "reasoning-start", id: "r1", providerMetadata: THOUGHT },
              { type: "reasoning-delta", id: "r1", delta: "Let me look first." },
              { type: "reasoning-end", id: "r1", providerMetadata: THOUGHT },
              ...geminiCallParts("outline-1", "read_outline", {}),
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        if (!hasResult(prompt, "set_theme")) {
          return {
            stream: scriptedStream([
              STREAM_START,
              {
                type: "tool-call",
                toolCallId: "theme-1",
                toolName: "set_theme",
                input: JSON.stringify({ op: "set_theme", warmth: 0.6 }),
                providerMetadata: THOUGHT,
              },
              finishPart(TOOL_CALLS),
            ]),
          };
        }
        return {
          stream: scriptedStream([
            STREAM_START,
            { type: "text-start", id: "t1", providerMetadata: THOUGHT },
            { type: "text-delta", id: "t1", delta: "Warmed it up.", providerMetadata: THOUGHT },
            { type: "text-end", id: "t1" },
            finishPart(STOP),
          ]),
        };
      },
    });
    const browser = browserChat({ model, onToolCall: answerEverything });
    await sendAndSettle(browser, "warm it up");
    expect(browser.requests.map((r) => r.status)).toEqual([200, 200, 200]);
    const types = partsOf(browser.chat.messages).map((p) => p.type);
    expect(types).toContain("reasoning");
    expect(types).toContain("step-start");
    expect(types).toContain("tool-read_outline");
    expect(types).toContain("tool-set_theme");

    await sendAndSettle(browser, "and the contrast?");
    expect(browser.requests.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(browser.requests[3]?.messages).toHaveLength(3);
  });

  it("a 400 logs the Zod issue paths at warn — and never a message's text", async () => {
    const model: LanguageModelV3 = new MockLanguageModelV3({
      provider: "fake",
      modelId: "never-called",
      doStream: async () => ({ stream: textStep("x", "unused") }),
    });
    const browser = browserChat({ model, onToolCall: answerEverything });
    const secret = "SECRET-VOLUNTEER-TEXT";
    const smuggled: UIMessage = {
      id: "s1",
      role: "system",
      parts: [{ type: "text", text: secret }],
    };
    browser.chat.messages = [smuggled];
    await sendAndSettle(browser, "hi");
    expect(browser.requests.map((r) => r.status)).toEqual([400]);
    const warn = browser.logger.entries.find(
      (e) => e.level === "warn" && e.msg === "invalid request",
    );
    expect(warn).toBeDefined();
    expect(warn?.fields.paths).toEqual(
      expect.arrayContaining([expect.stringMatching(/^messages\.0/)]),
    );
    expect(JSON.stringify(browser.logger.entries)).not.toContain(secret);
    // The 400 body itself stays small and never carries the offending text either.
    expect(browser.requests[0]?.error?.message).not.toContain(secret);
    expect(JSON.stringify(browser.requests[0]?.error).length).toBeLessThan(2_000);
  });
});
