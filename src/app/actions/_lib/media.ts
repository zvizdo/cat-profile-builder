import "server-only";
import type { Container } from "@/adapters/container";
import { assetView, type AssetView } from "@/adapters/pipeline/asset-view";
import {
  beginUpload,
  BeginUploadInputSchema,
  type BeginUploadResult,
} from "@/adapters/pipeline/begin-upload";
import { deleteMedia, DeleteMediaInputSchema } from "@/adapters/pipeline/delete-media";
import {
  setAltText,
  SetAltTextInputSchema,
  setFocalPoint,
  SetFocalPointInputSchema,
} from "@/adapters/pipeline/edit-asset";
import { enhancePhoto, EnhancePhotoInputSchema } from "@/adapters/pipeline/enhance-photo";
import { finalizeUpload, FinalizeUploadInputSchema } from "@/adapters/pipeline/finalize-upload";
import {
  clearTrim,
  ClearTrimInputSchema,
  trimVideo,
  TrimVideoInputSchema,
} from "@/adapters/pipeline/trim-video";
import { withSession, type ActionResult, type GetCookies } from "@/app/actions/_lib/guard";
import { parseOrThrow } from "@/core/errors";
import type { MediaAsset } from "@/core/media/schema";

// The logic behind the seven media Server Actions in `src/app/actions/media.ts`
// (contracts/server-boundary.md). Each one does exactly three things: re-check the session
// (`withSession`, ADR-011), validate the input against its schema, and call the one
// pipeline function — nothing else (constitution, Principle I), except that every record
// answered goes out as its `AssetView`, with its derived files' URLs. The container and
// the cookie jar are injected so a test can run them without Next.

/** What the media actions need from the container. */
export type MediaDeps = Pick<
  Container,
  | "profileStore"
  | "mediaStore"
  | "videoProcessor"
  | "describer"
  | "ids"
  | "clock"
  | "logger"
  | "readSession"
>;

/** What every action that answers a record answers: the record as the builder's view. */
export interface EditedAsset {
  asset: AssetView;
}

/** What `finalizeUpload` answers: the finished record's view and any warnings (FR-008). */
export interface FinalizedUpload extends EditedAsset {
  warnings: string[];
}

/** `result` with its `asset` replaced by the view for the cat `pid`. */
function viewed<T extends { asset: MediaAsset }>(
  deps: MediaDeps,
  pid: string,
  result: T,
): Omit<T, "asset"> & EditedAsset {
  return { ...result, asset: assetView(deps.mediaStore, pid, result.asset) };
}

/** Judges the declared size, mints the id and signs the upload (ADR-005 step 1). */
export function beginUploadWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<BeginUploadResult>> {
  return withSession(
    deps,
    () => beginUpload(deps, parseOrThrow(BeginUploadInputSchema, input)),
    getCookies,
  )();
}

/** Sniffs, checks, cleans, records and describes the uploaded bytes (ADR-005 steps 3–5). */
export function finalizeUploadWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<FinalizedUpload>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(FinalizeUploadInputSchema, input);
      return viewed(deps, parsed.profileId, await finalizeUpload(deps, parsed));
    },
    getCookies,
  )();
}

/** Moves a photo's focal point. */
export function setFocalPointWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<EditedAsset>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(SetFocalPointInputSchema, input);
      return viewed(deps, parsed.profileId, await setFocalPoint(deps, parsed));
    },
    getCookies,
  )();
}

/** Sets the description in the volunteer's words (FR-011). */
export function setAltTextWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<EditedAsset>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(SetAltTextInputSchema, input);
      return viewed(deps, parsed.profileId, await setAltText(deps, parsed));
    },
    getCookies,
  )();
}

/** Runs the deterministic `auto-v1` recipe and answers the new, enhanced asset (ADR-016). */
export function enhancePhotoWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<EditedAsset>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(EnhancePhotoInputSchema, input);
      return viewed(deps, parsed.profileId, await enhancePhoto(deps, parsed));
    },
    getCookies,
  )();
}

/** Removes a media file unless a live or archived page uses it (FR-076). */
export function deleteMediaWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<Record<never, never>>> {
  return withSession(
    deps,
    () => deleteMedia(deps, parseOrThrow(DeleteMediaInputSchema, input)),
    getCookies,
  )();
}

/** Trims a clip to a range `checkTrim` accepts; refused in its words otherwise (FR-078). */
export function trimVideoWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<EditedAsset>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(TrimVideoInputSchema, input);
      return viewed(deps, parsed.profileId, await trimVideo(deps, parsed));
    },
    getCookies,
  )();
}

/** Removes a clip's trim; a long original goes back to `needs-trim` (FR-078). */
export function clearTrimWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<EditedAsset>> {
  return withSession(
    deps,
    async () => {
      const parsed = parseOrThrow(ClearTrimInputSchema, input);
      return viewed(deps, parsed.profileId, await clearTrim(deps, parsed));
    },
    getCookies,
  )();
}
