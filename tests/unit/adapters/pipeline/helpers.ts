import { readFileSync } from "node:fs";
import { createMemoryBuckets } from "@/adapters/memory/bucket";
import type { DescribeResult } from "@/core/ports";
import { fixedClock } from "../../../fakes/clock";
import { createScriptedDescriber } from "../../../fakes/describer";
import { sequentialIds } from "../../../fakes/id-source";
import { memoryLogger } from "../../../fakes/logger";
import { createMemoryMediaStore } from "../../../fakes/media-store";
import { createMemoryProfileStore } from "../../../fakes/profile-store";
import { createScriptedVideoProcessor, type VideoScript } from "../../../fakes/video-processor";

// What every pipeline test starts from: both memory stores over one backing, a scripted
// describer, a scripted video processor, a stopped clock, sequential ids and a memory
// logger — the container's fields the pipeline functions take, and nothing that reaches a
// network or an ffmpeg binary.

export const NOW = "2026-09-10T12:00:00.000Z";
export const PID = "abcdefgh";
export const MB = 1024 * 1024;

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
}

export function pipelineDeps(
  results: DescribeResult[] = [{ text: "A tabby cat asleep." }],
  video: VideoScript = {},
) {
  const buckets = createMemoryBuckets();
  return {
    profileStore: createMemoryProfileStore({ buckets }),
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test", buckets }),
    describer: createScriptedDescriber(results),
    videoProcessor: createScriptedVideoProcessor(video),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
    logger: memoryLogger(),
  };
}

export type PipelineDeps = ReturnType<typeof pipelineDeps>;

/** An empty draft for `pid`, so the cat exists. */
export async function seedProfile(deps: PipelineDeps, pid = PID, name = "Charlotte") {
  const doc = {
    schemaVersion: 1,
    id: pid,
    name,
    blocks: [],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt: NOW,
  };
  await deps.profileStore.writeDraft(pid, doc, { name, line: "", thumbnail: null, updatedAt: NOW });
  return doc;
}
