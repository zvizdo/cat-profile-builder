import "server-only";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { generateText, type UserContent } from "ai";
import { z } from "zod";
import { RefusedError } from "@/core/errors";
import { isWebClipUri } from "@/core/media/clip-uri";
import type { DescribeResult, Describer, Logger } from "@/core/ports";

// The real Describer (contracts/ports.md, ADR-003): one bounded Gemini call per photo or
// clip that writes the first alternative text (FR-011). It takes the *model*, not the
// provider, so a unit test hands it a `MockLanguageModelV3` and the container hands it
// `vertex(config.MODEL_DESCRIBER)`. The answer is untrusted until Zod has seen it
// (constitution, Principle VI); a provider failure is `{ failed }` with the provider's words
// in the log at `warn` and never in the result, so nothing a model or Google wrote can
// reach a browser. One attempt, no retry: the volunteer writes the text by hand when it
// fails (FR-073), which is a better second try than another model call.

/**
 * The fixed instruction. It asks for alternative text — what a screen reader says in place
 * of the picture — not a title or a description for sighted readers, and keeps the model
 * from naming the cat or announcing the medium. The 250-character ask sits under the
 * 300-character limit of the alt schema so a slightly long answer still validates.
 *
 * One prompt serves both `describePhoto` and `describeVideo` (same call, same schema) —
 * a photo of a gray-and-white cat and a clip of the same cat were coming back "gray and
 * white" from the photo path and "a tabby" from the clip path, every time (F54). Nothing
 * about the call differs between the two; the fix is telling the model, once, to name the
 * coat it actually sees in *this* frame rather than pattern-match on a stereotype, and to
 * drop the coat rather than invent it when the frame does not show it clearly.
 */
export const DESCRIBE_PROMPT =
  "Write alternative text for a screen reader: one or two plain sentences describing the " +
  "cat you see — its appearance, its pose and the setting. Name the coat's actual colours " +
  "(for example grey, white, black, orange) as you see them in this photo or clip, not " +
  "only a pattern word such as 'tabby' on its own; if the colour and pattern are not " +
  "clearly visible, leave the coat out rather than guess. Do not begin with 'photo of', " +
  "'image of' or 'video of'; do not give the cat a name; no emoji; no more than 250 " +
  "characters. Answer with the sentences only.";

/** The answer, once it is a sentence: trimmed, non-empty, and within the alt-text limit. */
const AnswerSchema = z.string().trim().min(1).max(300);

/** Enough for two sentences of alt text; anything longer is not alt text. */
const MAX_OUTPUT_TOKENS = 120;

/** Cool but not deterministic: the same clean photo should read the same way twice. */
const TEMPERATURE = 0.2;

export interface VertexDescriberDeps {
  model: LanguageModelV3;
  logger: Logger;
}

/**
 * A Describer over `model`. `describePhoto` sends the bytes inline as JPEG (the clean
 * derivative is always JPEG); `describeVideo` sends the `gs://` URI as a file part, which
 * Vertex reads straight from the bucket — nothing is downloaded on the way.
 */
export function createVertexDescriber({ model, logger }: VertexDescriberDeps): Describer {
  const log = logger.child({ modelId: model.modelId });

  /** One call: the prompt plus `media`, read back as `unknown` and validated. */
  async function describe(media: Exclude<UserContent, string>[number]): Promise<DescribeResult> {
    let answer: Awaited<ReturnType<typeof generateText>>;
    try {
      answer = await generateText({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: DESCRIBE_PROMPT }, media] }],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
      });
    } catch (err) {
      log.warn({ err }, "describer failed");
      return { failed: "model" };
    }

    const text: unknown = answer.text;
    const parsed = AnswerSchema.safeParse(text);
    // Only a natural stop is a whole answer: `length` is a cut sentence, `content-filter`
    // an empty one — neither may pass as complete (constitution, AI guardrails).
    if (answer.finishReason !== "stop" || !parsed.success) {
      log.warn(
        { finishReason: answer.finishReason, usage: answer.usage, valid: parsed.success },
        "describer failed",
      );
      return { failed: "model" };
    }
    log.debug({ text: parsed.data, usage: answer.usage }, "described");
    return { text: parsed.data };
  }

  return {
    async describePhoto(bytes) {
      return describe({ type: "image", image: bytes, mediaType: "image/jpeg" });
    },
    async describeVideo(gsUri) {
      if (!isWebClipUri(gsUri)) {
        throw new RefusedError("Only the finished web clip can be described.");
      }
      // The filesystem store (STORE=fs) answers a `file:///` URI for the same clip, which
      // a model in Google's cloud cannot open. That is a deployment mismatch, not a model
      // failure, but the volunteer's path is the same: write the description by hand.
      if (!gsUri.startsWith("gs://")) {
        log.warn({ reason: "not-in-cloud-storage" }, "describer failed");
        return { failed: "not-in-cloud-storage" };
      }
      return describe({ type: "file", data: new URL(gsUri), mediaType: "video/mp4" });
    },
  };
}
