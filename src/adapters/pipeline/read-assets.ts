import type { Container } from "@/adapters/container";
import { ProfileInvalidError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import type { MediaAsset } from "@/core/media/schema";

// Every media record of one cat, validated (ADR-015): what the builder opens with, what a
// draft save stamps its thumbnail from, and what publish resolves its manifest over.

/** What reading a cat's records takes from the container. */
export type ReadAssetsDeps = Pick<Container, "mediaStore" | "logger">;

/**
 * The cat's media records through `loadAsset`, in `mid` order. One record that fails its
 * schema is logged and left out rather than failing the caller; a page that references it
 * then shows the missing-media state and readiness lists it. Only that failure is
 * absorbed: a store that cannot be read propagates, so an outage is never presented as a
 * cat with no media.
 */
export async function readAssets(deps: ReadAssetsDeps, pid: string): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];
  for (const mid of await deps.mediaStore.listMedia(pid)) {
    const stored = await deps.mediaStore.readAsset(pid, mid);
    try {
      assets.push(loadAsset(stored));
    } catch (error) {
      if (!(error instanceof ProfileInvalidError)) throw error;
      deps.logger.error({ pid, mid, paths: error.paths }, "media record failed validation");
    }
  }
  return assets;
}
