import { getContainer } from "@/adapters/container";
import { serveDerived } from "@/app/api/_lib/derived";

// `/media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` — one derived revision, streamed by
// this app under every store (F23; contracts/server-boundary.md). The whole contract —
// `Range`, `ETag`, `HEAD`, the cache header, the one error shape — is in `serveDerived`.

type Params = { params: Promise<{ path: string[] }> };

/** The bytes of one derived revision: `200`, `206` for a `Range`, `304`, `416`, `404` or `502`. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  return serveDerived(getContainer(), request, (await params).path.join("/"));
}

/** The headers `GET` would answer with, and no body. */
export async function HEAD(request: Request, { params }: Params): Promise<Response> {
  return serveDerived(getContainer(), request, (await params).path.join("/"));
}
