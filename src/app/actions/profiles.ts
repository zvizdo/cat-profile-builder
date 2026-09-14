"use server";
import { revalidatePath } from "next/cache";
import { getContainer } from "@/adapters/container";
import type { ActionResult } from "@/app/actions/_lib/guard";
import {
  createProfileWith,
  deleteProfileWith,
  listProfilesWith,
  loadDraftWith,
  type LoadedDraft,
  type ProfileSummary,
} from "@/app/actions/_lib/profiles";

// The four profile Server Actions (contracts/server-boundary.md). Each is thin: the work is
// in `_lib/profiles.ts`, where a test injects the container and the cookie jar. Whatever
// changes the list also revalidates `/builder`, so a back navigation shows the new state.

/** Every cat as a list row, most recently edited first (FR-028). */
export async function listProfiles(): Promise<ActionResult<{ profiles: ProfileSummary[] }>> {
  return listProfilesWith(getContainer());
}

/** Creates an empty draft and answers its id. Called from "New cat" only — never from a GET. */
export async function createProfile(): Promise<ActionResult<{ id: string }>> {
  const result = await createProfileWith(getContainer());
  if (result.ok) revalidatePath("/builder");
  return result;
}

/** The draft to open in the builder, validated, with its media records. */
export async function loadDraft(id: string): Promise<ActionResult<LoadedDraft>> {
  return loadDraftWith(getContainer(), id);
}

/** Deletes a draft cat after the UI has confirmed it; refused for a live or archived one. */
export async function deleteProfile(id: string): Promise<ActionResult<Record<never, never>>> {
  const result = await deleteProfileWith(getContainer(), id);
  if (result.ok) revalidatePath("/builder");
  return result;
}
