import "server-only";
import type { Config } from "@/adapters/config";
import type { Container } from "@/adapters/container";
import { assetView, type AssetView } from "@/adapters/pipeline/asset-view";
import { listMetadata } from "@/adapters/pipeline/list-metadata";
import { readAssets } from "@/adapters/pipeline/read-assets";
import { withSession, type ActionResult, type GetCookies } from "@/app/actions/_lib/guard";
import {
  InternalError,
  NotFoundError,
  parseOrThrow,
  ProfileInvalidError,
  RefusedError,
} from "@/core/errors";
import type { ProfileState } from "@/core/ports";
import { loadProfile, loadPublished } from "@/core/profile/migrations";
import { publicAddress } from "@/core/profile/slug";
import {
  ProfileDocumentSchema,
  ProfileIdSchema,
  type ProfileDocument,
} from "@/core/profile/schema";

// The logic behind the four profile Server Actions in `src/app/actions/profiles.ts`
// (contracts/server-boundary.md). It lives here, outside the `"use server"` file, so the
// container and the cookie jar can be injected by a test. Every function re-checks the
// session through `withSession` (ADR-011) and answers `{ ok: true, … } | { ok: false, error }`.

/** What the profile actions need from the container. */
export type ProfileDeps = Pick<
  Container,
  "profileStore" | "mediaStore" | "ids" | "clock" | "logger" | "readSession"
> & { config: Pick<Config, "PUBLIC_BASE_URL"> };

/** One row of the list page (contracts/server-boundary.md → `listProfiles`). */
export interface ProfileSummary {
  id: string;
  name: string;
  /** The display line, so two tabbies can be told apart on a card. */
  line: string;
  thumbnailUrl: string | null;
  state: ProfileState;
  updatedAt: string;
}

/**
 * What the builder shell opens with: the validated document, its media records as views,
 * where the cat stands, and — while a published copy exists, live or archived — its public
 * address (the archived one answers 404 until restored).
 */
export interface LoadedDraft {
  document: ProfileDocument;
  assets: AssetView[];
  state: ProfileState;
  url: string | null;
}

/** The one sentence a volunteer sees for a stored document that fails its schema (FR-018). */
export const UNREADABLE_MESSAGE = "This profile couldn't be read.";

/** The refusal for deleting a live or archived cat (FR-092). */
export const UNPUBLISH_FIRST = "Unpublish first.";

/** The 404 for an id no cat has. */
const NO_SUCH_CAT = "There's no cat with that id.";

/** How many ids `createProfile` tries: the first and one retry (contracts/server-boundary.md). */
const ID_ATTEMPTS = 2;

/**
 * `list()` mapped to summaries, most recently edited first. `thumbnailUrl` is resolved here
 * (F30), not stored: each row's `{mid, rev}` pair is turned into a URL through
 * `MediaStore.publicUrl`, so a URL scheme change is picked up on the next list, never
 * frozen into a stale stamp.
 */
