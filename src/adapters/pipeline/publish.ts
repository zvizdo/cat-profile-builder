import "server-only";
import { z } from "zod";
import type { Config } from "@/adapters/config";
import type { Container } from "@/adapters/container";
import { NotFoundError, parseOrThrow } from "@/core/errors";
import { resolveManifest } from "@/core/media/manifest";
import { loadProfile, loadPublished } from "@/core/profile/migrations";
import { checkReadiness } from "@/core/profile/readiness";
import { ProfileIdSchema, PublishedDocumentSchema } from "@/core/profile/schema";
import { publicAddress, slugify } from "@/core/profile/slug";
import { readAssets } from "./read-assets";

// Publishing (ADR-015 → Publish freezes the page; FR-055–FR-060, FR-074, FR-083, FR-086,
// FR-087): the draft is read, judged by `checkReadiness`, resolved into a manifest and
// written as one validated `published.json`; the draft is never touched, so editing it
// changes nothing a visitor sees until the next publish. Unpublish, archive and restore
// move or remove that one object through the store, byte for byte. Every rule lives in
// core; this file only orders the calls.

/** What every publishing call takes: the cat. */
export const PublishInputSchema = z.strictObject({ profileId: ProfileIdSchema });

export type PublishInput = z.infer<typeof PublishInputSchema>;

/** What publishing takes from the container. */
export type PublishDeps = Pick<Container, "profileStore" | "mediaStore" | "clock" | "logger"> & {
  config: Pick<Config, "PUBLIC_BASE_URL">;
};

/** Published, with the page's address and any warnings; or refused, with every problem. */
export type PublishResult =
  { published: true; url: string; warnings: string[] } | { published: false; problems: string[] };

/** The 404 for an id no cat has. */
const NO_SUCH_CAT = "There's no cat with that id.";

/** `{PUBLIC_BASE_URL}/cats/{slug}-{pid}` — the address a volunteer shares (FR-057). */
function publicUrl(deps: PublishDeps, slug: string, pid: string): string {
  return publicAddress(deps.config.PUBLIC_BASE_URL, slug, pid);
}

async function requireCat(deps: PublishDeps, pid: string): Promise<void> {
  if (!(await deps.profileStore.exists(pid))) throw new NotFoundError(NO_SUCH_CAT);
}

/**
 * Makes the draft live. `not_found` for an unknown cat; `invalid` for a draft that fails
 * its schema; refused — with every `checkReadiness` problem, and nothing written — while
 * anything is missing. The contrast warning comes back in `warnings` and never blocks
 * (FR-031, Waiver 3). On success `published.json` holds the draft plus `publishedAt`, the
 * slug of the current name and the manifest, validated as a whole before it is written; an
 * archive under the same id is replaced.
 */
export async function publish(deps: PublishDeps, input: PublishInput): Promise<PublishResult> {
  const pid = input.profileId;
  const stored = await deps.profileStore.readDraft(pid);
  if (stored === null) throw new NotFoundError(NO_SUCH_CAT);
  const doc = loadProfile(stored);
  const assets = await readAssets(deps, pid);
  const { problems, warnings } = checkReadiness(doc, assets);
  if (problems.length > 0) return { published: false, problems };
  const slug = slugify(doc.name);
  const media = resolveManifest(doc, assets, deps.mediaStore);
  const publishedAt = deps.clock.now().toISOString();
  const published = parseOrThrow(PublishedDocumentSchema, { ...doc, publishedAt, slug, media });
  await deps.profileStore.writePublished(pid, published);
  deps.logger.info({ pid, slug }, "published");
  return { published: true, url: publicUrl(deps, slug, pid), warnings };
}

/**
 * Takes the cat off the site at once (FR-058): removes `published.json` or `archived.json`,
 * whichever exists, and keeps the draft. A cat that is already a draft is left as it is.
 */
export async function unpublish(
  deps: PublishDeps,
  input: PublishInput,
): Promise<Record<never, never>> {
  await requireCat(deps, input.profileId);
  await deps.profileStore.deletePublished(input.profileId);
  await deps.profileStore.deleteArchived(input.profileId);
  deps.logger.info({ pid: input.profileId }, "unpublished");
  return {};
}

/** Moves the live page to the archive (FR-086); refused, in the store's words, unless live. */
export async function archive(
  deps: PublishDeps,
  input: PublishInput,
): Promise<Record<never, never>> {
  await requireCat(deps, input.profileId);
  await deps.profileStore.archive(input.profileId);
  return {};
}

/**
 * Moves the archived page back exactly as it was (FR-087) and answers its address; refused,
 * in the store's words, unless archived.
 */
export async function restore(deps: PublishDeps, input: PublishInput): Promise<{ url: string }> {
  const pid = input.profileId;
  await requireCat(deps, pid);
  await deps.profileStore.restore(pid);
  const page = loadPublished(await deps.profileStore.readPublished(pid));
  return { url: publicUrl(deps, page.slug, pid) };
}
