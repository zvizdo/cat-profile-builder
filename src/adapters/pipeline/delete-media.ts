import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { NotFoundError, parseOrThrow, RefusedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import type { MediaAsset } from "@/core/media/schema";
import { migrate } from "@/core/profile/migrations";
import {
  MediaIdSchema,
  ProfileIdSchema,
  PublishedDocumentSchema,
  referencedMediaIds,
} from "@/core/profile/schema";

// Deleting one media file (ADR-005 step 7, ADR-015 → Media-in-use guard; FR-076, FR-087):
// refused, naming the cat, while the live or the archived page references the id; else
// the media folder goes from both buckets. The draft is never edited — a block that still
// points at the id shows the missing-media state and readiness lists it.

/** What `deleteMedia` takes. */
export const DeleteMediaInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  mediaId: MediaIdSchema,
});

export type DeleteMediaInput = z.infer<typeof DeleteMediaInputSchema>;

/** What `deleteMedia` takes from the container. */
export type DeleteMediaDeps = Pick<Container, "profileStore" | "mediaStore">;

/** The 404 for a media id with no record. */
const NO_SUCH_MEDIA = "There's no photo or clip with that id.";

/**
 * Whether the published or archived document `stored` references `mid`; `null` (no such
 * document) references nothing. The document is validated as what it claims to be — a
 * page that cannot be read is not a page that can be shown not to use the file.
 */
function pageUses(stored: unknown | null, mid: string): { name: string } | null {
  if (stored === null) return null;
  const doc = parseOrThrow(PublishedDocumentSchema, migrate(stored));
  return referencedMediaIds(doc).includes(mid) ? { name: doc.name } : null;
}

/** The refusal, in the cat's name, with what frees the file (CONTENT.md voice). */
function inUse(name: string, asset: MediaAsset, page: "live" | "archived"): RefusedError {
  const what = asset.kind === "photo" ? "photo" : "clip";
  const next = page === "live" ? "Unpublish first." : "Restore and unpublish first.";
  return new RefusedError(`${name}'s ${page} page uses this ${what}. ${next}`);
}

/**
 * Removes the record, the original and every derived revision of one media id, unless the
 * cat's live page or archived page still uses it — then `refused`, naming the cat and the
 * page. `not_found` when there is no record. Only this cat is checked: media is per cat
 * (ADR-015).
 */
export async function deleteMedia(
  deps: DeleteMediaDeps,
  input: DeleteMediaInput,
): Promise<Record<never, never>> {
  const { profileId: pid, mediaId: mid } = input;
  const stored = await deps.mediaStore.readAsset(pid, mid);
  if (stored === null) throw new NotFoundError(NO_SUCH_MEDIA);
  const asset = loadAsset(stored);
  const live = pageUses(await deps.profileStore.readPublished(pid), mid);
  if (live !== null) throw inUse(live.name, asset, "live");
  const archived = pageUses(await deps.profileStore.readArchived(pid), mid);
  if (archived !== null) throw inUse(archived.name, asset, "archived");
  await deps.mediaStore.deleteMedia(pid, mid);
  return {};
}
