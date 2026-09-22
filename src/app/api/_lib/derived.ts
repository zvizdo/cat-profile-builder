import type { Container } from "@/adapters/container";
import { respond } from "@/app/api/_lib/respond";
import { NotFoundError } from "@/core/errors";
import {
  capRange,
  parseRangeHeader,
  resolveRange,
  type RangeRequest,
} from "@/core/media/byte-range";
import { MEDIA_ROUTE, parsePublicMediaPath, type PublicMediaPath } from "@/core/media/public-path";
import type { DerivedKind, DerivedStream } from "@/core/ports";

// `GET`/`HEAD /media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` (contracts/server-boundary.md;
// F23): one derived revision, streamed by this app under every store — no bucket carries a
// public grant, so nothing else can serve it. Nothing here touches a path: the URL is parsed
// into the four ids of the ADR-015 grammar (`parsePublicMediaPath`, the same rule the schema
// and the stores use) and read back through the MediaStore port, so `..` or any name outside
// `profiles/{pid}/media/{mid}/` cannot even be expressed. A rev never changes meaning, so
// every answer is cacheable forever and the rev itself is the entity tag: `If-None-Match`
// is a `304`, a `Range` is a `206` (a published page's `<video>` seeks), one that starts past
// the end a `416`, one outside the `bytes=` grammar ignored (RFC 9110 §14.2 — the whole
// file), and a `HEAD` the headers alone. Bytes go straight from the store's stream to the
// response — a clip is never buffered — and the store's streams open lazily, so a `HEAD`,
// a `304` or a size lookup costs one metadata read and no object read at all.

/** What the route needs from the container. */
export type DerivedDeps = Pick<Container, "mediaStore" | "logger">;

const CONTENT_TYPE: Record<DerivedKind, string> = {
  clean: "image/jpeg",
  poster: "image/jpeg",
  web: "video/mp4",
};

/** What every derived file is served with (ADR-015): cached forever, never revalidated. */
export const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** For a name outside the grammar or a rev never written. */
const NOT_FOUND = "There is no file at this address.";

/** The strong entity tag of a revision: the rev, quoted. */
function etagOf(rev: string): string {
  return `"${rev}"`;
}

/** Whether an `If-None-Match` header names `etag` (weak or strong) or every tag. */
function matches(header: string, etag: string): boolean {
  return header.split(",").some((tag) => {
    const trimmed = tag.trim();
    return trimmed === "*" || trimmed === etag || trimmed === `W/${etag}`;
  });
}

/** The headers every answer about `path` carries, whatever its status. */
function baseHeaders(path: PublicMediaPath): Record<string, string> {
  return {
    "Content-Type": CONTENT_TYPE[path.kind],
    "Cache-Control": CACHE_CONTROL,
    "Accept-Ranges": "bytes",
    ETag: etagOf(path.rev),
  };
}

/** Lets go of a stream the response will not carry, so a file handle never waits on it. */
async function discard(read: DerivedStream): Promise<void> {
  if (read.stream !== null) await read.stream.cancel();
}

/** One read through the port, or the `404` for a rev never written. */
async function read(
  deps: DerivedDeps,
  { pid, mid, kind, rev }: PublicMediaPath,
  range?: { start: number; end: number },
): Promise<DerivedStream> {
  const result = await deps.mediaStore.readDerivedRange(pid, mid, kind, rev, range);
  if (result === null) throw new NotFoundError(NOT_FOUND);
  return result;
}

/** The `416` naming `size`, for a range the file cannot satisfy. */
function unsatisfiable(path: PublicMediaPath, size: number): Response {
  return new Response(null, {
    status: 416,
    headers: { ...baseHeaders(path), "Content-Range": `bytes */${size}` },
  });
}

/**
 * The `206` for the range `header` asks for, or the `416` naming the size for a parsed
 * range the file cannot satisfy — or `null` for a header outside the grammar (another
 * unit, several ranges, letters), which RFC 9110 §14.2 says to ignore: the caller answers
 * the whole file. A range with a start goes to the store as it is (the store clamps the end
 * and reports a start past the last byte); a suffix range needs the size first. A slice
 * never spans more than `MAX_RANGE_BYTES`; the player asks for the rest.
 */
async function partial(
  deps: DerivedDeps,
  path: PublicMediaPath,
  header: string,
): Promise<Response | null> {
  const request: RangeRequest | null = parseRangeHeader(header);
  if (request === null) return null;
  let slice: DerivedStream;
  if ("start" in request) {
    slice = await read(
      deps,
      path,
      capRange({ start: request.start, end: request.end ?? Infinity }),
    );
  } else {
    const whole = await read(deps, path);
    await discard(whole);
    const range = resolveRange(request, whole.size);
    if (range === null) return unsatisfiable(path, whole.size);
    slice = await read(deps, path, capRange(range));
  }
  if (slice.stream === null) return unsatisfiable(path, slice.size);
  return new Response(slice.stream, {
    status: 206,
    headers: {
      ...baseHeaders(path),
      "Content-Length": String(slice.end - slice.start + 1),
      "Content-Range": `bytes ${slice.start}-${slice.end}/${slice.size}`,
    },
  });
}

/**
 * Serves the derived revision `name` names (the URL after `/media/`): the whole file as a
 * `200` stream, the one range a `Range` header asks for as a `206`, `416` for a range the
 * file cannot satisfy, `304` when `If-None-Match` carries the rev, and for `HEAD` the same
 * headers with no body. Errors take the one shape: `404` for a name outside the grammar or
 * a rev never written, `502` when the store failed.
 */
export async function serveDerived(
  deps: DerivedDeps,
  request: Request,
  name: string,
): Promise<Response> {
  try {
    const path = parsePublicMediaPath(`${MEDIA_ROUTE}/${name}`);
    if (path === null) throw new NotFoundError(NOT_FOUND);
    const ifNoneMatch = request.headers.get("if-none-match");
    const revalidating = ifNoneMatch !== null && matches(ifNoneMatch, etagOf(path.rev));
    const range = request.headers.get("range");
    const isHead = request.method === "HEAD";
    // A `HEAD` ignores `Range`; a matching `If-None-Match` wins over it (RFC 9110 §13.2.2);
    // a `Range` outside the grammar is ignored too, and the whole file follows.
    if (range !== null && !isHead && !revalidating) {
      const response = await partial(deps, path, range);
      if (response !== null) return response;
    }
    const whole = await read(deps, path);
    if (revalidating) {
      await discard(whole);
      return new Response(null, { status: 304, headers: baseHeaders(path) });
    }
    const headers = { ...baseHeaders(path), "Content-Length": String(whole.size) };
    if (isHead) {
      await discard(whole);
      return new Response(null, { status: 200, headers });
    }
    return new Response(whole.stream, { status: 200, headers });
  } catch (error) {
    return respond(error, deps.logger);
  }
}
