import type { NextRequest } from "next/server";
import type { Container } from "@/adapters/container";
import { requireSession } from "@/app/api/_lib/session";
import { respond } from "@/app/api/_lib/respond";
import { NotFoundError, parseOrThrow } from "@/core/errors";
import { capRange, parseByteRange } from "@/core/media/byte-range";
import { loadAsset } from "@/core/media/migrations";
import type { MediaAsset } from "@/core/media/schema";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// `GET /api/profiles/{id}/media/{mid}/original` (contracts/server-boundary.md; ADR-006):
// the private original of a video, streamed with `Range` support so the trim editor's
// `<video>` can seek. Only a video of this cat is ever served, to a signed-in volunteer —
// a photo's original is not served to anyone (FR-075). Every answer is a `206` of at most
// `MAX_RANGE_BYTES` (Cloud Run refuses an HTTP/1 response over 32 MiB).

/** What the route needs from the container. */
export type OriginalDeps = Pick<Container, "mediaStore" | "logger" | "readSession">;

/** The 404 for anything that is not a video of this cat, stored or not. */
const NO_SUCH_CLIP = "There's no clip at this address.";

/** The video record for `mid` of `pid`, or `not_found` — a photo included. */
async function videoAsset(deps: OriginalDeps, pid: string, mid: string): Promise<MediaAsset> {
  const stored = await deps.mediaStore.readAsset(pid, mid);
  if (stored === null) throw new NotFoundError(NO_SUCH_CLIP);
  const asset = loadAsset(stored);
  if (asset.kind !== "video") throw new NotFoundError(NO_SUCH_CLIP);
  return asset;
}

/** The `206` for one satisfiable range, or the `416` naming the size for one that is not. */
async function partial(
  deps: OriginalDeps,
  asset: MediaAsset,
  ids: { pid: string; mid: string },
  header: string,
  size: number,
): Promise<Response> {
  const range = parseByteRange(header, size);
  if (range !== null) {
    const capped = capRange(range);
    const slice = await deps.mediaStore.readRange(ids.pid, ids.mid, capped);
    if (slice !== null) {
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": asset.mimeType,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${capped.start}-${capped.start + slice.byteLength - 1}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }
  return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
}

/**
 * Serves the original of the video `params.mid` of the cat `params.id`: the first slice as
 * a `206` when no `Range` is sent, or the one range a `Range` header asks for as a `206`
 * with its `Content-Range`, or `416` for a range the file cannot satisfy. Errors take the
 * one shape: `401` without a session (checked before any lookup), `400` for a malformed id,
 * `404` for anything that is not a video of this cat.
 */
export async function serveOriginal(
  deps: OriginalDeps,
  request: NextRequest,
  params: { id: string; mid: string },
): Promise<Response> {
  try {
    await requireSession(request, deps.readSession);
    const pid = parseOrThrow(ProfileIdSchema, params.id);
    const mid = parseOrThrow(MediaIdSchema, params.mid);
    const asset = await videoAsset(deps, pid, mid);
    const size = await deps.mediaStore.originalSize(pid, mid);
    if (size === null) throw new NotFoundError(NO_SUCH_CLIP);
    // No `Range` is read as `bytes=0-`: a capped `206` is always a legal answer for a
    // resource that says `Accept-Ranges: bytes`, and the whole file never goes in one
    // response (Cloud Run refuses one over 32 MiB — the trim preview's 500s).
    const header = request.headers.get("range") ?? "bytes=0-";
    return await partial(deps, asset, { pid, mid }, header, size);
  } catch (error) {
    return respond(error, deps.logger);
  }
}