export function listProfilesWith(
  deps: ProfileDeps,
  getCookies?: GetCookies,
): Promise<ActionResult<{ profiles: ProfileSummary[] }>> {
  return withSession(
    deps,
    async () => {
      const rows = await deps.profileStore.list();
      const profiles = rows
        .map((row) => ({
          id: row.pid,
          name: row.name,
          line: row.line,
          thumbnailUrl:
            row.thumbnail === null
              ? null
              : deps.mediaStore.publicUrl(row.pid, row.thumbnail.mid, "clean", row.thumbnail.rev),
          state: row.state,
          updatedAt: row.updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { profiles };
    },
    getCookies,
  )();
}

/**
 * The document a new cat starts from (F1): no name, the empty hero every profile is
 * mandatory and fixed at the top of, no other sections, the paper theme at its defaults.
 */
function emptyDocument(id: string, heroId: string, updatedAt: string): ProfileDocument {
  return parseOrThrow(ProfileDocumentSchema, {
    schemaVersion: 1,
    id,
    name: "",
    blocks: [{ id: heroId, type: "hero", mediaId: null }],
    theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
    updatedAt,
  });
}

/** The first id from the source that no cat has yet, trying {@link ID_ATTEMPTS} times. */
async function freeId(deps: ProfileDeps): Promise<string> {
  for (let attempt = 0; attempt < ID_ATTEMPTS; attempt += 1) {
    const id = deps.ids.profileId();
    if (!(await deps.profileStore.exists(id))) return id;
  }
  throw new InternalError(`No free profile id after ${ID_ATTEMPTS} attempts.`);
}

/** Writes an empty draft under a fresh id and answers `{ id }`. Only the "New cat" button calls it. */
export function createProfileWith(
  deps: ProfileDeps,
  getCookies?: GetCookies,
): Promise<ActionResult<{ id: string }>> {
  return withSession(
    deps,
    async () => {
      const id = await freeId(deps);
      const heroId = deps.ids.blockId();
      const updatedAt = deps.clock.now().toISOString();
      const doc = emptyDocument(id, heroId, updatedAt);
      const meta = { ...listMetadata(doc, []), updatedAt };
      await deps.profileStore.writeDraft(id, doc, meta);
      return { id };
    },
    getCookies,
  )();
}

/**
 * The stored draft through `loadProfile` — migrate, then parse (contracts/profile-document.md,
 * guarantee 3). A document that fails is reported as {@link UNREADABLE_MESSAGE} with the
 * failing paths logged, never repaired.
 */
async function readDocument(deps: ProfileDeps, id: string): Promise<ProfileDocument> {
  const stored = await deps.profileStore.readDraft(id);
  if (stored === null) throw new NotFoundError(NO_SUCH_CAT);
  try {
    return loadProfile(stored);
  } catch (error) {
    if (error instanceof ProfileInvalidError) {
      deps.logger.warn({ pid: id, paths: error.paths }, "draft failed validation");
      throw new ProfileInvalidError(UNREADABLE_MESSAGE, error.issues, { cause: error });
    }
    throw error;
  }
}

/**
 * Where the cat stands and its public address: `live` while `published.json` exists,
 * `archived` while `archived.json` does, else `draft` with no address. The address is
 * built from the published copy's own slug, so it is the one a visitor uses.
 */
async function publication(
  deps: ProfileDeps,
  pid: string,
): Promise<Pick<LoadedDraft, "state" | "url">> {
  const live = await deps.profileStore.readPublished(pid);
  const stored = live ?? (await deps.profileStore.readArchived(pid));
  if (stored === null) return { state: "draft", url: null };
  const url = publicAddress(deps.config.PUBLIC_BASE_URL, loadPublished(stored).slug, pid);
  return { state: live === null ? "archived" : "live", url };
}

/** The validated draft, its media records as views and its publication, or `not_found`, or `invalid` with the one sentence. */
export function loadDraftWith(
  deps: ProfileDeps,
  id: string,
  getCookies?: GetCookies,
): Promise<ActionResult<LoadedDraft>> {
  return withSession(
    deps,
    async () => {
      const pid = parseOrThrow(ProfileIdSchema, id);
      const document = await readDocument(deps, pid);
      const assets = await readAssets(deps, pid);
      return {
        document,
        assets: assets.map((asset) => assetView(deps.mediaStore, pid, asset)),
        ...(await publication(deps, pid)),
      };
    },
    getCookies,
  )();
}

/**
 * Removes a draft cat — documents and media, both buckets (ADR-015). A live or archived cat
 * is refused with {@link UNPUBLISH_FIRST} (FR-092); the UI confirms before calling this.
 */
export function deleteProfileWith(
  deps: ProfileDeps,
  id: string,
  getCookies?: GetCookies,
): Promise<ActionResult<Record<never, never>>> {
  return withSession(
    deps,
    async () => {
      const pid = parseOrThrow(ProfileIdSchema, id);
      const { profileStore } = deps;
      if (!(await profileStore.exists(pid))) throw new NotFoundError(NO_SUCH_CAT);
      const published =
        (await profileStore.readPublished(pid)) ?? (await profileStore.readArchived(pid));
      if (published !== null) throw new RefusedError(UNPUBLISH_FIRST);
      await profileStore.delete(pid);
      return {};
    },
    getCookies,
  )();
}
