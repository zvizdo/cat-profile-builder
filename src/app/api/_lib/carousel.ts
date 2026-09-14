import type { Container } from "@/adapters/container";
import { respond } from "@/app/api/_lib/respond";
import { buildRoster, type CarouselCat } from "@/core/carousel/roster";
import { loadPublished } from "@/core/profile/migrations";

// `GET /api/carousel` (contracts/server-boundary.md; FR-059, FR-061): public, every live
// profile as its roster entry, most recently published first. A `listPublished()` failure
// propagates to `respond()` unchanged — the shared `502 upstream` shape, no store detail.

/** What the route needs from the container. */
export type CarouselDeps = Pick<Container, "profileStore" | "logger"> & {
  config: Pick<Container["config"], "PUBLIC_BASE_URL">;
};

/**
 * Every live cat as its roster entry, for the route and the `/carousel` page alike. Each
 * stored copy is read through `loadPublished`, the same validation every other public
 * surface uses — a document that fails it is a real failure (this app never writes an
 * invalid one) and propagates rather than being silently skipped.
 */
export async function loadRoster(
  deps: Pick<CarouselDeps, "profileStore" | "config">,
): Promise<CarouselCat[]> {
  const rows = await deps.profileStore.listPublished();
  const docs = rows.map((row) => loadPublished(row.doc));
  return buildRoster(docs, deps.config.PUBLIC_BASE_URL);
}

/** `{ cats: CarouselCat[] }` for every live cat; a store failure is the shared 502. */
export async function listCarousel(deps: CarouselDeps): Promise<Response> {
  try {
    return Response.json({ cats: await loadRoster(deps) });
  } catch (error) {
    return respond(error, deps.logger);
  }
}
