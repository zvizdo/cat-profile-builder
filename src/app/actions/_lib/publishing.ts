import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import {
  archive,
  publish,
  restore,
  unpublish,
  type PublishDeps,
  type PublishResult,
} from "@/adapters/pipeline/publish";
import { withSession, type ActionResult, type GetCookies } from "@/app/actions/_lib/guard";
import type { ErrorBody } from "@/app/api/_lib/respond";
import { parseOrThrow } from "@/core/errors";
import { readinessSummary } from "@/core/profile/readiness";
import { ProfileIdSchema } from "@/core/profile/schema";

// The logic behind the four publishing Server Actions in `src/app/actions/publishing.ts`
// (contracts/server-boundary.md rows `publish`, `unpublish`, `archive`, `restore`). Each
// does three things: re-check the session (`withSession`, ADR-011), validate `{ id }`, and
// call the one pipeline function. `publish` alone has a third answer — refused, with every
// problem — which is mapped here so the wrapper stays the same for every action.

/** What the publishing actions take from the container. */
export type PublishingDeps = PublishDeps & Pick<Container, "readSession">;

/** What every publishing action takes. */
export const PublishActionInputSchema = z.strictObject({ id: ProfileIdSchema });

export type PublishActionInput = z.infer<typeof PublishActionInputSchema>;

/** The code a refused publish carries: the same `refused` every rule-based denial uses. */
export const NOT_READY_CODE = "refused";

/**
 * What `publish` answers: the address and any warnings; or refused with the full list of
 * problems (FR-060) and the one summary sentence; or the shared error shape.
 */
export type PublishActionResult =
  | { ok: true; url: string; warnings: string[] }
  | ({ ok: false; problems: string[] } & ErrorBody)
  | ({ ok: false } & ErrorBody);

/** `input` as the pipeline's `{ profileId }`, or `invalid`. */
function target(input: unknown): { profileId: string } {
  return { profileId: parseOrThrow(PublishActionInputSchema, input).id };
}

/** Publishes the draft; refused, listing every problem, while anything is missing. */
export async function publishWith(
  deps: PublishingDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<PublishActionResult> {
  const guarded = withSession<[], PublishResult>(
    deps,
    () => publish(deps, target(input)),
    getCookies,
  );
  const result = await guarded();
  if (!result.ok) return result;
  if (!result.published) {
    const message = readinessSummary(result.problems);
    return { ok: false, error: { code: NOT_READY_CODE, message }, problems: result.problems };
  }
  return { ok: true, url: result.url, warnings: result.warnings };
}

/** Takes the cat off the site at once, from live or archived (FR-058). */
export function unpublishWith(
  deps: PublishingDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<Record<never, never>>> {
  return withSession(deps, () => unpublish(deps, target(input)), getCookies)();
}

/** Archives a live cat (FR-086); refused from any other state. */
export function archiveWith(
  deps: PublishingDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<Record<never, never>>> {
  return withSession(deps, () => archive(deps, target(input)), getCookies)();
}

/** Restores an archived cat exactly as it was (FR-087); refused from any other state. */
export function restoreWith(
  deps: PublishingDeps,
  input: unknown,
  getCookies?: GetCookies,
): Promise<ActionResult<{ url: string }>> {
  return withSession(deps, () => restore(deps, target(input)), getCookies)();
}
