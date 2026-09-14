import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { NotFoundError, TooLargeError } from "@/core/errors";
import { checkDeclaredSize } from "@/core/media/validation";
import { ProfileIdSchema } from "@/core/profile/schema";

// Step 1 of an upload (ADR-005; FR-007): judge the declared size before any byte moves,
// mint the media id, and hand the browser its signed upload. Nothing is written here — an
// upload exists only once `finalizeUpload` has passed every check, so an abandoned one
// leaves at most a stray original for the bucket's lifecycle rule.

/** What `beginUpload` takes (contracts/server-boundary.md), validated at the action. */
export const BeginUploadInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  /** Kept for messages and the record; never used as a path. */
  fileName: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  /** The type the browser named; may be empty when it could not. */
  declaredType: z.string().max(100),
});

export type BeginUploadInput = z.infer<typeof BeginUploadInputSchema>;

/** What the browser needs to send the bytes: the id to finalize under, and the signed upload. */
export interface BeginUploadResult {
  mediaId: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
}

/** What `beginUpload` takes from the container. */
export type BeginUploadDeps = Pick<Container, "profileStore" | "mediaStore" | "ids">;

/** The 404 for an id no cat has. */
const NO_SUCH_CAT = "There's no cat with that id.";

/**
 * Refuses a declared size over its cap (`too_large`, naming the cap) before either store is
 * touched; then `not_found` for a cat that does not exist; then mints a media id and signs
 * an upload for exactly `byteSize` bytes. The declared type only picks the cap here — the
 * sniff at finalize decides what the file is.
 */
export async function beginUpload(
  deps: BeginUploadDeps,
  input: BeginUploadInput,
): Promise<BeginUploadResult> {
  const size = checkDeclaredSize(input);
  if (!size.ok) throw new TooLargeError(size.message);
  const { profileId } = input;
  if (!(await deps.profileStore.exists(profileId))) throw new NotFoundError(NO_SUCH_CAT);
  const mediaId = deps.ids.mediaId();
  const upload = await deps.mediaStore.createSignedUpload(profileId, mediaId, input.byteSize);
  return { mediaId, uploadUrl: upload.url, method: upload.method, headers: upload.headers };
}
