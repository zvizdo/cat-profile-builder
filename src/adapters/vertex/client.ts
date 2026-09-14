import "server-only";
import { createVertex, type GoogleVertexProvider } from "@ai-sdk/google-vertex";
import type { Config } from "@/adapters/config";
import { InternalError } from "@/core/errors";

// The Gemini-on-Vertex provider (ADR-001): one `@ai-sdk/google-vertex` instance over
// Application Default Credentials — the Cloud Run service account in production, `gcloud
// auth application-default login` on a laptop. No API key exists anywhere (SC-011 holds by
// construction). Building it is free of network calls: the credential is only asked for a
// token inside the per-request `headers` function, so a misconfigured project surfaces on
// the first model call, not at boot.

/** What the client needs from the configuration; `loadConfig` demands the project when `MODEL=vertex`. */
export type VertexConfig = Pick<Config, "GOOGLE_CLOUD_PROJECT" | "VERTEX_LOCATION">;

/**
 * The provider for `config`'s project and location. The project is optional in `Config`
 * because other modes do not need it; a caller reaching here without one is a wiring
 * mistake, reported as such.
 */
export function createVertexClient(config: VertexConfig): GoogleVertexProvider {
  if (config.GOOGLE_CLOUD_PROJECT === undefined) {
    throw new InternalError("MODEL=vertex needs GOOGLE_CLOUD_PROJECT.");
  }
  return createVertex({ project: config.GOOGLE_CLOUD_PROJECT, location: config.VERTEX_LOCATION });
}
