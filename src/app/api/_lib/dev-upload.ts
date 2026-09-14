import { resolve } from "node:path";
import type { NextRequest } from "next/server";
import type { Container } from "@/adapters/container";
import { writeOriginal } from "@/adapters/fs/dev-upload";
import { requireSession } from "@/app/api/_lib/session";
import { respond } from "@/app/api/_lib/respond";
import { NotFoundError, parseOrThrow } from "@/core/errors";
import { LIMITS } from "@/core/media/validation";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// `PUT /api/dev-upload/{pid}/{mid}` — where the filesystem MediaStore's `createSignedUpload`
// sends a browser (ADR-015 → Local development). Under any other store the route does not
// exist, so a deployment never grows a write path into its bucket through this app.

/** What the route needs from the container. */
export type DevUploadDeps = Pick<Container, "logger" | "readSession" | "profileStore"> & {
  config: Pick<Container["config"], "STORE" | "DATA_DIR">;
};

/** The 404 for every store but `fs` — the same sentence the `/media` route uses. */
const NOT_HERE = "There is no file at this address.";

/** The 404 for a `pid` `beginUpload` never signed an upload for (T040 security review, L3). */
const NO_SUCH_CAT = "There's no cat with that id.";

/**
 * Lands the request body as the original of `mid` under the cat `id`: `404` unless
 * `STORE=fs`, `401` without a session, `400` for a malformed id or no body, `404` for a
 * profile that does not exist, `409` if that original was already finalized (T040 L3),
 * `413` past the largest upload the app accepts; otherwise `200` with an empty body, like a
 * bucket's upload answer. The stream is capped and written atomically by `writeOriginal`.
 */
export async function acceptDevUpload(
  deps: DevUploadDeps,
  request: NextRequest,
  params: { id: string; mid: string },
): Promise<Response> {
  try {
    if (deps.config.STORE !== "fs") throw new NotFoundError(NOT_HERE);
    await requireSession(request, deps.readSession);
    const pid = parseOrThrow(ProfileIdSchema, params.id);
    const mid = parseOrThrow(MediaIdSchema, params.mid);
    // Refuses an upload for a cat `beginUpload` never minted a media id under — the fs
    // stand-in for a signed URL scoped to one real bucket object.
    if (!(await deps.profileStore.exists(pid))) throw new NotFoundError(NO_SUCH_CAT);
    // A relative DATA_DIR resolves from where the server started, as the container does.
    await writeOriginal(resolve(deps.config.DATA_DIR), pid, mid, request.body, LIMITS.videoBytes);
    return new Response(null, { status: 200 });
  } catch (error) {
    return respond(error, deps.logger);
  }
}
