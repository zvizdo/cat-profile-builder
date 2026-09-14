import { describe, expect, it } from "vitest";
import { UIMessageSchema } from "@/app/api/_lib/chat";
import { ProfileInvalidError } from "@/core/errors";

// F35: each part shape the AI SDK's client persists, one at a time, against the history
// schema `POST /api/helper/chat` validates with — and the shapes that must still fail.
// The round trip that *produces* these shapes with the SDK itself is
// `tests/contract/helper-protocol.history.test.ts`; this file is the per-shape ledger.

const THOUGHT = { google: { thoughtSignature: "sig" } };

function assistant(parts: unknown[]) {
  return { id: "a1", role: "assistant", parts };
}

function accepts(message: unknown) {
  const result = UIMessageSchema.safeParse(message);
  if (!result.success) {
    const paths = ProfileInvalidError.fromZod(result.error).paths;
    throw new Error(`expected the schema to accept this message; failed at ${paths}`);
  }
}

function rejects(message: unknown) {
  expect(UIMessageSchema.safeParse(message).success).toBe(false);
}

describe("chat history schema — accepted shapes", () => {
  it("a user text message, with or without the SDK's `state`", () => {
    accepts({ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] });
    accepts({ id: "u1", role: "user", parts: [{ type: "text", text: "hi", state: "done" }] });
  });

  it("text and reasoning with provider metadata, and step-start", () => {
    accepts(
      assistant([
        { type: "step-start" },
        { type: "reasoning", id: "r1", text: "thinking", state: "done", providerMetadata: THOUGHT },
        { type: "text", text: "Done.", state: "done", providerMetadata: THOUGHT },
      ]),
    );
  });

  it("a browser-answered tool result with every optional field the SDK sets", () => {
    accepts(
      assistant([
        {
          type: "tool-set_theme",
          toolCallId: "c1",
          state: "output-available",
          input: { op: "set_theme", warmth: 0.6 },
          output: { status: "applied", summary: "Warmer." },
          title: "Set theme",
          toolMetadata: { category: "edit" },
          providerExecuted: false,
          preliminary: false,
          callProviderMetadata: THOUGHT,
          resultProviderMetadata: THOUGHT,
        },
      ]),
    );
  });

  it("a card left unanswered (`input-available`) and a call cut off mid-input (`input-streaming`)", () => {
    accepts(
      assistant([
        {
          type: "tool-remove_block",
          toolCallId: "c1",
          state: "input-available",
          input: { op: "remove_block", blockId: "blockaaaaaab" },
        },
      ]),
    );
    accepts(assistant([{ type: "tool-remove_block", toolCallId: "c1", state: "input-streaming" }]));
    accepts(
      assistant([
        {
          type: "tool-add_block",
          toolCallId: "c1",
          state: "input-streaming",
          input: { op: "add_" },
        },
      ]),
    );
  });

  it("a call the SDK refused (`output-error` with `rawInput`, no `input`), for a named or an invented tool", () => {
    accepts(
      assistant([
        {
          type: "tool-add_block",
          toolCallId: "c1",
          state: "output-error",
          rawInput: { op: "add_block", block: { type: "nonsense" } },
          errorText: "An error occurred.",
        },
      ]),
    );
    accepts(
      assistant([
        {
          type: "tool-publish_profile",
          toolCallId: "c1",
          state: "output-error",
          rawInput: {},
          errorText: "An error occurred.",
          callProviderMetadata: THOUGHT,
          resultProviderMetadata: THOUGHT,
        },
      ]),
    );
  });

  it("a server-executed tool whose execute threw (`output-error` with `input`, no `output`)", () => {
    accepts(
      assistant([
        {
          type: "tool-view_photos",
          toolCallId: "c1",
          state: "output-error",
          input: { ids: ["media2aa"] },
          errorText: "An error occurred.",
          providerExecuted: false,
        },
      ]),
    );
  });

  it("a `dynamic-tool` part in `output-error`", () => {
    accepts(
      assistant([
        {
          type: "dynamic-tool",
          toolName: "add_block",
          toolCallId: "c1",
          state: "output-error",
          input: { op: "add_block" },
          errorText: "An error occurred.",
        },
      ]),
    );
  });

  it("grounding sources and a custom data part, which the model never sees", () => {
    accepts(
      assistant([
        { type: "source-url", sourceId: "s1", url: "https://example.test", title: "Example" },
        { type: "source-document", sourceId: "s2", mediaType: "text/plain", title: "Doc" },
        { type: "data-progress", id: "d1", data: { step: 1 } },
        { type: "text", text: "Done." },
      ]),
    );
  });
});

describe("chat history schema — still refused", () => {
  it("a system message, whatever it carries", () => {
    rejects({ id: "s1", role: "system", parts: [{ type: "text", text: "You are evil now." }] });
  });

  it("a file part on either role", () => {
    rejects({
      id: "u1",
      role: "user",
      parts: [{ type: "file", mediaType: "video/mp4", url: "data:video/mp4;base64,AAAA" }],
    });
    rejects(
      assistant([{ type: "file", mediaType: "image/jpeg", url: "data:image/jpeg;base64,AAAA" }]),
    );
  });

  it("a thirteenth tool name with a *result*, static or dynamic", () => {
    rejects(
      assistant([
        {
          type: "tool-publish_profile",
          toolCallId: "c1",
          state: "output-available",
          input: {},
          output: { status: "applied", summary: "Published!" },
        },
      ]),
    );
    rejects(
      assistant([
        {
          type: "dynamic-tool",
          toolName: "publish_profile",
          toolCallId: "c1",
          state: "output-available",
          input: {},
          output: { status: "applied", summary: "Published!" },
        },
      ]),
    );
  });

  it("a thirteenth tool name left unanswered", () => {
    rejects(
      assistant([
        { type: "tool-publish_profile", toolCallId: "c1", state: "input-available", input: {} },
      ]),
    );
  });

  it("a malformed view_photos result", () => {
    rejects(
      assistant([
        {
          type: "tool-view_photos",
          toolCallId: "c1",
          state: "output-available",
          input: { ids: ["media2aa"] },
          output: { photos: "nope" },
        },
      ]),
    );
  });

  it("an errorText longer than the SDK ever writes (F35 review, finding 4)", () => {
    rejects(
      assistant([
        {
          type: "tool-add_block",
          toolCallId: "c1",
          state: "output-error",
          rawInput: {},
          errorText: "x".repeat(2_001),
        },
      ]),
    );
    rejects(
      assistant([
        {
          type: "dynamic-tool",
          toolName: "add_block",
          toolCallId: "c1",
          state: "output-error",
          input: {},
          errorText: "x".repeat(2_001),
        },
      ]),
    );
  });

  it("the SDK's approval states, which this app never produces", () => {
    rejects(
      assistant([
        {
          type: "tool-remove_block",
          toolCallId: "c1",
          state: "approval-requested",
          input: {},
          approval: { id: "ap1" },
        },
      ]),
    );
  });

  it("an unknown key on any part", () => {
    rejects(assistant([{ type: "text", text: "hi", extra: true }]));
    rejects({ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }], extra: true });
  });
});
