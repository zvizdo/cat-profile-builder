import type {
  LanguageModelV3FinishReason,
  LanguageModelV3Message,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";

// What every scripted scenario in this directory shares: the finish reasons and usage
// stub `noop.ts` already inlines, plus reading the prompt a `doStream` call receives to
// decide which scripted step comes next (T035 controller ruling 4). A scenario is a pure
// function of `options.prompt` — never a closure counter — so it behaves the same whether
// the AI SDK loops it automatically (a server-executed tool, within one request) or a
// fresh HTTP request carries the next step (a browser-answered tool, resolved and sent
// back by the client): both look identical from here, one more message in the prompt.

export const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: undefined };
export const TOOL_CALLS: LanguageModelV3FinishReason = { unified: "tool-calls", raw: undefined };
export const LENGTH: LanguageModelV3FinishReason = { unified: "length", raw: "length" };

export const USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** How far apart the panel sees each build step land, for real use; zero in tests. */
export const DEFAULT_STEP_DELAY_MS = 300;

/** One `tool-call` stream part; `input` is stringified, as the provider type requires. */
export function callPart(
  toolCallId: string,
  toolName: string,
  input: unknown,
): LanguageModelV3StreamPart {
  return { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) };
}

/** The `text-start` / `text-delta` / `text-end` triplet a plain-text reply needs. */
export function textParts(id: string, text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
  ];
}

/** The `finish` part every step ends with, `usage` fixed at zero (fake models cost nothing). */
export function finishPart(reason: LanguageModelV3FinishReason): LanguageModelV3StreamPart {
  return { type: "finish", finishReason: reason, usage: USAGE };
}

/** `{ type: "stream-start", warnings: [] }`, the first part of every real provider stream. */
export const STREAM_START: LanguageModelV3StreamPart = { type: "stream-start", warnings: [] };

/**
 * A scripted step as a `ReadableStream`, with `delayMs` awaited before every part after the
 * first — the "300 ms apart" feel the panel wants, made zero for tests (T035 controller
 * ruling 4) rather than left to real timers.
 */
export function scriptedStream(
  parts: readonly LanguageModelV3StreamPart[],
  delayMs = 0,
): ReadableStream<LanguageModelV3StreamPart> {
  return simulateReadableStream({ chunks: [...parts], chunkDelayInMs: delayMs || null });
}

/** Every `tool-result` part across `prompt`'s `tool` messages, whatever their `toolName`. */
function toolResultParts(prompt: LanguageModelV3Prompt) {
  return prompt
    .filter((message): message is Extract<LanguageModelV3Message, { role: "tool" }> => {
      return message.role === "tool";
    })
    .flatMap((message) => message.content)
    .filter((part) => part.type === "tool-result");
}

/** Whether `prompt` already carries a result for `toolName` — this step of the script is done. */
export function hasResult(prompt: LanguageModelV3Prompt, toolName: string): boolean {
  return toolResultParts(prompt).some((part) => part.toolName === toolName);
}

/** How many results `toolName` has in `prompt` — for a tool called more than once per turn. */
export function resultCount(prompt: LanguageModelV3Prompt, toolName: string): number {
  return toolResultParts(prompt).filter((part) => part.toolName === toolName).length;
}

/** The text `output` of `toolName`'s most recent result, or `""` when it has none. */
export function resultText(prompt: LanguageModelV3Prompt, toolName: string): string {
  const results = toolResultParts(prompt).filter((part) => part.toolName === toolName);
  const last = results[results.length - 1];
  if (last === undefined) return "";
  const output = last.output;
  return output.type === "text" ? output.value : "";
}

/** The `status` of `toolName`'s most recent result when it is an edit tool's json answer
 * (`applied`, `declined`, `rejected` — helper-protocol.md → Results), or `""` when it has
 * none or the output is not that shape (F42, `card-then-apply`). */
export function resultStatus(prompt: LanguageModelV3Prompt, toolName: string): string {
  const results = toolResultParts(prompt).filter((part) => part.toolName === toolName);
  const output = results[results.length - 1]?.output;
  if (output?.type !== "json") return "";
  const value = output.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? status : "";
}

/** How many real user turns `prompt` carries (the opening request plus each reply). */
export function userTurnCount(prompt: LanguageModelV3Prompt): number {
  return prompt.filter((message) => message.role === "user").length;
}

/** The text of the most recent user message, parts joined — `""` if there is none. */
export function lastUserText(prompt: LanguageModelV3Prompt): string {
  const users = prompt.filter(
    (message): message is Extract<LanguageModelV3Message, { role: "user" }> =>
      message.role === "user",
  );
  const last = users[users.length - 1];
  if (last === undefined) return "";
  return last.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

/** Whether `text` reads as a clear yes to the build proposal (FR-034) — loose on purpose,
 * since the volunteer's reply is free text, not a button's fixed label. */
export function isAffirmative(text: string): boolean {
  return /\b(yes|yeah|yep|yup|sure|go ahead)\b/i.test(text);
}

/**
 * How many times the assistant has already replied with plain text and no tool call —
 * the interview questions asked so far, since each one ends its turn on text alone.
 */
export function textTurnCount(prompt: LanguageModelV3Prompt): number {
  return prompt.filter((message) => {
    if (message.role !== "assistant") return false;
    const hasText = message.content.some((part) => part.type === "text");
    const hasToolCall = message.content.some((part) => part.type === "tool-call");
    return hasText && !hasToolCall;
  }).length;
}

/** The block id on the `readOutline`-shaped line naming `type`, or `undefined` if there is none. */
export function outlineBlockId(outline: string, type: string): string | undefined {
  const pattern = new RegExp(`^\\d+\\.\\s+(\\S+)\\s+${type}\\s+—`, "m");
  return pattern.exec(outline)?.[1];
}

/** Every block id on a `readOutline`-shaped "N. id type — preview" line, in page order. */
export function outlineBlockIds(outline: string): string[] {
  const pattern = /^\d+\.\s+(\S+)\s+\S+\s+—/gm;
  return [...outline.matchAll(pattern)].map((match) => match[1] ?? "");
}
