import type { LanguageModelV3, LanguageModelV3Prompt } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { BUILD_BLOCKS, QUESTIONS } from "./build-profile-happy";
import {
  callPart,
  DEFAULT_STEP_DELAY_MS,
  finishPart,
  hasResult,
  isAffirmative,
  lastUserText,
  resultCount,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  textTurnCount,
  TOOL_CALLS,
} from "./_shared";

// `build-proposal` (F33, replacing `build-it-now`): there is no "Build it now" button —
// the volunteer answers two questions, and instead of building straight away the model
// writes a short plain-text proposal and asks "Want me to build this now?" (FR-034,
// build-profile.md step 5). Only a clear "yes" moves on to the build; anything else (a
// "not yet", a new detail) gets a short reply and the model keeps waiting — never
// building without the yes. Reuses `build-profile-happy`'s question bank and block set,
// cut short at two questions like `build-it-now` did.

const SHORT_QUESTIONS = QUESTIONS.slice(0, 2);

/** The proposal, ending in the exact question the volunteer answers (FR-034). */
const PROPOSAL =
  "Here's what I'm thinking: a bio, a gallery, a needs section, and a quote, with a warm, " +
  "down-to-earth tagline and the Sand theme to match her photos. Want me to build this now?";

/** What the model says while it is still waiting for a clear yes. */
const NOT_YET = "No rush — tell me anything else, or say yes when you're ready.";

const SUMMARY =
  "Built the page from what you've told me so far and the photos on hand: a bio, a gallery, " +
  "a needs section, and a quote, theme set to Sand. Tell me what to change.";

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
  return scriptedStream([
    STREAM_START,
    ...textParts(`q${index}`, SHORT_QUESTIONS[index] ?? ""),
    finishPart(STOP),
  ]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

function readOutlineStep(id: string) {
  return scriptedStream([STREAM_START, callPart(id, "read_outline", {}), finishPart(TOOL_CALLS)]);
}

/** Before the two questions are both answered: `read_outline`, then `load_skill`. */
function bootstrapStep(prompt: LanguageModelV3Prompt) {
  if (!hasResult(prompt, "read_outline")) return readOutlineStep("outline-1");
  return scriptedStream([
    STREAM_START,
    callPart("skill-1", "load_skill", { name: "build-profile" }),
    finishPart(TOOL_CALLS),
  ]);
}

/** Once both questions are answered but nothing is built yet: propose, wait, or build. */
function proposeOrWaitStep(prompt: LanguageModelV3Prompt, said: number, delayMs: number) {
  if (said === SHORT_QUESTIONS.length) return textStep("proposal", PROPOSAL);
  if (isAffirmative(lastUserText(prompt))) return buildStep(delayMs);
  return textStep(`not-yet-${said}`, NOT_YET);
}

/**
 * Two questions, then a proposal that waits for a clear yes before it builds
 * (`options.delayMs`; tests pass `0`).
 */
export function buildProposal(options: { delayMs?: number } = {}): LanguageModelV3 {
  const delayMs = options.delayMs ?? DEFAULT_STEP_DELAY_MS;
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "build-proposal",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "read_outline") || !hasResult(prompt, "load_skill")) {
        return { stream: bootstrapStep(prompt) };
      }
      const said = textTurnCount(prompt);
      if (said < SHORT_QUESTIONS.length) return { stream: questionStep(said) };
      if (resultCount(prompt, "add_block") === 0) {
        return { stream: proposeOrWaitStep(prompt, said, delayMs) };
      }
      if (resultCount(prompt, "read_outline") < 2) return { stream: readOutlineStep("outline-2") };
      return { stream: textStep("summary", SUMMARY) };
    },
  });
}
