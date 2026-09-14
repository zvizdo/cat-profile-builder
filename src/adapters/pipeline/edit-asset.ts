import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { NotFoundError, parseOrThrow } from "@/core/errors";
import { loadAsset } from "@/core/media/migrations";
import { MediaAssetSchema, type MediaAsset } from "@/core/media/schema";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// The two edits a volunteer makes on a media tile (FR-011; data-model.md → state
// transitions): where the crop centres, and the description in their own words. Each is a
// read–validate–change–validate–write of the one record; nothing else moves.

/** The media the edit is about. */
const TargetSchema = z.strictObject({ profileId: ProfileIdSchema, mediaId: MediaIdSchema });

/** What `setFocalPoint` takes: percentages into the photo, 0–100 on each axis. */
export const SetFocalPointInputSchema = TargetSchema.extend({
  focal: z.strictObject({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
});

export type SetFocalPointInput = z.infer<typeof SetFocalPointInputSchema>;

/** What `setAltText` takes: the description, 1–300 characters once trimmed. */
export const SetAltTextInputSchema = TargetSchema.extend({
  text: z.string().trim().min(1).max(300),
});

export type SetAltTextInput = z.infer<typeof SetAltTextInputSchema>;

/** What both edits take from the container. */
export type EditAssetDeps = Pick<Container, "mediaStore">;

/** The 404 for a media id with no record. */
const NO_SUCH_MEDIA = "There's no photo or clip with that id.";

/**
 * Reads the record, applies `change` and writes the result back — validated on the way in
 * (`loadAsset`) and on the way out, so neither a broken stored record nor a bad change can
 * land. `not_found` when there is no record.
 */
async function editAsset(
  deps: EditAssetDeps,
  target: z.infer<typeof TargetSchema>,
  change: Partial<MediaAsset>,
): Promise<{ asset: MediaAsset }> {
  const { profileId: pid, mediaId: mid } = target;
  const stored = await deps.mediaStore.readAsset(pid, mid);
  if (stored === null) throw new NotFoundError(NO_SUCH_MEDIA);
  const asset = parseOrThrow(MediaAssetSchema, { ...loadAsset(stored), ...change });
  await deps.mediaStore.writeAsset(pid, mid, asset);
  return { asset };
}

/** Moves the focal point every crop of the photo centres on (design adoption, ADR-007). */
export function setFocalPoint(
  deps: EditAssetDeps,
  input: SetFocalPointInput,
): Promise<{ asset: MediaAsset }> {
  return editAsset(deps, input, { focal: input.focal });
}

/**
 * Replaces the description with the volunteer's words (`alt.source: "volunteer"`) and marks
 * the description ready — allowed at any time, and the way out of a failed one (FR-073).
 */
export function setAltText(
  deps: EditAssetDeps,
  input: SetAltTextInput,
): Promise<{ asset: MediaAsset }> {
  return editAsset(deps, input, {
    alt: { text: input.text, source: "volunteer" },
    descriptionStatus: "ready",
  });
}
