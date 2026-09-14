import { getContainer } from "@/adapters/container";
import { listCarousel } from "@/app/api/_lib/carousel";

/** Read on every request, so a publish, an unpublish or an archive shows without a restart. */
export const dynamic = "force-dynamic";

/** `GET /api/carousel` — public, every live cat, most recently published first (contracts/server-boundary.md). */
export async function GET(): Promise<Response> {
  return listCarousel(getContainer());
}
