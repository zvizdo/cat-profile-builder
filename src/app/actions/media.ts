"use server";
import { getContainer } from "@/adapters/container";
import type { BeginUploadInput, BeginUploadResult } from "@/adapters/pipeline/begin-upload";
import type { DeleteMediaInput } from "@/adapters/pipeline/delete-media";
import type { SetAltTextInput, SetFocalPointInput } from "@/adapters/pipeline/edit-asset";
import type { EnhancePhotoInput } from "@/adapters/pipeline/enhance-photo";
import type { FinalizeUploadInput } from "@/adapters/pipeline/finalize-upload";
import type { UploadEventInput } from "@/adapters/pipeline/report-upload-event";
import type { ClearTrimInput, TrimVideoInput } from "@/adapters/pipeline/trim-video";
import type { ActionResult } from "@/app/actions/_lib/guard";
import {
  beginUploadWith,
  clearTrimWith,
  deleteMediaWith,
  enhancePhotoWith,
  finalizeUploadWith,
  reportUploadEventWith,
  setAltTextWith,
  setFocalPointWith,
  trimVideoWith,
  type EditedAsset,
  type FinalizedUpload,
} from "@/app/actions/_lib/media";

// The media Server Actions (contracts/server-boundary.md). Each is thin: the work is
// in `_lib/media.ts`, where a test injects the container and the cookie jar. The input
// types are for the caller's benefit only — every action validates what actually arrives.
// Every record answered is an `AssetView`: the record plus its derived files' URLs.

/** Refuses an over-limit size before any byte moves and answers the id and signed upload (FR-007). */
export async function beginUpload(
  input: BeginUploadInput,
): Promise<ActionResult<BeginUploadResult>> {
  return beginUploadWith(getContainer(), input);
}

/** Checks the uploaded bytes and, when they pass, answers the finished record and any warnings (FR-008). */
export async function finalizeUpload(
  input: FinalizeUploadInput,
): Promise<ActionResult<FinalizedUpload>> {
  return finalizeUploadWith(getContainer(), input);
}

/** Moves the focal point of a photo. */
export async function setFocalPoint(input: SetFocalPointInput): Promise<ActionResult<EditedAsset>> {
  return setFocalPointWith(getContainer(), input);
}

/** Sets the description in the volunteer's words; allowed any time (FR-011). */
export async function setAltText(input: SetAltTextInput): Promise<ActionResult<EditedAsset>> {
  return setAltTextWith(getContainer(), input);
}

/** Runs the deterministic `auto-v1` recipe on a ready photo and answers the new asset (ADR-016). */
export async function enhancePhoto(input: EnhancePhotoInput): Promise<ActionResult<EditedAsset>> {
  return enhancePhotoWith(getContainer(), input);
}

/** Removes a media file; refused, naming the cat, while a live or archived page uses it (FR-076). */
export async function deleteMedia(
  input: DeleteMediaInput,
): Promise<ActionResult<Record<never, never>>> {
  return deleteMediaWith(getContainer(), input);
}

/** Trims a clip to 1–15 s of the original; refused naming the number otherwise (FR-078). */
export async function trimVideo(input: TrimVideoInput): Promise<ActionResult<EditedAsset>> {
  return trimVideoWith(getContainer(), input);
}

/** Removes a clip's trim; a long original goes back to needing one (FR-078). */
export async function clearTrim(input: ClearTrimInput): Promise<ActionResult<EditedAsset>> {
  return clearTrimWith(getContainer(), input);
}

/** Logs one upload the browser saw fail, or saw a retry rescue; answers nothing (spec 2026-09-22). */
export async function reportUploadEvent(
  input: UploadEventInput,
): Promise<ActionResult<Record<never, never>>> {
  return reportUploadEventWith(getContainer(), input);
}
