import { describe, expect, it } from "vitest";
import { createVertexClient } from "@/adapters/vertex/client";
import { createVertexLanguageModel } from "@/adapters/vertex/language-model";
import { InternalError } from "@/core/errors";

// The provider is built without a network call (Application Default Credentials are only
// asked for a token when a request is made), so a unit test can check the wiring: the
// model ids come from the configuration and nowhere else.

const CONFIG = {
  GOOGLE_CLOUD_PROJECT: "shelter",
  VERTEX_LOCATION: "europe-west4",
  MODEL_DRAFTING: "drafting-model-from-env",
  MODEL_DESCRIBER: "describer-model-from-env",
};

describe("createVertexClient", () => {
  it("builds a provider on the project without touching the network", () => {
    const vertex = createVertexClient(CONFIG);
    expect(typeof vertex.languageModel).toBe("function");
    const model = vertex.languageModel(CONFIG.MODEL_DESCRIBER);
    expect(model.modelId).toBe("describer-model-from-env");
    expect(model.specificationVersion).toBe("v3");
  });

  it("refuses to build without a project", () => {
    expect(() => createVertexClient({ ...CONFIG, GOOGLE_CLOUD_PROJECT: undefined })).toThrow(
      InternalError,
    );
  });
});

describe("createVertexLanguageModel", () => {
  it("is the drafting model, by the id in MODEL_DRAFTING", () => {
    const model = createVertexLanguageModel(createVertexClient(CONFIG), CONFIG);
    expect(model.modelId).toBe("drafting-model-from-env");
    expect(model.provider).toMatch(/vertex/);
  });
});
