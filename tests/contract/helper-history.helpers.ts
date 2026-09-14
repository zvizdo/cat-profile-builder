import { NextRequest } from "next/server";
import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { SESSION_COOKIE } from "@/adapters/auth/session";
import { loadConfig } from "@/adapters/config";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { chat as chatRoute, type ChatDeps } from "@/app/api/_lib/chat";
import { memoryLogger, type MemoryLogger } from "../fakes/logger";
import { createMemoryMediaStore } from "../fakes/media-store";
import { ENV } from "./boundary.helpers";

// A browser-faithful client for `POST /api/helper/chat` (F35): the AI SDK's own `Chat`
// class — the exact object `useChat` wraps — over the real `DefaultChatTransport`, whose
// `fetch` is the real route handler (`chat()` with a `NextRequest`), with the same
// `prepareSendMessagesRequest` and `sendAutomaticallyWhen` `use-helper.ts` passes. Every
// message in `chat.messages` is therefore what a real browser persists and resends on the
// next turn: built by `processUIMessageStream` from a `streamText().toUIMessageStream()`
// over a scripted `MockLanguageModelV3`, never typed by hand. The two earlier rounds of
// this bug class (`chat.ts`'s comments on `providerMetadata`, `state: "done"` and
// `step-start`) were each missed because the fixtures were hand-built; this harness is
// the answer to that.

/** One request the client made, as the route answered it. */
export interface RecordedRequest {
  status: number;
  /** The parsed error body when the route refused the request; `undefined` on 200. */
  error: { code: string; message: string } | undefined;
  /** The `messages` the client sent, exactly as posted. */
  messages: UIMessage[];
}

export interface BrowserChat {
  chat: Chat<UIMessage>;
  requests: RecordedRequest[];
  logger: MemoryLogger;
  deps: HistoryDeps;
  /** Resolves once the client is idle: no request in flight and no auto-send pending. */
  settle: () => Promise<void>;
}

export interface BrowserChatOptions {
  model: LanguageModelV3;
  /** What the browser does with each tool call — `use-helper.ts`'s `onToolCall`, in
   * miniature. Gets the `Chat` so it can `addToolOutput`; leaving a call unanswered is
   * exactly what a pending card does. */
  onToolCall: (
    chat: Chat<UIMessage>,
    call: { toolCallId: string; toolName: string; input: unknown },
  ) => void;
  profileId?: string;
  /** The route's dependencies; `historyDeps(model)` unless a test needs to seed a store. */
  deps?: HistoryDeps;
}

const PROFILE_ID = "abcdefgh";

const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };

/** `ChatDeps` whose logger is the memory one, so a test can read what was logged. */
export type HistoryDeps = ChatDeps & { logger: MemoryLogger };

/** `ChatDeps` over memory stores, a signed-in session and a memory logger. */
export function historyDeps(model: LanguageModelV3): HistoryDeps {
  const buckets = createMemoryBuckets();
  return {
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    logger: memoryLogger(),
    readSession: async (cookies) => (cookies.get(SESSION_COOKIE) === undefined ? null : SESSION),
    languageModel: model,
    config: loadConfig(ENV),
  };
}

function tick(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A `Chat` whose transport is the real route handler; see the file comment. */
export function browserChat(options: BrowserChatOptions): BrowserChat {
  const { model, onToolCall, profileId = PROFILE_ID, deps = historyDeps(model) } = options;
  const requests: RecordedRequest[] = [];
  let inFlight = 0;

  const fetchRoute: typeof fetch = async (input, init) => {
    inFlight += 1;
    try {
      const url = new URL(String(input), "http://localhost:3000");
      const headers = new Headers(init?.headers);
      headers.set("cookie", `${SESSION_COOKIE}=t`);
      const body = typeof init?.body === "string" ? init.body : "";
      const request = new NextRequest(url, { method: "POST", headers, body });
      const response = await chatRoute(deps, request);
      const posted = JSON.parse(body) as { messages: UIMessage[] };
      const error = response.ok
        ? undefined
        : ((await response.clone().json()) as { error: RecordedRequest["error"] }).error;
      requests.push({ status: response.status, error, messages: posted.messages });
      return response;
    } finally {
      inFlight -= 1;
    }
  };

  const transport = new DefaultChatTransport<UIMessage>({
    api: "/api/helper/chat",
    fetch: fetchRoute,
    prepareSendMessagesRequest: ({ messages }) => ({
      body: { profileId, surface: "full", messages },
    }),
  });

  const chat: Chat<UIMessage> = new Chat<UIMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      onToolCall(chat, {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: toolCall.input,
      });
    },
  });

  // Idle means: the chat is neither submitted nor streaming, nothing is in flight, and
  // that stays true across two consecutive checks (an auto-send fires from a promise
  // callback after `addToolOutput`, so one quiet check alone can still be too early).
  const settle = async () => {
    let quiet = 0;
    for (let i = 0; i < 2000 && quiet < 3; i += 1) {
      await tick();
      const idle = (chat.status === "ready" || chat.status === "error") && inFlight === 0;
      quiet = idle ? quiet + 1 : 0;
    }
    if (quiet < 3) throw new Error(`the chat never settled (status ${chat.status})`);
  };

  return { chat, requests, logger: deps.logger, deps, settle };
}

/** Sends `text` as the volunteer and waits for the whole turn to settle. */
export async function sendAndSettle(browser: BrowserChat, text: string): Promise<void> {
  void browser.chat.sendMessage({ text }).catch(() => undefined);
  await browser.settle();
}

/**
 * The provider stream parts Gemini emits for one function call (`@ai-sdk/google`'s
 * `doStream`): `tool-input-start`, one `tool-input-delta` with the whole JSON, then
 * `tool-input-end` and the `tool-call` itself. `callPart` alone (`_shared.ts`) is the
 * shape every scripted scenario uses; the two make the client persist *different* parts
 * for an invalid call — a static `tool-<name>` part after `tool-input-start`, a
 * `dynamic-tool` part without it — so a test that cares must script this one.
 */
export function geminiCallParts(
  toolCallId: string,
  toolName: string,
  input: unknown,
): LanguageModelV3StreamPart[] {
  const json = JSON.stringify(input);
  return [
    { type: "tool-input-start", id: toolCallId, toolName },
    { type: "tool-input-delta", id: toolCallId, delta: json },
    { type: "tool-input-end", id: toolCallId },
    { type: "tool-call", toolCallId, toolName, input: json },
  ];
}

/** Every part of every message, flattened, for asserting on what the client persisted. */
export function partsOf(messages: readonly UIMessage[]): UIMessage["parts"] {
  return messages.flatMap((message) => message.parts);
}
