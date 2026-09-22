import {
  stepCountIs,
  streamText,
  type JSONValue,
  type ModelMessage,
  type ToolModelMessage,
  type ToolResultPart,
} from "ai";
import { createHelperTools } from "@/core/helper/tools";

// The shared harness for the fake-model scenario tests (scenarios.test.ts and, since the
// F65 final review split it out, bio-interview.test.ts). Tool calls are answered here
// exactly as `helperReducer` would answer them (`{status:"applied"}` etc.) or with a plain
// string for a text read, standing in for the browser; `load_skill` and `view_photos` are
// the two server-executed tools, stubbed here since their real behaviour is
// `createHelperStream`'s (tested in helper-protocol.test.ts).

export function tools() {
  return createHelperTools({
    viewPhotos: async () => ({ photos: [], refused: [] }),
    loadSkill: async (name: string) => ({ name, description: "d", body: "BODY" }),
  });
}

export function userText(text: string): ModelMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

export type AssistantToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export function isAssistant(
  message: ModelMessage,
): message is ModelMessage & { role: "assistant" } {
  return message.role === "assistant";
}

export function toolCallsOf(message: ModelMessage & { role: "assistant" }): AssistantToolCall[] {
  if (typeof message.content === "string") return [];
  return message.content.filter((part): part is AssistantToolCall => part.type === "tool-call");
}

/** Every tool call in `messages` with no `tool-result` yet, answered with `answer(name, input)`. */
export function resolveBrowserTools(
  messages: ModelMessage[],
  answer: (toolName: string, input: unknown) => JSONValue,
): ModelMessage[] {
  const calls = messages.filter(isAssistant).flatMap(toolCallsOf);
  const resolvedIds = new Set(
    messages
      .filter((message) => message.role === "tool")
      .flatMap((message) => message.content)
      .map((part) => (part as { toolCallId: string }).toolCallId),
  );
  const unresolved = calls.filter((call) => !resolvedIds.has(call.toolCallId));
  if (unresolved.length === 0) return messages;
  const toolMessage: ToolModelMessage = {
    role: "tool",
    content: unresolved.map((call): ToolResultPart => {
      const value = answer(call.toolName, call.input);
      // A read tool's real browser answer is the fenced string from reads.ts, which the
      // client's own `addToolResult` sends as text — matching that here is what lets a
      // scenario's `resultText` (reads a prior read's output back out) find it.
      const output: ToolResultPart["output"] =
        typeof value === "string" ? { type: "text", value } : { type: "json", value };
      return { type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName, output };
    }),
  };
  return [...messages, toolMessage];
}

/** Runs one round: drives every server-executed tool to completion, returns the grown history. */
export async function step(
  model: Parameters<typeof streamText>[0]["model"],
  messages: ModelMessage[],
) {
  const result = streamText({ model, tools: tools(), messages, stopWhen: stepCountIs(40) });
  await result.steps;
  const response = await result.response;
  return [...messages, ...response.messages];
}

export function lastAssistant(
  messages: ModelMessage[],
): (ModelMessage & { role: "assistant" }) | undefined {
  return [...messages].reverse().find(isAssistant);
}

export function lastToolNames(messages: ModelMessage[]): string[] {
  const last = lastAssistant(messages);
  return last === undefined ? [] : toolCallsOf(last).map((call) => call.toolName);
}

export function lastText(messages: ModelMessage[]): string {
  const last = lastAssistant(messages);
  if (last === undefined) return "";
  if (typeof last.content === "string") return last.content;
  return last.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export const OUTLINE_WITH_BIO =
  "Name: Charlotte\n\nSections:\n1. blockaaaaaaa hero — none.\n2. blockaaaaaab bio — Empty.\n";
