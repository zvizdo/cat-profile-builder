import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@/adapters/config";
import { createLogger } from "@/adapters/logger";
import { createVertexClient } from "@/adapters/vertex/client";
import { createVertexDescriber } from "@/adapters/vertex/describer";
import type { Describer } from "@/core/ports";

// @vertex — the one integration test the Describer adapter is allowed (contracts/ports.md).
// It calls Gemini on Vertex for real, so it only runs when the environment says so:
// `MODEL=vertex GOOGLE_CLOUD_PROJECT=<project>` plus Application Default Credentials
// (`gcloud auth application-default login`). The clip case additionally needs a finished
// web clip already in a bucket, named by `VERTEX_TEST_CLIP_URI`. Everything else skips.

const live = process.env.MODEL === "vertex" && Boolean(process.env.GOOGLE_CLOUD_PROJECT);
const clipUri = process.env.VERTEX_TEST_CLIP_URI;

function realDescriber(): Describer {
  const config = loadConfig({
    ...process.env,
    STORE: "memory",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000/",
    SESSION_SECRET: process.env.SESSION_SECRET ?? "vertex-contract-test-secret",
    SHELTER_USERNAME: process.env.SHELTER_USERNAME ?? "shelter",
    SHELTER_PASSWORD_HMAC: process.env.SHELTER_PASSWORD_HMAC ?? "0".repeat(64),
  });
  const vertex = createVertexClient(config);
  return createVertexDescriber({
    model: vertex.languageModel(config.MODEL_DESCRIBER),
    logger: createLogger({ level: "debug" }),
  });
}

describe.skipIf(!live)("@vertex Describer against Gemini on Vertex", () => {
  it("describes a real cat photo in one or two plain sentences", async () => {
    const bytes = new Uint8Array(await readFile("tests/fixtures/cat-1.jpg"));
    const result = await realDescriber().describePhoto(bytes);
    expect(result).toHaveProperty("text");
    if ("text" in result) {
      expect(result.text.length).toBeGreaterThan(10);
      expect(result.text.length).toBeLessThanOrEqual(300);
      expect(result.text).not.toMatch(/^(a |an )?(photo|image|picture) of/i);
    }
  }, 60_000);

  it.skipIf(clipUri === undefined)(
    "describes a finished web clip named by VERTEX_TEST_CLIP_URI",
    async () => {
      const result = await realDescriber().describeVideo(clipUri ?? "");
      expect(result).toHaveProperty("text");
    },
    120_000,
  );
});
