import { MockLanguageModelV3 } from "ai/test";
import { describe } from "vitest";
import { createFakeDescriber } from "@/adapters/fake/describer";
import { createVertexDescriber } from "@/adapters/vertex/describer";
import type { Describer } from "@/core/ports";
import { createScriptedDescriber } from "../fakes/describer";
import { memoryLogger } from "../fakes/logger";
import { runDescriberContract } from "./describer.suite";

// Every Describer implementation registers here: the scripted test fake, the runtime fake
// (`MODEL=fake`) in both of its modes, and the Vertex adapter over a mock model that answers
// one sentence (the real model is exercised by the `@vertex` suite in vertex.test.ts).

function vertexOverMock(): Describer {
  const model = new MockLanguageModelV3({
    supportedUrls: { "*": [/^gs:\/\/.*$/] },
    doGenerate: {
      content: [{ type: "text", text: "A cat." }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    },
  });
  return createVertexDescriber({ model, logger: memoryLogger() });
}

const factories: Array<[string, () => Describer]> = [
  ["scripted", () => createScriptedDescriber([{ text: "A cat." }])],
  ["fake", () => createFakeDescriber({})],
  ["fake (FAKE_DESCRIBER=fail)", () => createFakeDescriber({ FAKE_DESCRIBER: "fail" })],
  ["vertex (mock model)", vertexOverMock],
];

describe.each(factories)("describer: %s", (name, factory) => {
  runDescriberContract(name, factory);
});
