import "server-only";
import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { Config } from "@/adapters/config";

// The drafting and editing model (ADR-001, ADR-003): the AI SDK's `LanguageModelV3` is the
// port the helper is written against, and this is the one place the real one is picked. The
// id comes from `MODEL_DRAFTING` and nowhere else; the model is a lazy handle, so nothing
// is sent until the helper makes its first call.

/** The Vertex model named by `MODEL_DRAFTING`, as the helper's `LanguageModelV3`. */
export function createVertexLanguageModel(
  vertex: Pick<GoogleVertexProvider, "languageModel">,
  config: Pick<Config, "MODEL_DRAFTING">,
): LanguageModelV3 {
  return vertex.languageModel(config.MODEL_DRAFTING);
}
