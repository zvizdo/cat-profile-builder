import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  DEFAULT_STEP_DELAY_MS,
  finishPart,
  hasResult,
  resultCount,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  textTurnCount,
  TOOL_CALLS,
} from "./_shared";

// `build-profile-happy` (T035 controller ruling 4): the `build-profile` skill's whole
// walkthrough, played straight through — read the outline, load the skill, ask five
// questions one at a time, then add four sections and set the theme, re-read to check the
// work, and summarise. Every step is decided from `options.prompt` alone (see
// `_shared.ts`), so it plays the same whether the AI SDK loops it inside one request (a
// server-executed tool such as `load_skill`) or a browser-answered tool's result arrives on
// the next request.

/** The five interview questions, one per turn, in the order they are asked. */
export const QUESTIONS = [
  "What's her personality like — confident, shy, somewhere in between?",
  "Does she get along with other cats, dogs, or kids?",
  "What does a typical day look like for her?",
  "Any quirks or things she loves (or hates)?",
  "Anything a new owner should know before bringing her home?",
] as const;

/** The blocks a happy build adds, in order — all valid, empty-enough `add_block` inputs. */
export const BUILD_BLOCKS = [
  { type: "bio" as const, content: { paragraphs: [] } },
  { type: "gallery" as const, mediaIds: [] },
  {
    type: "needs" as const,
    cards: [{ title: "A quiet home", text: "She does best without dogs." }],
  },
  { type: "quote" as const, mediaId: null, text: "She purrs like a little engine." },
];

const SUMMARY =
  "Added a bio, a gallery, a needs section, and a quote, and set the theme to Sand. Take a look, and tell me what to change.";

/** The `add_block` × 4 + `set_theme` step every happy build ends on. */
function buildStep(delayMs: number) {
  const calls = BUILD_BLOCKS.map((block, i) =>
    callPart(`build-${i}`, "add_block", { op: "add_block", block }),
  );
  return scriptedStream(
    [
      STREAM_START,
      ...calls,
      callPart("build-theme", "set_theme", { op: "set_theme", preset: "sand" }),
      finishPart(TOOL_CALLS),
    ],
    delayMs,
  );
}

function questionStep(index: number) {
  const question = QUESTIONS[index] ?? "";
  return scriptedStream([STREAM_START, ...textParts(`q${index}`, question), finishPart(STOP)]);
}

/**
 * The happy path through `build-profile` (T035 controller ruling 4). `delayMs` spaces the
 * four `add_block` calls apart for the panel to feel real; tests pass `0`.
 */
export function buildProfileHappy(options: { delayMs?: number } = {}): LanguageModelV3 {
  const delayMs = options.delayMs ?? DEFAULT_STEP_DELAY_MS;
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "build-profile-happy",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "read_outline")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("outline-1", "read_outline", {}),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      if (!hasResult(prompt, "load_skill")) {
        const input = { name: "build-profile" };
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("skill-1", "load_skill", input),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      const asked = textTurnCount(prompt);
      if (asked < QUESTIONS.length) {
        return { stream: questionStep(asked) };
      }
      if (resultCount(prompt, "add_block") < BUILD_BLOCKS.length) {
        return { stream: buildStep(delayMs) };
      }
      if (resultCount(prompt, "read_outline") < 2) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("outline-2", "read_outline", {}),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("summary", SUMMARY), finishPart(STOP)]),
      };
    },
  });
}
