import type { NextRequest } from "next/server";
import type { Container } from "@/adapters/container";
import { listMetadata } from "@/adapters/pipeline/list-metadata";
import { readAssets } from "@/adapters/pipeline/read-assets";
import { requireSession } from "@/app/api/_lib/session";
import { respond } from "@/app/api/_lib/respond";
import { NotFoundError, parseOrThrow, ProfileInvalidError } from "@/core/errors";
import { ProfileDocumentSchema, ProfileIdSchema } from "@/core/profile/schema";

// The draft save (`PUT /api/profiles/{id}/draft`, contracts/server-boundary.md; ADR-015 →
// Draft saves). A Route Handler rather than a Server Action so a `keepalive` save on
// `pagehide` still lands. The body is the whole document; it is validated, `updatedAt` is
// stamped, and `draft.json` is overwritten with the list metadata — last write wins.

/** What the save needs from the container. */
export type DraftDeps = Pick<
  Container,
  "profileStore" | "mediaStore" | "clock" | "logger" | "readSession"
>;

/** The 404 for an id no cat has: a save never creates a cat, and never resurrects a deleted one. */
const NO_SUCH_CAT = "There's no cat with that id.";

/** The request body as `unknown`; a body that is not JSON is `invalid`, not a crash. */
async function jsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new ProfileInvalidError("The request body isn't JSON.", [], { cause: error });
  }
}

/**
 * Validates and stores the draft in the body for the cat at `id`, answering
 * `{ updatedAt }` with the stamp it wrote. Errors take the one shape: `401` without a
 * session (checked before the body is read), `400` for a bad id, a body that fails the
 * schema or one whose `id` is not the path's, `404` for a cat that does not exist. The
 * list metadata — name, display line, thumbnail — is computed by `listMetadata` from the
 * document and the cat's media records, so the list never reads a document.
 */
export async function saveDraft(
  deps: DraftDeps,
  request: NextRequest,
  id: string,
): Promise<Response> {
  try {
    await requireSession(request, deps.readSession);
    const pid = parseOrThrow(ProfileIdSchema, id);
    const body = parseOrThrow(ProfileDocumentSchema, await jsonBody(request));
    if (body.id !== pid) {
      throw new ProfileInvalidError("The document's id doesn't match the address.", [
        { path: "id", message: "Must equal the path id." },
      ]);
    }
    if (!(await deps.profileStore.exists(pid))) throw new NotFoundError(NO_SUCH_CAT);
    const updatedAt = deps.clock.now().toISOString();
    const doc = { ...body, updatedAt };
    const assets = await readAssets(deps, pid);
    const meta = { ...listMetadata(doc, assets), updatedAt };
    await deps.profileStore.writeDraft(pid, doc, meta);
    return Response.json({ updatedAt });
  } catch (error) {
    return respond(error, deps.logger);
  }
}
