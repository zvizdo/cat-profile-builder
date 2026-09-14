import "server-only";
import { resolve } from "node:path";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { sessionReader, type SessionReader } from "@/adapters/auth/session";
import { loadConfig, type Config } from "@/adapters/config";
import { createFakeDescriber } from "@/adapters/fake/describer";
import { createFfmpegVideoProcessor } from "@/adapters/ffmpeg/video-processor";
import { scenario } from "@/adapters/fake/language-model";
import { createFsMediaStore } from "@/adapters/fs/media-store";
import { createFsProfileStore } from "@/adapters/fs/profile-store";
import { createGcsClient } from "@/adapters/gcs/client";
import { createGcsMediaStore } from "@/adapters/gcs/media-store";
import { createGcsProfileStore } from "@/adapters/gcs/profile-store";
import { randomIds } from "@/adapters/ids";
import { createLogger } from "@/adapters/logger";
import { MEDIA_ROUTE } from "@/core/media/public-path";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import { createMemoryMediaStore } from "@/adapters/memory/media-store";
import { createMemoryProfileStore } from "@/adapters/memory/profile-store";
import { createVertexClient } from "@/adapters/vertex/client";
import { createVertexDescriber } from "@/adapters/vertex/describer";
import { createVertexLanguageModel } from "@/adapters/vertex/language-model";
import type {
  Clock,
  Describer,
  IdSource,
  Logger,
  MediaStore,
  ProfileStore,
  VideoProcessor,
} from "@/core/ports";

// The composition root (constitution, Principle I): the one place an adapter is chosen and
// built. `STORE` picks the two stores, `MODEL` picks the describer and the language model
// (ADR-012); everything else is the real thing. Nothing in `src/core` or `src/app` constructs
// a collaborator — it asks for the container and takes what it needs.

export interface Container {
  config: Config;
  logger: Logger;
  profileStore: ProfileStore;
  mediaStore: MediaStore;
  videoProcessor: VideoProcessor;
  describer: Describer;
  languageModel: LanguageModelV3;
  clock: Clock;
  ids: IdSource;
  readSession: SessionReader;
}

/**
 * The two stores over one backing (ADR-015): deleting a cat through either takes its media
 * too. Every store's public URLs are the root-relative `/media/…` path this app serves (F23);
 * the memory store is told so here, the other two know it themselves.
 */
function createStores(config: Config): Pick<Container, "profileStore" | "mediaStore"> {
  switch (config.STORE) {
    case "memory": {
      const buckets = createMemoryBuckets();
      return {
        profileStore: createMemoryProfileStore({ buckets }),
        mediaStore: createMemoryMediaStore({ publicBase: MEDIA_ROUTE, buckets }),
      };
    }
    case "fs": {
      // A relative DATA_DIR is taken from where the server was started, as `.data` in .env is.
      const root = resolve(config.DATA_DIR);
      return {
        profileStore: createFsProfileStore({ root }),
        mediaStore: createFsMediaStore({ root }),
      };
    }
    case "gcs": {
      const buckets = createGcsClient(config);
      return {
        profileStore: createGcsProfileStore(buckets),
        mediaStore: createGcsMediaStore(buckets),
      };
    }
  }
}

/**
 * The describer and the drafting model (ADR-001, ADR-003): Gemini on Vertex over one
 * provider instance, or the fakes. Both Vertex models are lazy handles — no credential is
 * read and nothing is sent until the first call.
 */
function createModels(
  config: Config,
  logger: Logger,
): Pick<Container, "describer" | "languageModel"> {
  if (config.MODEL === "vertex") {
    const vertex = createVertexClient(config);
    return {
      describer: createVertexDescriber({
        model: vertex.languageModel(config.MODEL_DESCRIBER),
        logger,
      }),
      languageModel: createVertexLanguageModel(vertex, config),
    };
  }
  return {
    describer: createFakeDescriber(config),
    languageModel: scenario(config.FAKE_MODEL_SCENARIO),
  };
}

/**
 * Builds every collaborator from `config`. A wiring mistake (a mode without the values it
 * needs, an unknown fake scenario) throws an `InternalError` here, so a misconfigured
 * deployment fails at boot, not on first use.
 */
export function createContainer(config: Config, logger: Logger): Container {
  const clock: Clock = { now: () => new Date() };
  const container: Container = {
    config,
    logger,
    ...createStores(config),
    ...createModels(config, logger),
    videoProcessor: createFfmpegVideoProcessor({ logger }),
    clock,
    ids: randomIds(),
    readSession: sessionReader(config.SESSION_SECRET, clock),
  };
  // The one boot line (ADR-014): which modes and names this process runs with, so a deploy
  // can be read off the logs. Only names go in; the two secrets never leave `config`.
  logger.info(
    {
      STORE: config.STORE,
      MODEL: config.MODEL,
      PUBLIC_BASE_URL: config.PUBLIC_BASE_URL,
      GCS_PRIVATE_BUCKET: config.GCS_PRIVATE_BUCKET,
      GCS_PUBLIC_BUCKET: config.GCS_PUBLIC_BUCKET,
      GOOGLE_CLOUD_PROJECT: config.GOOGLE_CLOUD_PROJECT,
      VERTEX_LOCATION: config.VERTEX_LOCATION,
      MODEL_DRAFTING: config.MODEL_DRAFTING,
      MODEL_DESCRIBER: config.MODEL_DESCRIBER,
      LOG_LEVEL: config.LOG_LEVEL,
    },
    "configuration validated",
  );
  return container;
}

let container: Container | null = null;

/**
 * The process-wide container, built once from `process.env` on first use. Route Handlers
 * and Server Actions call this; tests call {@link createContainer} with their own config.
 */
export function getContainer(): Container {
  if (container === null) {
    const config = loadConfig(process.env);
    container = createContainer(config, createLogger({ level: config.LOG_LEVEL }));
  }
  return container;
}
