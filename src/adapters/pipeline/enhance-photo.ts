import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { enhance } from "@/adapters/sharp/enhance";
import { NotFoundError, parseOrThrow, RefusedError } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema, type MediaAsset } from "@/core/media/schema";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// Enhancing a photo (ADR-016; FR-053, FR-054; data-model.md → MediaAsset.enhancement,
// "ready ──enhance──▶ new asset"). The deterministic `auto-v1` recipe runs over the
// source's clean bytes and the result lands as a brand-new asset — the source is never
// read for writing, only for reading, so it is still there afterwards, unchanged, ready to
// enhance again or to stay the block's image. Synchronous: no describer call, because the
// enhanced photo shows the same cat in the same alt text the source already carries.

/** What `enhancePhoto` takes: the cat and the ready photo to enhance. */
export const EnhancePhotoInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  mediaId: MediaIdSchema,
});

export type EnhancePhotoInput = z.infer<typeof EnhancePhotoInputSchema>;

/** What `enhancePhoto` takes from the container. */
export type EnhancePhotoDeps = Pick<Container, "mediaStore" | "ids" | "clock">;

/** The 404 for a media id with no record. */
const NO_SUCH_MEDIA = "There's no photo or clip with that id.";

/** The refusal for enhancing a video — the schema's own wording (`MediaAssetSchema`). */
const NOT_A_PHOTO = "Only a photo can be enhanced.";

/**
 * The refusal for a photo that exists but has not finished processing yet: still a photo,
 * so {@link NOT_A_PHOTO} would read as a bug report ("it says only photos, but this is one")
 * rather than "wait and try again."
 */
const NOT_READY = "That photo is still being processed. Try again in a moment.";

/**
 * Runs `auto-v1` over the source photo's clean bytes and writes the enhanced result as a
 * new asset: a fresh id, its own `clean` revision, `enhancement: { sourceMediaId, recipe }`,
 * and the source's `focal`, `alt`, `descriptionStatus`, `fileName`, `width` and `height`
 * copied verbatim — the picture's content and framing are unchanged (ADR-016). `not_found`
 * for an unknown id; `refused` for a video (the schema's own wording) or for a photo whose
 * describer call has not returned yet (its own, plainer wording — a real, reachable race:
 * `finalizeUpload` persists a photo at `status: "processing"` before the describer answers,
 * so a second call in that window lands here). Enhancing an already-enhanced photo is
 * allowed — its source is simply that asset, with no special case.
 */
export async function enhancePhoto(
  deps: EnhancePhotoDeps,
  input: EnhancePhotoInput,
): Promise<{ asset: MediaAsset }> {
  const { profileId: pid, mediaId: mid } = input;
  const stored = await deps.mediaStore.readAsset(pid, mid);
  if (stored === null) throw new NotFoundError(NO_SUCH_MEDIA);
  const source = loadAsset(stored);
  if (source.kind !== "photo") throw new RefusedError(NOT_A_PHOTO);
  const sourceRev = source.revisions.clean;
  // `sourceRev === undefined` cannot happen once a photo is `ready` — every photo gets its
  // clean revision at creation and nothing ever clears it — but the type is optional, so
  // it's checked alongside the genuinely reachable "not ready yet" condition rather than
  // asserted away (same role as `trim-video.ts`'s `originalDurationSeconds` check).
  if (source.status !== "ready" || sourceRev === undefined) {
    throw new RefusedError(NOT_READY);
  }

  const clean = await deps.mediaStore.readDerived(pid, mid, "clean", sourceRev);
  if (clean === null) throw new NotFoundError(NO_SUCH_MEDIA);

  const enhanced = await enhance(clean, "auto-v1");
  const newId = deps.ids.mediaId();
  const rev = await deps.mediaStore.writeDerived(pid, newId, "clean", enhanced);

  const asset = parseOrThrow(MediaAssetSchema, {
    schemaVersion: 1,
    id: newId,
    kind: "photo",
    fileName: source.fileName,
    mimeType: "image/jpeg",
    bytes: enhanced.byteLength,
    width: source.width,
    height: source.height,
    focal: source.focal,
    status: "ready",
    alt: source.alt,
    descriptionStatus: source.descriptionStatus,
    enhancement: { sourceMediaId: mid, recipe: "auto-v1" },
    revisions: { clean: rev },
    createdAt: deps.clock.now().toISOString(),
  });
  await deps.mediaStore.writeAsset(pid, newId, asset);
  return { asset };
}
