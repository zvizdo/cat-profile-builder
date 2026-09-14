import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { E2E_DATA_DIR } from "../global-setup";

// What the journeys read straight from the filesystem store (ADR-015 layout): the draft
// and the published copy of one cat, typed only as far as the assertions need.

export const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");

export interface Published {
  slug: string;
  updatedAt: string;
  blocks: { id: string }[];
  media: Record<string, { src: string; poster?: string }>;
}

export interface DraftBlock {
  id: string;
  mediaId?: string | null;
  mediaIds?: string[];
  scenes?: { mediaId: string | null }[];
}

export interface Draft {
  updatedAt: string;
  blocks: DraftBlock[];
}

export async function publishedOnDisk(id: string): Promise<Published> {
  return JSON.parse(await readFile(resolve(PROFILES_DIR, id, "published.json"), "utf8"));
}

export async function draftOnDisk(id: string): Promise<{ raw: string; doc: Draft }> {
  const raw = await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
  return { raw, doc: JSON.parse(raw) as Draft };
}

/** Every media id the draft's sections point at, in section order. */
export function referencedIds(doc: Draft): string[] {
  return doc.blocks.flatMap((block) => [
    ...(typeof block.mediaId === "string" ? [block.mediaId] : []),
    ...(block.mediaIds ?? []),
    ...(block.scenes ?? []).flatMap((scene) => (scene.mediaId === null ? [] : [scene.mediaId])),
  ]);
}
