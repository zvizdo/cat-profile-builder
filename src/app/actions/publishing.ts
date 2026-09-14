"use server";
import { revalidatePath } from "next/cache";
import { getContainer } from "@/adapters/container";
import type { ActionResult } from "@/app/actions/_lib/guard";
import {
  archiveWith,
  publishWith,
  restoreWith,
  unpublishWith,
  type PublishActionInput,
  type PublishActionResult,
} from "@/app/actions/_lib/publishing";

// The four publishing Server Actions (contracts/server-boundary.md). Each is thin: the
// work is in `_lib/publishing.ts`, where a test injects the container and the cookie jar.
// Whatever changes what a visitor sees also revalidates the public index and the list, so
// the next request renders the new state (FR-058, FR-090).

/** Every page whose content a publishing change moves. */
function revalidate(): void {
  revalidatePath("/cats");
  revalidatePath("/cats/[slugAndId]", "page");
  revalidatePath("/builder");
}

/** Publishes the draft; refused with the full list of problems while anything is missing (FR-060). */
export async function publish(input: PublishActionInput): Promise<PublishActionResult> {
  const result = await publishWith(getContainer(), input);
  if (result.ok) revalidate();
  return result;
}

/** Takes the cat off the site at once, from live or archived (FR-058). */
export async function unpublish(
  input: PublishActionInput,
): Promise<ActionResult<Record<never, never>>> {
  const result = await unpublishWith(getContainer(), input);
  if (result.ok) revalidate();
  return result;
}

/** Archives a live cat: its page comes down, its draft stays (FR-086). */
export async function archive(
  input: PublishActionInput,
): Promise<ActionResult<Record<never, never>>> {
  const result = await archiveWith(getContainer(), input);
  if (result.ok) revalidate();
  return result;
}

/** Restores an archived cat exactly as it was and answers its address (FR-087). */
export async function restore(input: PublishActionInput): Promise<ActionResult<{ url: string }>> {
  const result = await restoreWith(getContainer(), input);
  if (result.ok) revalidate();
  return result;
}
